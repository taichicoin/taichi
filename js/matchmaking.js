// ==================== 匹配系统（修复重连覆盖状态 + 加强清理版） ====================
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
        log(`🧹 正在清理玩家 ${uid.slice(0,8)} 的残留房间...`);
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
        log(`✅ 残留清理完成`);
    }

    async function cleanRoomIfEmpty(roomId) {
        const { data: realPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);

        if (!realPlayers || realPlayers.length === 0) {
            log(`🧹 房间 ${roomId.slice(0,8)} 已无真人，执行清理...`);
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('room_players').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
            log(`✅ 房间 ${roomId.slice(0,8)} 已彻底删除`);
        } else {
            log(`👥 房间 ${roomId.slice(0,8)} 仍有 ${realPlayers.length} 名真人，保留房间`);
        }
    }

    async function start() {
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn?.disabled) { log('⚠️ 匹配已在进行中'); return; }
        
        const profile = auth?.currentProfile;
        if (!profile?.username) { alert('请先设置游戏ID'); return; }

        log('🔍 开始匹配...');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);

        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        const uid = auth?.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }

        const myMmr = profile.mmr || config.INITIAL_MMR;

        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
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
                .eq('player_id', uid)
                .maybeSingle();

            if (existing) {
                log('⚠️ 已在房间中');
                currentRoom = room;
                subscribeToRoom(room.id);
                return;
            }

            await supabase.from('room_players').insert({
                room_id: room.id,
                player_id: uid,
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

        const uid = auth?.currentUser?.id;
        if (!uid) { resetUI(); return; }

        await cleanPlayerResidualRooms(uid);
        currentRoom = null;
        resetUI();
    }

    // 公开的主动退出清理方法（供外部调用）
    async function leaveAndClean() {
        log('🚪 主动退出，执行清理...');
        cleanup();
        const uid = auth?.currentUser?.id;
        if (uid) {
            await cleanPlayerResidualRooms(uid);
        }
        currentRoom = null;
    }

    async function handleTimeout() {
        if (!currentRoom) {
            log('⚠️ 超时触发时无当前房间', true);
            return;
        }
        log('⏰ 开始处理匹配超时...');

        const { data: existingPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', currentRoom.id);
        const existingIds = existingPlayers?.map(p => p.player_id) || [];
        const neededBots = config.MAX_PLAYERS_PER_ROOM - existingIds.length;

        log(`📊 当前人数: ${existingIds.length}，需要填充 ${neededBots} 个人机`);
        if (neededBots <= 0) {
            await checkRoomFull(currentRoom.id);
            return;
        }

        const { data: allBots } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_bot', true)
            .limit(200);

        if (!allBots || allBots.length === 0) {
            log('❌ 数据库中没有预制人机', true);
            return;
        }

        const availableBots = allBots
            .map(b => b.id)
            .filter(id => !existingIds.includes(id))
            .slice(0, neededBots);

        if (availableBots.length < neededBots) {
            log(`❌ 可用人机不足，需要 ${neededBots}，实际 ${availableBots.length}`, true);
            return;
        }

        for (const botId of availableBots) {
            const { error: insertError } = await supabase.from('room_players').insert({
                room_id: currentRoom.id,
                player_id: botId,
                mmr_at_join: 1000,
                health: config.INITIAL_HEALTH,
                is_bot: true
            });
            if (insertError) {
                log(`❌ 人机插入失败: ${insertError.message}`, true);
            }
        }
        log(`✅ 已添加 ${availableBots.length} 个人机，稍等数据库同步...`);
        await new Promise(resolve => setTimeout(resolve, 300));
        await checkRoomFull(currentRoom.id);
    }

    function subscribeToRoom(roomId) {
        if (roomSubscription) roomSubscription.unsubscribe();
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => checkRoomFull(roomId))
            .subscribe((status) => { if (status === 'SUBSCRIBED') checkRoomFull(roomId); });
        checkRoomFull(roomId);
    }

    // ===== 【核心修复】checkRoomFull：仅当房间为 waiting 时才初始化，避免重连覆盖状态 =====
    async function checkRoomFull(roomId) {
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);
        const count = players?.length || 0;
        updateStatus(`匹配中... ${count}/${config.MAX_PLAYERS_PER_ROOM}`);
        
        if (count >= config.MAX_PLAYERS_PER_ROOM) {
            clearTimeout(matchmakingTimer);
            // 获取房间当前状态
            const { data: room } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', roomId)
                .single();
            
            if (room && room.status === 'waiting') {
                // 正常满员开局
                log('📝 房间满员，更新状态为 battle 并初始化游戏');
                await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
                cleanup();
                await initializeGame(roomId, players);
            } else if (room && room.status === 'battle') {
                // 房间已是战斗状态（例如重连），直接进入对战，不重新初始化
                log('⚠️ 房间已是 battle 状态，跳过初始化，直接进入对战');
                cleanup();
                if (window.YYCardBattle?.enterBattle) {
                    window.YYCardBattle.enterBattle(roomId);
                } else {
                    log('❌ battle 模块未加载', true);
                }
            }
        }
    }

    async function initializeGame(roomId, players) {
        // 二次确认：防止并发导致重复初始化
        const { data: existing } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', roomId)
            .maybeSingle();
        if (existing) {
            log('⚠️ 游戏状态已存在，跳过初始化，直接进入对战');
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
        const { error } = await supabase.from('game_states').upsert({ room_id: roomId, state }, { onConflict: 'room_id' });
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
        leaveAndClean,
        currentRoom: getCurrentRoom
    };
})();

console.log('✅ matchmaking.js 加载完成（重连状态保护版）');
