// ==================== 匹配系统（预制人机版 + 完整清理） ====================
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

        const myMmr = auth.currentProfile.mmr || 1000;
        matchmakingTimer = setTimeout(() => handleTimeout(), config.MATCHMAKING_TIMEOUT_MS);

        try {
            let { data: waitingRooms } = await supabase.from('rooms').select('*').eq('status', 'waiting').limit(1);
            let room = waitingRooms?.[0];
            if (!room) {
                const { data: newRoom } = await supabase.from('rooms').insert({ status: 'waiting', max_players: config.MAX_PLAYERS }).select('*').single();
                room = newRoom;
                log(`✅ 创建新房间: ${room.id}`);
            } else {
                log(`✅ 加入现有房间: ${room.id}`);
            }

            const { data: existing } = await supabase.from('room_players').select('*').eq('room_id', room.id).eq('player_id', auth.currentUser.id).maybeSingle();
            if (existing) { log('⚠️ 已在房间中'); currentRoom = room; subscribeToRoom(room.id); return; }

            await supabase.from('room_players').insert({ room_id: room.id, player_id: auth.currentUser.id, mmr_at_join: myMmr, health: 100, is_bot: false });
            currentRoom = room;
            subscribeToRoom(room.id);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            resetUI();
        }
    }

    // 增强版取消匹配：确保彻底清理
    async function cancel() {
        log('🛑 执行取消匹配...');
        cleanup();

        const uid = auth.currentUser?.id;

        // 无论 currentRoom 是否存在，都尝试根据用户ID删除遗留记录
        if (uid) {
            // 先查找该用户所在的所有房间记录（理论上只有一条）
            const { data: orphanedList } = await supabase
                .from('room_players')
                .select('room_id')
                .eq('player_id', uid);

            if (orphanedList && orphanedList.length > 0) {
                // 删除该用户的所有 room_players 记录
                await supabase.from('room_players').delete().eq('player_id', uid);
                log(`🧹 已清理 ${orphanedList.length} 条遗留房间记录`);

                // 对于每个房间，检查是否还有真人，如果没有则删除房间
                for (const item of orphanedList) {
                    const roomId = item.room_id;
                    const { data: remaining } = await supabase
                        .from('room_players')
                        .select('*')
                        .eq('room_id', roomId)
                        .eq('is_bot', false);

                    if (!remaining || remaining.length === 0) {
                        await supabase.from('game_states').delete().eq('room_id', roomId);
                        await supabase.from('rooms').delete().eq('id', roomId);
                        log(`🧹 房间 ${roomId} 已无真人，已删除`);
                    }
                }
            }
        }

        currentRoom = null;
        resetUI();
    }

    // 人机填充：先查所有人机，再在 JS 中过滤
    async function handleTimeout() {
        if (!currentRoom) return;
        log('⏰ 开始处理匹配超时...');

        const { data: existingPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', currentRoom.id);
        const existingIds = existingPlayers?.map(p => p.player_id) || [];
        const neededBots = config.MAX_PLAYERS - existingIds.length;

        log(`📊 当前人数: ${existingIds.length}，需要填充 ${neededBots} 个人机`);
        if (neededBots <= 0) { await checkRoomFull(currentRoom.id); return; }

        const { data: allBots, error: botError } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_bot', true)
            .limit(200);

        if (botError) { log(`❌ 查询人机失败: ${botError.message}`, true); return; }
        if (!allBots || allBots.length === 0) { log('❌ 数据库中没有预制人机', true); return; }

        const availableBots = allBots
            .map(b => b.id)
            .filter(id => !existingIds.includes(id))
            .slice(0, neededBots);

        if (availableBots.length < neededBots) {
            log(`❌ 可用人机不足，需要 ${neededBots}，实际 ${availableBots.length}`, true);
            return;
        }

        for (const botId of availableBots) {
            await supabase.from('room_players').insert({
                room_id: currentRoom.id,
                player_id: botId,
                mmr_at_join: 1000,
                health: 100,
                is_bot: true
            });
        }
        log(`✅ 已添加 ${availableBots.length} 个人机`);
        await checkRoomFull(currentRoom.id);
    }

    function subscribeToRoom(roomId) {
        if (roomSubscription) roomSubscription.unsubscribe();
        roomSubscription = supabase.channel(`room:${roomId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => checkRoomFull(roomId))
            .subscribe((status) => { if (status === 'SUBSCRIBED') checkRoomFull(roomId); });
        checkRoomFull(roomId);
    }

    async function checkRoomFull(roomId) {
        const { data: players } = await supabase.from('room_players').select('*').eq('room_id', roomId);
        const count = players?.length || 0;
        updateStatus(`匹配中... ${count}/${config.MAX_PLAYERS}`);
        if (count >= config.MAX_PLAYERS) {
            clearTimeout(matchmakingTimer);
            await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
            cleanup();
            await initializeGame(roomId, players);
        }
    }

    async function initializeGame(roomId, players) {
        const state = { round: 1, phase: 'prepare', players: {} };
        players.forEach(p => {
            const isBot = p.is_bot;
            const deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
            state.players[p.player_id] = { health: 100, gold: 5, exp: 0, shopLevel: 1, board: deck.slice(0,3), hand: deck.slice(3,6), shopCards: utils.generateShopCards(1), isBot };
        });
        await supabase.from('game_states').upsert({ room_id: roomId, state }, { onConflict: 'room47_id' });
        log('🎉 进入对战！');
        if (window.YYCardBattle?.enterBattle) window.YYCardBattle.enterBattle(roomId);
        else alert('对战模块未加载');
        resetUI();
    }

    return { start, cancel, currentRoom: () => currentRoom };
})();
console.log('✅ matchmaking.js 加载完成');
