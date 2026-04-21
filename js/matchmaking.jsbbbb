// ==================== 匹配系统【修复完整版】 ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;
    let isMatching = false;

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(`[匹配系统] ${msg}`);
        }
    }

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
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            const hasUsername = auth?.currentProfile?.username;
            startBtn.disabled = !hasUsername;
            startBtn.textContent = hasUsername ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        updateStatus('', false);
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
    }

    // 清理订阅和定时器
    function cleanup() {
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
            log('✅ 旧房间订阅已清理');
        }
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
            log('✅ 匹配定时器已清理');
        }
        isMatching = false;
    }

    // 清理玩家残留房间【修复版：幂等性+空房间彻底删除】
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

    // 开始匹配【修复版：防重复匹配+残留清理】
    async function start() {
        if (isMatching) { 
            log('⚠️ 匹配已在进行中，请勿重复点击'); 
            return; 
        }
        
        const profile = auth?.currentProfile;
        if (!profile?.username) { 
            // 替换 alert 为 toast
            if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
            else console.error('请先设置游戏ID');
            return; 
        }

        isMatching = true;
        log('🔍 开始匹配...');
        
        // 更新UI
        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);
        const cancelBtn = document.getElementById('cancel-match-btn');
        cancelBtn.style.display = 'inline-block';

        // 清理残留房间
        const uid = auth?.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }

        const myMmr = profile.mmr || config.INITIAL_MMR;
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;

        // 匹配超时定时器
        if (matchmakingTimer) clearTimeout(matchmakingTimer);
        matchmakingTimer = setTimeout(() => handleTimeout(), config.MATCHMAKING_TIMEOUT_MS || 15000);

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

            currentRoom = room;
            subscribeToRoom(room.id);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            resetUI();
        }
    }

    // 取消匹配
    async function cancel() {
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

    // 匹配超时处理【修复版：防重复触发+人机填充容错】
    async function handleTimeout() {
        if (!currentRoom || !isMatching) {
            log('⚠️ 超时触发时无有效匹配状态，忽略');
            return;
        }
        log('⏰ 匹配超时，开始填充人机...');

        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const { data: existingPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', currentRoom.id);
        const existingIds = existingPlayers?.map(p => p.player_id) || [];
        const neededBots = maxPlayers - existingIds.length;

        log(`📊 当前房间人数: ${existingIds.length}，需要填充 ${neededBots} 个人机`);
        if (neededBots <= 0) {
            await checkRoomFull(currentRoom.id);
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
        await checkRoomFull(currentRoom.id);
    }

    // 订阅房间状态
    function subscribeToRoom(roomId) {
        // 先清理旧订阅
        if (roomSubscription) roomSubscription.unsubscribe();
        
        log(`📡 开始订阅房间: ${roomId.slice(0,8)}`);
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'room_players', 
                filter: `room_id=eq.${roomId}` 
            }, () => checkRoomFull(roomId))
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
                    checkRoomFull(roomId);
                }
            });
    }

    // 检查房间是否满员
    async function checkRoomFull(roomId) {
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);
        const count = players?.length || 0;
        
        updateStatus(`匹配中... ${count}/${maxPlayers}`);
        
        // 房间满员，开始游戏
        if (count >= maxPlayers) {
            clearTimeout(matchmakingTimer);
            const { data: room } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', roomId)
                .single();
            
            if (room && room.status === 'waiting') {
                log('📝 房间满员，更新状态为battle并初始化游戏');
                await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
                cleanup();
                await initializeGame(roomId, players);
            } else if (room && room.status === 'battle') {
                log('⚠️ 房间已是battle状态，直接进入对战');
                cleanup();
                window.YYCardBattle?.enterBattle?.(roomId);
            }
        }
    }

    // 初始化游戏【修复版：时间字段完整写入 + 无 alert】
    async function initializeGame(roomId, players) {
        // 检查游戏状态是否已存在
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
                log(`⚠️ 玩家${p.player_id.slice(0,8)}卡组生成失败: ${e.message}，使用空卡组`, true);
                deck = [];
            }
            
            // 生成商店卡牌（增加错误兜底，避免弹窗）
            let shopCards = [];
            try {
                shopCards = await utils.generateShopCards(1);
                if (!Array.isArray(shopCards)) shopCards = [];
            } catch (e) {
                log(`⚠️ 玩家${p.player_id.slice(0,8)}商店卡牌生成失败: ${e.message}，使用空商店`, true);
                shopCards = [];
            }

            state.players[p.player_id] = {
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
            };
        }

        // 写入数据库
        const { error } = await supabase.from('game_states').upsert(
            { room_id: roomId, state: state }, 
            { onConflict: 'room_id' }
        );
        if (error) {
            log(`❌ 游戏状态写入失败: ${error.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('游戏初始化失败，请重试', true);
            resetUI();
            return;
        }

        log('🎉 游戏初始化完成，进入对战！');
        window.YYCardBattle?.enterBattle?.(roomId);
        resetUI();
    }

    // 设置当前房间【修复版：强制清理旧订阅】
    function setCurrentRoom(roomId) {
        cleanup();
        currentRoom = { id: roomId };
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

console.log('✅ matchmaking.js 加载完成（修复完整版，无弹窗）');
