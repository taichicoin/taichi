// ==================== 匹配系统（稳定版：人机填充修复 + 保留所有原有功能） ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    function updateStatus(text, show = true) {
        const el = document.getElementById('match-status');
        if (el) {
            el.style.display = show ? 'block' : 'none';
            el.textContent = text;
        }
    }

    function resetUI() {
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            startBtn.disabled = !auth.currentProfile?.username;
            startBtn.textContent = auth.currentProfile?.username ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        updateStatus('', false);
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
    }

    function cleanup() {
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
    }

    // 清理当前玩家所有残留房间记录
    async function cleanPlayerResidualRooms(uid) {
        if (!uid) return;
        const { data: myRooms } = await supabase
            .from('room_players')
            .select('room_id')
            .eq('player_id', uid);
        const roomIds = myRooms?.map(r => r.room_id) || [];
        const uniqueRoomIds = [...new Set(roomIds)];

        await supabase.from('room_players').delete().eq('player_id', uid);

        for (const roomId of uniqueRoomIds) {
            await cleanRoomIfEmpty(roomId);
        }
    }

    async function cleanRoomIfEmpty(roomId) {
        const { data: realPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);

        if (!realPlayers || realPlayers.length === 0) {
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
            log(`🧹 房间 ${roomId} 已无真人，已清理`);
        }
    }

    // 开始匹配
    async function start() {
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn.disabled) { log('⚠️ 匹配已在进行中'); return; }
        if (!auth.currentProfile?.username) { alert('请先设置游戏ID'); return; }

        log('🔍 开始匹配...');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);

        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        const uid = auth.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }

        const myMmr = auth.currentProfile.mmr || config.INITIAL_MMR;

        // 清除可能残留的旧定时器
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        // 设置 60 秒超时填充人机
        matchmakingTimer = setTimeout(() => handleTimeout(), config.MATCHMAKING_TIMEOUT_MS);

        try {
            let { data: waitingRooms } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .limit(1);
            let room = waitingRooms?.[0];

            if (!room) {
                const { data: newRoom } = await supabase
                    .from('rooms')
                    .insert({ status: 'waiting', max_players: config.MAX_PLAYERS_PER_ROOM })
                    .select('*')
                    .single();
                room = newRoom;
                log(`✅ 创建新房间: ${room.id}`);
            } else {
                log(`✅ 加入现有房间: ${room.id}`);
            }

            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', auth.currentUser.id)
                .maybeSingle();

            if (existing) {
                log('⚠️ 已在房间中');
                currentRoom = room;
                subscribeToRoom(room.id);
                return;
            }

            await supabase.from('room_players').insert({
                room_id: room.id,
                player_id: auth.currentUser.id,
                mmr_at_join: myMmr,
                health: config.INITIAL_HEALTH,
                is_bot: false
            });

            currentRoom = room;
            subscribeToRoom(room.id);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            resetUI();
        }
    }

    // 取消匹配
    async function cancel() {
        log('🛑 执行取消匹配...');
        cleanup();

        const uid = auth.currentUser?.id;
        if (!uid) { resetUI(); return; }

        await cleanPlayerResidualRooms(uid);
        currentRoom = null;
        resetUI();
    }

    // 超时处理：填充人机（微调：插入后主动调用 checkRoomFull）
    async function handleTimeout() {
        if (!currentRoom) {
            log('⚠️ 超时触发时无当前房间', true);
            return;
        }
        log('⏰ 超时触发器工作，准备填充人机...');

        // 防止定时器重复
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }

        // 再次确认房间状态仍为 waiting
        const { data: roomNow } = await supabase
            .from('rooms')
            .select('status')
            .eq('id', currentRoom.id)
            .single();

        if (!roomNow || roomNow.status !== 'waiting') {
            log('⚠️ 房间已非等待状态，取消填充');
            return;
        }

        const { data: players } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', currentRoom.id);

        const existingIds = players?.map(p => p.player_id) || [];
        const currentCount = existingIds.length;
        const needed = config.MAX_PLAYERS_PER_ROOM - currentCount;

        if (needed <= 0) {
            await checkRoomFull(currentRoom.id);
            return;
        }

        log(`📊 当前人数: ${currentCount}，需要填充 ${needed} 个人机`);

        const { data: bots } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_bot', true)
            .limit(200);

        if (!bots || bots.length === 0) {
            log('❌ 数据库中没有预制人机', true);
            return;
        }

        const availableBots = bots
            .map(b => b.id)
            .filter(id => !existingIds.includes(id))
            .slice(0, needed);

        if (availableBots.length < needed) {
            log(`❌ 可用人机不足，需要 ${needed}，实际 ${availableBots.length}`, true);
            return;
        }

        const inserts = availableBots.map(botId => ({
            room_id: currentRoom.id,
            player_id: botId,
            mmr_at_join: 1000,
            health: config.INITIAL_HEALTH,
            is_bot: true
        }));

        const { error } = await supabase.from('room_players').insert(inserts);
        if (error) {
            log(`❌ 人机插入失败: ${error.message}`, true);
            return;
        }

        log(`✅ 成功添加 ${availableBots.length} 个人机`);
        // ===== 关键修复：插入人机后主动检查一次 =====
        await checkRoomFull(currentRoom.id);
    }

    // 订阅房间变化
    function subscribeToRoom(roomId) {
        if (roomSubscription) roomSubscription.unsubscribe();

        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
                () => checkRoomFull(roomId)
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    checkRoomFull(roomId);
                }
            });

        checkRoomFull(roomId);
    }

    // 检查房间是否满员（微调：确保满员后一定会开局）
    async function checkRoomFull(roomId) {
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);

        const count = players?.length || 0;
        updateStatus(`匹配中... ${count}/${config.MAX_PLAYERS_PER_ROOM}`);
        log(`👥 房间人数: ${count}/${config.MAX_PLAYERS_PER_ROOM}`);

        if (count >= config.MAX_PLAYERS_PER_ROOM) {
            // 满员，清除超时定时器，房间状态改为 battle
            if (matchmakingTimer) {
                clearTimeout(matchmakingTimer);
                matchmakingTimer = null;
            }

            const { data: room } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', roomId)
                .single();

            if (room && room.status === 'waiting') {
                log('📝 房间满员，更新状态为 battle');
                await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
                cleanup();
                await initializeGame(roomId, players);
            } else if (room && room.status === 'battle') {
                // 已经是战斗状态，可能重连触发
                cleanup();
                const { data: existingState } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', roomId)
                    .maybeSingle();
                if (!existingState) {
                    await initializeGame(roomId, players);
                } else {
                    // 直接进入对战
                    if (window.YYCardBattle?.enterBattle) {
                        window.YYCardBattle.enterBattle(roomId);
                    }
                }
            }
        }
    }

    // 初始化游戏状态
    async function initializeGame(roomId, players) {
        // 防止重复初始化
        const { data: existing } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', roomId)
            .maybeSingle();

        if (existing) {
            log('⚠️ 游戏状态已存在，跳过初始化');
            if (window.YYCardBattle?.enterBattle) {
                window.YYCardBattle.enterBattle(roomId);
            }
            return;
        }

        const state = {
            round: 1,
            phase: 'prepare',
            players: {}
        };

        for (const p of players) {
            const isBot = p.is_bot;
            const deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
            state.players[p.player_id] = {
                health: config.INITIAL_HEALTH,
                gold: 5,
                exp: 0,
                shopLevel: 1,
                board: deck.slice(0, 3).concat(new Array(3).fill(null)).slice(0, 6),
                hand: deck.slice(3, 6).concat(new Array(12).fill(null)).slice(0, config.HAND_MAX_COUNT),
                shopCards: await utils.generateShopCards(1),
                isBot: isBot
            };
        }

        const { error } = await supabase
            .from('game_states')
            .upsert({ room_id: roomId, state }, { onConflict: 'room_id' });

        if (error) {
            log(`❌ 游戏状态写入失败: ${error.message}`, true);
            return;
        }

        log('🎉 进入对战！');
        if (window.YYCardBattle?.enterBattle) {
            window.YYCardBattle.enterBattle(roomId);
        } else {
            alert('对战模块未加载');
        }

        resetUI();
    }

    // 供重连使用
    function setCurrentRoom(roomId) {
        currentRoom = { id: roomId };
        subscribeToRoom(roomId);
    }

    function getCurrentRoom() {
        return currentRoom;
    }

    return {
        start,
        cancel,
        setCurrentRoom,
        subscribeToRoom,
        currentRoom: getCurrentRoom
    };
})();

console.log('✅ matchmaking.js 加载完成（安全修复版）');
