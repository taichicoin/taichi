// ==================== 匹配系统（增强屏幕日志版 + 人机插入后延迟检查） ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;

    // 输出到屏幕调试面板
    function logToScreen(msg, isError = false) {
        try {
            const p = document.getElementById('mobile-debug-panel');
            if (p) {
                const line = document.createElement('div');
                line.style.color = isError ? '#ff7b7b' : '#7bffb1';
                line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
                p.appendChild(line);
                p.scrollTop = p.scrollHeight;
                while (p.children.length > 40) p.removeChild(p.firstChild);
            }
        } catch (e) {}
    }

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError);
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

        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        matchmakingTimer = setTimeout(() => handleTimeout(), config.MATCHMAKING_TIMEOUT_MS);
        log(`⏱️ 已设置 ${config.MATCHMAKING_TIMEOUT_MS / 1000} 秒超时人机填充`);

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

    async function cancel() {
        log('🛑 执行取消匹配...');
        cleanup();

        const uid = auth.currentUser?.id;
        if (!uid) { resetUI(); return; }

        await cleanPlayerResidualRooms(uid);
        currentRoom = null;
        resetUI();
    }

    async function handleTimeout() {
        if (!currentRoom) {
            log('⚠️ 超时触发时无当前房间', true);
            return;
        }
        log('⏰ 超时触发器工作，准备填充人机...');

        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }

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

        log(`✅ 成功添加 ${availableBots.length} 个人机，等待数据库同步...`);
        // 关键修复：等待 300ms 确保 Supabase 写入已生效，再检查满员
        await new Promise(resolve => setTimeout(resolve, 300));
        await checkRoomFull(currentRoom.id);
    }

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

    async function checkRoomFull(roomId) {
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);

        const count = players?.length || 0;
        updateStatus(`匹配中... ${count}/${config.MAX_PLAYERS_PER_ROOM}`);
        log(`👥 房间人数: ${count}/${config.MAX_PLAYERS_PER_ROOM}`);

        if (count >= config.MAX_PLAYERS_PER_ROOM) {
            log('🎯 房间已满，准备进入对战...');
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
                log('📝 更新房间状态为 battle');
                await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
                cleanup();
                await initializeGame(roomId, players);
            } else if (room && room.status === 'battle') {
                log('⚠️ 房间已是 battle 状态，检查游戏状态...');
                cleanup();
                const { data: existingState } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', roomId)
                    .maybeSingle();
                if (!existingState) {
                    await initializeGame(roomId, players);
                } else {
                    log('🎮 游戏状态已存在，直接进入对战');
                    if (window.YYCardBattle?.enterBattle) {
                        window.YYCardBattle.enterBattle(roomId);
                    } else {
                        log('❌ battle 模块未加载', true);
                    }
                }
            }
        }
    }

    async function initializeGame(roomId, players) {
        log('⚙️ 正在初始化游戏状态...');
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

        log('✅ 游戏状态初始化成功，调用 enterBattle');
        if (window.YYCardBattle?.enterBattle) {
            window.YYCardBattle.enterBattle(roomId);
        } else {
            log('❌ YYCardBattle 未定义', true);
            alert('对战模块加载失败');
        }

        resetUI();
    }

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

console.log('✅ matchmaking.js 加载完成（屏幕日志增强版 + 延迟检查修复）');
