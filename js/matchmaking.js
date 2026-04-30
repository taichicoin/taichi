// ==================== 匹配系统【终极修复版 + 双缓冲商店初始化】 ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 核心状态（新增状态锁，防止并发修改）
    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;
    let checkRoomPollTimer = null; // 新增：人数校验兜底轮询定时器
    let isMatching = false;
    let isProcessing = false; // 新增：操作锁，防止重复执行核心逻辑
    let subscribeRetryCount = 0; // 新增：订阅重试计数
    const MAX_SUBSCRIBE_RETRY = 3; // 最大订阅重试次数

    // 日志工具
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console[isError ? 'error' : 'log'](`[匹配系统] ${msg}`);
        }
    }

    // UI状态更新
    function updateStatus(text, show = true) {
        const el = document.getElementById('match-status');
        if (el) {
            el.style.display = show ? 'block' : 'none';
            el.textContent = text;
        }
    }

    // 【修复】全量状态重置，所有定时器/订阅一次性清干净，无残留
    function resetUI() {
        // 先锁状态，防止中途触发其他逻辑
        isMatching = false;
        isProcessing = false;
        subscribeRetryCount = 0;

        // 重置按钮
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            const hasUsername = auth?.currentProfile?.username;
            startBtn.disabled = !hasUsername;
            startBtn.textContent = hasUsername ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        // 重置状态文本
        updateStatus('', false);
        // 隐藏取消按钮
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';

        log('✅ UI状态已全量重置');
    }

    // 【修复】全量资源清理，新增兜底轮询定时器清理，幂等性保证
    function cleanup() {
        // 清理房间订阅
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
            log('✅ 旧房间订阅已清理');
        }
        // 清理匹配超时定时器
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
            log('✅ 匹配超时定时器已清理');
        }
        // 【新增】清理人数校验兜底轮询
        if (checkRoomPollTimer) {
            clearInterval(checkRoomPollTimer);
            checkRoomPollTimer = null;
            log('✅ 人数校验兜底轮询已清理');
        }
        // 重置核心状态
        isMatching = false;
        isProcessing = false;
        currentRoom = null;
    }

    // 【修复】残留房间清理，原子化操作，防止误删刚加入的房间
    async function cleanPlayerResidualRooms(uid, excludeRoomId = null) {
        if (!uid) return;
        log(`🧹 正在清理玩家 ${uid.slice(0,8)} 的残留房间...`);
        
        // 1. 先查玩家所在的所有房间（排除当前要加入的房间）
        let query = supabase.from('room_players').select('room_id').eq('player_id', uid);
        if (excludeRoomId) query = query.neq('room_id', excludeRoomId);
        const { data: myRooms } = await query;
        const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];

        // 2. 批量删除玩家的残留房间记录（原子操作）
        if (roomIds.length > 0) {
            let deleteQuery = supabase.from('room_players').delete().eq('player_id', uid);
            if (excludeRoomId) deleteQuery = deleteQuery.neq('room_id', excludeRoomId);
            await deleteQuery;
            log(`✅ 玩家 ${roomIds.length} 条残留房间记录已删除`);
        }

        // 3. 逐个清理空房间
        for (const roomId of roomIds) {
            await cleanRoomIfEmpty(roomId);
        }
        log(`✅ 残留房间清理完成`);
    }

    // 清理空房间
    async function cleanRoomIfEmpty(roomId) {
        const { data: realPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);

        if (!realPlayers || realPlayers.length === 0) {
            log(`🧹 房间 ${roomId.slice(0,8)} 已无真人，执行彻底清理...`);
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('room_players').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
            log(`✅ 房间 ${roomId.slice(0,8)} 已彻底删除`);
        } else {
            log(`👥 房间 ${roomId.slice(0,8)} 仍有 ${realPlayers.length} 名真人，保留房间`);
        }
    }

    // 【修复】开始匹配，解决定时器竞态、操作锁、状态同步问题
    async function start() {
        // 操作锁，防止重复点击/并发执行
        if (isProcessing || isMatching) { 
            log('⚠️ 匹配已在进行中，请勿重复操作'); 
            return; 
        }
        isProcessing = true;

        // 前置校验
        const profile = auth?.currentProfile;
        const uid = auth?.currentUser?.id;
        if (!profile?.username || !uid) { 
            if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
            else console.error('请先设置游戏ID');
            isProcessing = false;
            return; 
        }

        // 【前置】全量清理旧资源，防止残留状态影响
        cleanup();
        isMatching = true;
        log('🔍 开始匹配...');
        
        // 更新UI
        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);
        const cancelBtn = document.getElementById('cancel-match-btn');
        cancelBtn.style.display = 'inline-block';

        // 先清理残留房间
        await cleanPlayerResidualRooms(uid);

        const myMmr = profile.mmr || config.INITIAL_MMR;
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const matchTimeout = config.MATCHMAKING_TIMEOUT_MS || 15000;

        try {
            // 查找等待中的房间
            let { data: waitingRooms } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .order('created_at', { ascending: true })
                .limit(1);
            let room = waitingRooms?.[0];

            // 没有房间就创建新房间
            if (!room) {
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({ 
                        status: 'waiting', 
                        max_players: maxPlayers,
                        created_at: new Date().toISOString()
                    })
                    .select('*')
                    .single();
                if (createError) throw createError;
                room = newRoom;
                log(`✅ 创建新房间: ${room.id.slice(0,8)}`);
            } else {
                log(`✅ 找到可加入房间: ${room.id.slice(0,8)}`);
            }

            // 检查是否已在房间中，幂等性处理
            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', uid)
                .maybeSingle();
            if (existing) {
                log('⚠️ 已在房间中，恢复订阅');
                currentRoom = room;
                // 【修复】加入房间成功后，再开启定时器和订阅
                startMatchTimers(room.id, matchTimeout);
                subscribeToRoom(room.id);
                isProcessing = false;
                return;
            }

            // 加入房间
            const { error: joinError } = await supabase.from('room_players').insert({
                room_id: room.id,
                player_id: uid,
                mmr_at_join: myMmr,
                health: config.INITIAL_HEALTH || 100,
                is_bot: false,
                is_ready: false,
                joined_at: new Date().toISOString()
            });
            if (joinError) throw joinError;

            // 【核心修复】房间加入成功、currentRoom赋值完成后，再开启定时器！彻底解决竞态
            currentRoom = room;
            startMatchTimers(room.id, matchTimeout);
            subscribeToRoom(room.id);
            log(`✅ 成功加入房间: ${room.id.slice(0,8)}`);

        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            cleanup();
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    // 【新增】统一开启匹配相关定时器，集中管理，防止分散导致的竞态
    function startMatchTimers(roomId, timeoutMs) {
        // 清理旧定时器
        if (matchmakingTimer) clearTimeout(matchmakingTimer);
        if (checkRoomPollTimer) clearInterval(checkRoomPollTimer);

        // 1. 超时补人机定时器（房间加入成功后才开启，保证currentRoom一定有值）
        matchmakingTimer = setTimeout(() => {
            handleTimeout(roomId);
        }, timeoutMs);
        log(`✅ 匹配超时定时器已开启，${timeoutMs/1000}秒后触发补人机`);

        // 2. 【新增】人数校验兜底轮询，每2秒执行一次，彻底解决事件丢失问题
        checkRoomPollTimer = setInterval(() => {
            if (!isMatching || !currentRoom) {
                clearInterval(checkRoomPollTimer);
                checkRoomPollTimer = null;
                return;
            }
            checkRoomFull(roomId);
        }, 2000);
        log(`✅ 人数校验兜底轮询已开启，每2秒执行一次`);
    }

    // 取消匹配
    async function cancel() {
        if (isProcessing) {
            log('⚠️ 正在处理匹配中，无法取消');
            return;
        }
        log('🛑 玩家取消匹配');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        
        // 先全量清理资源
        cleanup();
        // 清理残留房间
        if (uid) {
            await cleanPlayerResidualRooms(uid, roomId);
        }
        // 重置UI
        resetUI();
    }

    // 离开并彻底清理
    async function leaveAndClean() {
        log('🚪 主动退出，执行全量清理...');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        
        cleanup();
        if (uid) {
            await cleanPlayerResidualRooms(uid, roomId);
        }
        resetUI();
    }

    // 【修复】匹配超时处理，解决currentRoom空值、同步延迟、状态校验问题
    async function handleTimeout(roomId) {
        // 双重校验，防止无效触发
        if (!currentRoom || currentRoom.id !== roomId || !isMatching || isProcessing) {
            log('⚠️ 超时触发时无有效匹配状态，忽略');
            return;
        }
        isProcessing = true;
        log('⏰ 匹配超时，开始填充人机...');

        try {
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            // 先查当前房间真实人数
            const { data: existingPlayers } = await supabase
                .from('room_players')
                .select('player_id, is_bot')
                .eq('room_id', roomId);
            const existingIds = existingPlayers?.map(p => p.player_id) || [];
            const realPlayerCount = existingPlayers?.filter(p => !p.is_bot).length || 0;
            const neededBots = maxPlayers - existingIds.length;

            log(`📊 当前房间人数: ${existingIds.length}/${maxPlayers}，真人: ${realPlayerCount}，需要填充 ${neededBots} 个人机`);
            
            // 无真人直接清理房间
            if (realPlayerCount === 0) {
                log('⚠️ 房间内无真人，停止补人机，清理房间');
                await cleanRoomIfEmpty(roomId);
                cleanup();
                resetUI();
                return;
            }

            // 人数已满，直接触发游戏开始
            if (neededBots <= 0) {
                await checkRoomFull(roomId);
                return;
            }

            // 拉取预制人机
            const { data: allBots, error: botError } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_bot', true)
                .limit(200);
            if (botError || !allBots || allBots.length === 0) {
                throw new Error('数据库中没有预制人机，无法填充');
            }

            // 筛选可用人机
            const availableBots = allBots
                .map(b => b.id)
                .filter(id => !existingIds.includes(id))
                .slice(0, neededBots);

            if (availableBots.length < neededBots) {
                throw new Error(`可用人机不足，需要 ${neededBots}，实际 ${availableBots.length}`);
            }

            // 批量插入人机
            const botInserts = availableBots.map(botId => ({
                room_id: roomId,
                player_id: botId,
                mmr_at_join: 1000,
                health: config.INITIAL_HEALTH || 100,
                is_bot: true,
                is_ready: true,
                joined_at: new Date().toISOString()
            }));
            const { error: insertError } = await supabase.from('room_players').insert(botInserts);
            if (insertError) throw insertError;

            log(`✅ 已添加 ${availableBots.length} 个人机，等待数据库同步...`);
            // 【修复】延长同步等待时间，增加3次重试校验，解决同步延迟问题
            let checkRetry = 0;
            const maxCheckRetry = 3;
            const checkInterval = 800;

            while (checkRetry < maxCheckRetry) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                const { data: latestPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_id', roomId);
                const latestCount = latestPlayers?.length || 0;
                
                if (latestCount >= maxPlayers) {
                    log(`✅ 第${checkRetry+1}次校验，人数已达标: ${latestCount}/${maxPlayers}`);
                    await checkRoomFull(roomId);
                    return;
                }
                checkRetry++;
                log(`⚠️ 第${checkRetry}次校验，人数未达标，继续等待...`);
            }

            // 重试后仍未达标，强制触发校验
            log(`⚠️ 重试${maxCheckRetry}次后仍未完全同步，强制触发游戏开始校验`);
            await checkRoomFull(roomId);

        } catch (err) {
            log(`❌ 人机填充失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('匹配超时，人机填充失败，请重试', true);
            cleanup();
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    // 【修复】订阅房间，增加失败重试、状态校验、事件防抖
    function subscribeToRoom(roomId) {
        // 先清理旧订阅
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        
        log(`📡 开始订阅房间: ${roomId.slice(0,8)}，重试次数: ${subscribeRetryCount}`);
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            // 房间玩家变更事件
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'room_players', 
                filter: `room_id=eq.${roomId}` 
            }, () => {
                // 防抖处理，防止频繁触发
                if (isProcessing) return;
                checkRoomFull(roomId);
            })
            // 房间状态变更事件
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${roomId}`
            }, (payload) => {
                const newStatus = payload.new.status;
                log(`📡 房间状态更新: ${newStatus}`);
                if (newStatus === 'battle') {
                    cleanup();
                    window.YYCardBattle?.enterBattle?.(roomId);
                }
            })
            .subscribe((status) => { 
                if (status === 'SUBSCRIBED') {
                    log(`✅ 房间订阅成功`);
                    subscribeRetryCount = 0; // 重置重试计数
                    checkRoomFull(roomId); // 订阅成功立即校验
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    log(`❌ 房间订阅失败，状态: ${status}`, true);
                    // 订阅失败重试
                    if (subscribeRetryCount < MAX_SUBSCRIBE_RETRY) {
                        subscribeRetryCount++;
                        log(`🔄 第${subscribeRetryCount}次重试订阅...`);
                        setTimeout(() => subscribeToRoom(roomId), 1000 * subscribeRetryCount);
                    } else {
                        log(`❌ 订阅重试次数耗尽，匹配失败`, true);
                        if (window.YYCardShop?.toast) window.YYCardShop.toast('房间连接失败，请重试', true);
                        cleanup();
                        resetUI();
                    }
                }
            });
    }

    // 【修复】检查房间是否满员，增加分布式锁、幂等性处理，解决并发竞态
    async function checkRoomFull(roomId) {
        // 防止并发执行
        if (isProcessing || !isMatching || !currentRoom || currentRoom.id !== roomId) {
            return;
        }

        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        // 查当前房间所有玩家
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);
        const count = players?.length || 0;
        const realPlayerCount = players?.filter(p => !p.is_bot).length || 0;
        
        // 更新UI状态
        updateStatus(`匹配中... ${count}/${maxPlayers}`);
        log(`📊 房间人数校验: ${count}/${maxPlayers}，真人: ${realPlayerCount}`);
        
        // 无真人直接清理
        if (realPlayerCount === 0) {
            log('⚠️ 房间内无真人，清理房间');
            await cleanRoomIfEmpty(roomId);
            cleanup();
            resetUI();
            return;
        }

        // 房间满员，开始游戏
        if (count >= maxPlayers) {
            isProcessing = true;
            log('📝 房间满员，开始游戏初始化流程');
            try {
                // 【核心修复】原子化更新房间状态，加乐观锁，防止并发修改
                const { data: updatedRoom, error: updateError } = await supabase
                    .from('rooms')
                    .update({ status: 'battle' })
                    .eq('id', roomId)
                    .eq('status', 'waiting') // 乐观锁：只有状态是waiting才更新
                    .select('*')
                    .single();

                // 更新失败，说明已经有其他玩家更新了状态，直接进入游戏
                if (updateError || !updatedRoom) {
                    log('⚠️ 房间状态已被其他玩家更新，直接进入对战');
                    cleanup();
                    window.YYCardBattle?.enterBattle?.(roomId);
                    return;
                }

                // 更新成功，执行游戏初始化
                log('✅ 房间状态已更新为battle，开始初始化游戏');
                cleanup();
                await initializeGame(roomId, players);

            } catch (err) {
                log(`❌ 游戏开始流程失败: ${err.message}`, true);
                isProcessing = false;
            }
        }
    }

    // ✅ 【双缓冲】初始化游戏，生成两组商店卡牌（每组3张）
    async function initializeGame(roomId, players) {
        log('🎮 开始初始化游戏状态（双缓冲商店）...');
        try {
            // 幂等性校验：游戏状态已存在，直接进入对战
            const { data: existing } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            if (existing) {
                log('⚠️ 游戏状态已存在，跳过初始化，直接进入对战');
                window.YYCardBattle?.enterBattle?.(roomId);
                return;
            }

            // 初始化游戏状态
            const now = new Date().toISOString();
            const state = {
                round: 1,
                phase: 'prepare',
                gameStartTime: now,
                phaseStartTime: now,
                battlePairs: [],
                players: {}
            };

            // 初始化每个玩家的状态
            for (const p of players) {
                const isBot = p.is_bot;
                let deck = [];
                try {
                    deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
                } catch (e) {
                    log(`⚠️ 玩家${p.player_id.slice(0,8)}卡组生成失败: ${e.message}，使用默认卡组`, true);
                    deck = utils.getDefaultDeck();
                }
                
                // ✅ 生成双缓冲商店：调用两次各生成3张，组成两组
                let shopData = { buffer: [], active: 0, next: null };
                try {
                    const group1 = await utils.generateShopCards(1); // 默认 shopLevel 1，生成3张
                    const group2 = await utils.generateShopCards(1);
                    // 确保每组刚好3张（不足补 null，过滤无效）
                    const g1 = Array.isArray(group1) ? group1.filter(c => c !== null).slice(0, 3) : [];
                    const g2 = Array.isArray(group2) ? group2.filter(c => c !== null).slice(0, 3) : [];
                    while (g1.length < 3) g1.push(null);
                    while (g2.length < 3) g2.push(null);
                    shopData = {
                        buffer: [g1, g2],
                        active: 0,
                        next: null
                    };
                } catch (e) {
                    log(`⚠️ 玩家${p.player_id.slice(0,8)}双缓冲商店生成失败: ${e.message}，使用空组`, true);
                    shopData = {
                        buffer: [[null,null,null], [null,null,null]],
                        active: 0,
                        next: null
                    };
                }

                state.players[p.player_id] = {
                    health: config.INITIAL_HEALTH || 100,
                    gold: 500000,
                    exp: 0,
                    shopLevel: 1,
                    board: deck.slice(0, 3).concat(new Array(3).fill(null)).slice(0, 6),
                    hand: deck.slice(3, 6).concat(new Array(12).fill(null)).slice(0, config.HAND_MAX_COUNT || 15),
                    shopCards: shopData,          // ✅ 双缓冲对象
                    isBot: isBot,
                    isReady: false,
                    isEliminated: false
                };
            }

            // 写入数据库
            const { error } = await supabase.from('game_states').upsert(
                { room_id: roomId, state: state }, 
                { onConflict: 'room_id' }
            );
            if (error) throw error;

            log('🎉 游戏初始化完成（双缓冲商店），进入对战！');
            window.YYCardBattle?.enterBattle?.(roomId);
            resetUI();

        } catch (err) {
            log(`❌ 游戏状态写入失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('游戏初始化失败，请重试', true);
            cleanup();
            resetUI();
        }
    }

    // 设置当前房间
    function setCurrentRoom(roomId) {
        cleanup();
        currentRoom = { id: roomId };
        isMatching = true;
        startMatchTimers(roomId, config.MATCHMAKING_TIMEOUT_MS || 15000);
        subscribeToRoom(roomId);
        log(`✅ 当前房间已设置: ${roomId.slice(0,8)}`);
    }

    // 获取当前房间ID
    function getCurrentRoomId() {
        return currentRoom?.id || null;
    }

    return {
        start,
        cancel,
        setCurrentRoom,
        subscribeToRoom,
        leaveAndClean,
        getCurrentRoomId,
        currentRoom: () => currentRoom
    };
})();

console.log('✅ matchmaking.js 加载完成（终极修复版 + 双缓冲商店初始化）');
const clickSound = new Audio("/assets/mp3/wodedaodun.mp3");
clickSound.volume = 0.5;

document.addEventListener("click", function(e){
    if(e.target.id === "start-match-btn"){
        clickSound.currentTime = 0;
        clickSound.play().catch(()=>{});
    }
});
