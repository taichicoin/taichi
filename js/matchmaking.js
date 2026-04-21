// ==================== 匹配系统【终极修复版】解决卡匹配、不补人机、不进游戏问题 ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 核心状态（新增状态锁，避免竞态）
    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;
    let matchPollingTimer = null; // 新增：兜底轮询定时器
    let isMatching = false;
    let isProcessing = false; // 新增：操作锁，防止重复执行核心逻辑
    let matchStartTime = null; // 新增：匹配开始时间，精准控制超时

    // 日志工具
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(`[匹配系统] ${msg}`);
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

    // 重置UI状态
    function resetUI() {
        isMatching = false;
        isProcessing = false;
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            const hasUsername = auth?.currentProfile?.username;
            startBtn.disabled = !hasUsername;
            startBtn.textContent = hasUsername ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        updateStatus('', false);
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        // 清理所有定时器
        clearAllTimers();
    }

    // 新增：统一清理所有定时器
    function clearAllTimers() {
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        if (matchPollingTimer) {
            clearInterval(matchPollingTimer);
            matchPollingTimer = null;
        }
        log('✅ 所有定时器已清理');
    }

    // 清理订阅和资源
    function cleanup() {
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
            log('✅ 旧房间订阅已清理');
        }
        clearAllTimers();
        isMatching = false;
        isProcessing = false;
    }

    // 清理玩家残留房间【幂等性优化】
    async function cleanPlayerResidualRooms(uid) {
        if (!uid) return;
        log(`🧹 正在清理玩家 ${uid.slice(0,8)} 的残留房间...`);
        
        // 先查玩家所在的所有房间
        const { data: myRooms } = await supabase
            .from('room_players')
            .select('room_id')
            .eq('player_id', uid);
        const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];

        // 删除玩家的所有房间记录
        if (roomIds.length > 0) {
            await supabase.from('room_players').delete().eq('player_id', uid);
            log(`✅ 玩家 ${roomIds.length} 条房间记录已删除`);
        }

        // 逐个检查房间，空房间彻底删除
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

    // 新增：判断当前客户端是否为房间房主（唯一执行补人机、房间状态更新的权限）
    async function isRoomOwner(roomId, uid) {
        if (!roomId || !uid) return false;
        const { data: players } = await supabase
            .from('room_players')
            .select('player_id, joined_at')
            .eq('room_id', roomId)
            .eq('is_bot', false)
            .order('joined_at', { ascending: true })
            .limit(1);
        // 最早加入房间的真人玩家为房主，拥有唯一执行权，避免多客户端冲突
        return players?.[0]?.player_id === uid;
    }

    // 开始匹配【防重复+竞态锁+精准计时优化】
    async function start() {
        // 双重锁，防止重复点击和重复执行
        if (isMatching || isProcessing) { 
            log('⚠️ 匹配已在进行中，请勿重复点击'); 
            return; 
        }
        
        const profile = auth?.currentProfile;
        const uid = auth?.currentUser?.id;
        if (!profile?.username || !uid) { 
            if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
            else console.error('请先设置游戏ID');
            return; 
        }

        // 初始化匹配状态
        isProcessing = true;
        isMatching = true;
        matchStartTime = Date.now(); // 记录匹配开始时间，精准控制超时
        log('🔍 开始匹配...');
        
        // 更新UI
        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);
        const cancelBtn = document.getElementById('cancel-match-btn');
        cancelBtn.style.display = 'inline-block';

        try {
            // 先清理残留房间
            await cleanPlayerResidualRooms(uid);

            const myMmr = profile.mmr || config.INITIAL_MMR;
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            const matchTimeout = config.MATCHMAKING_TIMEOUT_MS || 15000;

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
                log(`✅ 加入现有房间: ${room.id.slice(0,8)}`);
            }

            // 检查是否已在房间中
            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', uid)
                .maybeSingle();
            if (existing) {
                log('⚠️ 已在房间中，恢复订阅');
                currentRoom = room;
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

            // 赋值当前房间，必须在订阅前完成，避免竞态
            currentRoom = room;
            // 启动订阅
            subscribeToRoom(room.id);

            // 【修复】精准设置超时定时器：从加入房间开始计算超时，而非点击开始时
            if (matchmakingTimer) clearTimeout(matchmakingTimer);
            matchmakingTimer = setTimeout(() => handleTimeout(), matchTimeout);

            // 【核心修复】启动兜底轮询，每2秒检查一次房间状态，彻底解决事件丢失问题
            if (matchPollingTimer) clearInterval(matchPollingTimer);
            matchPollingTimer = setInterval(() => {
                if (currentRoom?.id && isMatching) {
                    checkRoomFull(currentRoom.id);
                }
            }, 2000);

            log(`✅ 匹配流程完成，已进入房间，兜底轮询已启动`);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    // 取消匹配
    async function cancel() {
        if (isProcessing) {
            log('⚠️ 正在处理匹配流程，暂无法取消');
            return;
        }
        log('🛑 玩家取消匹配');
        cleanup();
        const uid = auth?.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }
        currentRoom = null;
        resetUI();
    }

    // 离开并彻底清理
    async function leaveAndClean() {
        log('🚪 主动退出，执行全量清理...');
        cleanup();
        const uid = auth?.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }
        currentRoom = null;
        resetUI();
    }

    // 匹配超时处理【修复：房主唯一执行权+防重复触发+容错优化】
    async function handleTimeout() {
        const uid = auth?.currentUser?.id;
        // 【核心修复】只有房主能执行补人机逻辑，避免多客户端冲突
        const isOwner = await isRoomOwner(currentRoom?.id, uid);

        // 修复：放宽触发条件，只要房间存在、状态为waiting、是房主，就执行补人机
        if (!currentRoom || !isMatching || !isOwner) {
            log(`⚠️ 超时触发校验不通过：房间存在=${!!currentRoom}，匹配中=${isMatching}，是房主=${isOwner}，忽略`);
            return;
        }
        if (isProcessing) {
            log('⚠️ 正在执行核心逻辑，跳过本次超时处理');
            return;
        }

        isProcessing = true;
        log('⏰ 匹配超时，房主开始填充人机...');

        try {
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            // 先查询最新的房间状态，避免脏数据
            const { data: roomData } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', currentRoom.id)
                .single();
            
            // 房间已不是等待状态，直接终止
            if (!roomData || roomData.status !== 'waiting') {
                log(`⚠️ 房间状态已变为${roomData?.status}，终止补人机`);
                isProcessing = false;
                return;
            }

            // 查询当前房间玩家
            const { data: existingPlayers } = await supabase
                .from('room_players')
                .select('player_id')
                .eq('room_id', currentRoom.id);
            const existingIds = existingPlayers?.map(p => p.player_id) || [];
            const neededBots = maxPlayers - existingIds.length;

            log(`📊 当前房间人数: ${existingIds.length}，需要填充 ${neededBots} 个人机`);
            if (neededBots <= 0) {
                await checkRoomFull(currentRoom.id);
                isProcessing = false;
                return;
            }

            // 拉取预制人机
            const { data: allBots, error: botError } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_bot', true)
                .limit(200);
            if (botError || !allBots || allBots.length === 0) {
                log('❌ 数据库中没有预制人机，无法填充', true);
                resetUI();
                return;
            }

            // 筛选可用人机
            const availableBots = allBots
                .map(b => b.id)
                .filter(id => !existingIds.includes(id))
                .slice(0, neededBots);

            if (availableBots.length < neededBots) {
                log(`❌ 可用人机不足，需要 ${neededBots}，实际 ${availableBots.length}`, true);
                resetUI();
                return;
            }

            // 批量插入人机
            const botInserts = availableBots.map(botId => ({
                room_id: currentRoom.id,
                player_id: botId,
                mmr_at_join: 1000,
                health: config.INITIAL_HEALTH || 100,
                is_bot: true,
                is_ready: true,
                joined_at: new Date().toISOString()
            }));
            const { error: insertError } = await supabase.from('room_players').insert(botInserts);
            if (insertError) {
                log(`❌ 人机插入失败: ${insertError.message}`, true);
                resetUI();
                return;
            }

            log(`✅ 已添加 ${availableBots.length} 个人机，等待数据库同步...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            // 强制检查房间满员状态
            await checkRoomFull(currentRoom.id);
        } catch (err) {
            log(`❌ 补人机失败: ${err.message}`, true);
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    // 订阅房间状态【修复：防重复订阅+事件兜底】
    function subscribeToRoom(roomId) {
        // 先清理旧订阅，绝对避免重复订阅
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        
        log(`📡 开始订阅房间: ${roomId.slice(0,8)}`);
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'room_players', 
                filter: `room_id=eq.${roomId}` 
            }, () => {
                // 事件触发时，只执行检查，不做核心逻辑，避免竞态
                if (currentRoom?.id === roomId && isMatching) {
                    checkRoomFull(roomId);
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${roomId}`
            }, (payload) => {
                const newStatus = payload.new.status;
                log(`📡 房间状态更新: ${newStatus}`);
                if (newStatus === 'battle' && currentRoom?.id === roomId) {
                    cleanup();
                    window.YYCardBattle?.enterBattle?.(roomId);
                }
            })
            .subscribe((status) => { 
                if (status === 'SUBSCRIBED') {
                    log(`✅ 房间订阅成功`);
                    // 订阅成功后，强制检查一次房间状态
                    checkRoomFull(roomId);
                } else if (status === 'CHANNEL_ERROR') {
                    log(`❌ 房间订阅失败，重试中...`, true);
                    // 订阅失败自动重试
                    setTimeout(() => {
                        if (currentRoom?.id === roomId && isMatching) {
                            subscribeToRoom(roomId);
                        }
                    }, 1000);
                }
            });
    }

    // 检查房间是否满员【修复：加锁防重复执行+超时前置检查+状态校验】
    async function checkRoomFull(roomId) {
        // 加锁，防止多个事件/轮询同时触发，导致重复执行
        if (isProcessing) return;
        if (!roomId || !isMatching) return;

        isProcessing = true;
        try {
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            const matchTimeout = config.MATCHMAKING_TIMEOUT_MS || 15000;
            const uid = auth?.currentUser?.id;
            const isOwner = await isRoomOwner(roomId, uid);

            // 查询最新的房间数据
            const [roomRes, playersRes] = await Promise.all([
                supabase.from('rooms').select('status').eq('id', roomId).single(),
                supabase.from('room_players').select('*').eq('room_id', roomId)
            ]);

            const room = roomRes.data;
            const players = playersRes.data;
            const count = players?.length || 0;

            // 房间状态异常，直接重置
            if (!room || room.status !== 'waiting') {
                log(`⚠️ 房间状态异常: ${room?.status || '不存在'}，终止匹配`);
                resetUI();
                return;
            }

            // 更新UI
            updateStatus(`匹配中... ${count}/${maxPlayers}`);

            // 【核心修复】房主前置检查：已超时但还没补人机，直接触发补人机，彻底解决定时器失效问题
            if (isOwner && matchStartTime && (Date.now() - matchStartTime) >= matchTimeout) {
                log(`⚠️ 匹配已超时，兜底触发补人机逻辑`);
                isProcessing = false;
                handleTimeout();
                return;
            }

            // 房间满员，开始游戏
            if (count >= maxPlayers) {
                log(`📝 房间满员 ${count}/${maxPlayers}，准备进入游戏`);
                clearAllTimers();

                // 只有房主能更新房间状态，避免多客户端冲突
                if (isOwner && room.status === 'waiting') {
                    log('✅ 房主更新房间状态为battle');
                    await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
                }

                // 等待状态同步，然后初始化游戏
                await new Promise(resolve => setTimeout(resolve, 300));
                const { data: finalRoom } = await supabase
                    .from('rooms')
                    .select('status')
                    .eq('id', roomId)
                    .single();

                if (finalRoom.status === 'battle') {
                    cleanup();
                    await initializeGame(roomId, players);
                }
            }
        } catch (err) {
            log(`❌ 房间检查失败: ${err.message}`, true);
        } finally {
            isProcessing = false;
        }
    }

    // 初始化游戏【修复：并行执行优化+错误兜底+无弹窗】
    async function initializeGame(roomId, players) {
        if (isProcessing) return;
        isProcessing = true;

        try {
            // 检查游戏状态是否已存在
            const { data: existing } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            if (existing) {
                log('⚠️ 游戏状态已存在，跳过初始化，直接进入对战');
                cleanup();
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

            // 【修复】并行初始化所有玩家，避免串行耗时过长导致超时
            const playerInitPromises = players.map(async (p) => {
                const isBot = p.is_bot;
                let deck = [];
                try {
                    deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
                } catch (e) {
                    log(`⚠️ 玩家${p.player_id.slice(0,8)}卡组生成失败: ${e.message}，使用空卡组`, true);
                    deck = [];
                }
                
                // 生成商店卡牌
                let shopCards = [];
                try {
                    shopCards = await utils.generateShopCards(1);
                    if (!Array.isArray(shopCards)) shopCards = [];
                } catch (e) {
                    log(`⚠️ 玩家${p.player_id.slice(0,8)}商店卡牌生成失败: ${e.message}，使用空商店`, true);
                    shopCards = [];
                }

                // 返回玩家状态，不直接修改state，避免竞态
                return {
                    playerId: p.player_id,
                    playerState: {
                        health: config.INITIAL_HEALTH || 100,
                        gold: 5,
                        exp: 0,
                        shopLevel: 1,
                        board: deck.slice(0, 3).concat(new Array(3).fill(null)).slice(0, 6),
                        hand: deck.slice(3, 6).concat(new Array(12).fill(null)).slice(0, config.HAND_MAX_COUNT || 15),
                        shopCards: shopCards,
                        isBot: isBot,
                        isReady: false,
                        isEliminated: false
                    }
                };
            });

            // 等待所有玩家初始化完成
            const playerStates = await Promise.all(playerInitPromises);
            // 批量写入state
            playerStates.forEach(({ playerId, playerState }) => {
                state.players[playerId] = playerState;
            });

            // 写入数据库
            const { error } = await supabase.from('game_states').upsert(
                { room_id: roomId, state: state }, 
                { onConflict: 'room_id' }
            );
            if (error) throw error;

            log('🎉 游戏初始化完成，进入对战！');
            cleanup();
            window.YYCardBattle?.enterBattle?.(roomId);
            resetUI();
        } catch (err) {
            log(`❌ 游戏初始化失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('游戏初始化失败，请重试', true);
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    // 设置当前房间【修复：强制清理旧订阅+状态同步】
    function setCurrentRoom(roomId) {
        cleanup();
        currentRoom = { id: roomId };
        isMatching = true;
        matchStartTime = Date.now();
        // 启动兜底轮询
        matchPollingTimer = setInterval(() => {
            if (currentRoom?.id && isMatching) {
                checkRoomFull(currentRoom.id);
            }
        }, 2000);
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

console.log('✅ matchmaking.js 加载完成（终极修复版，解决卡匹配/不补人机/不进游戏问题）');
