// ==================== 匹配系统（含人机填充 + 进入对战） ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;

    // 日志输出
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    // 更新匹配状态显示
    function updateStatus(text, show = true) {
        const el = document.getElementById('match-status');
        if (el) {
            el.style.display = show ? 'block' : 'none';
            el.textContent = text;
        }
    }

    // 重置UI（启用匹配按钮，隐藏状态）
    function resetUI() {
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            startBtn.disabled = !auth.currentProfile?.username;
            startBtn.textContent = auth.currentProfile?.username ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        updateStatus('', false);
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
    }

    // 清理房间订阅和计时器
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

    // 开始匹配
    async function start() {
        const startBtn = document.getElementById('start-match-btn');
        
        // 防重复点击
        if (startBtn.disabled) {
            log('⚠️ 匹配已在进行中，请稍候...');
            return;
        }

        if (!auth.currentProfile || !auth.currentProfile.username) {
            alert('请先设置游戏ID');
            return;
        }

        log('🔍 开始匹配...');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);

        // 显示取消匹配按钮（如果存在）
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        const myMmr = auth.currentProfile.mmr || 1000;

        // 启动超时计时器
        matchmakingTimer = setTimeout(() => {
            log('⏰ 匹配超时，将使用人机填充');
            handleTimeout();
        }, config.MATCHMAKING_TIMEOUT_MS);

        try {
            // 查找等待中的房间
            let { data: waitingRooms, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .limit(1);

            if (error) throw error;

            let room = waitingRooms?.[0];

            if (!room) {
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({ status: 'waiting', max_players: config.MAX_PLAYERS })
                    .select('*')
                    .single();

                if (createError) throw createError;
                room = newRoom;
                log(`✅ 创建新房间: ${room.id}`);
            } else {
                log(`✅ 加入现有房间: ${room.id}`);
            }

            // 检查是否已在该房间中
            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', auth.currentUser.id)
                .maybeSingle();

            if (existing) {
                log('⚠️ 您已在此房间中，继续监听...');
                currentRoom = room;
                subscribeToRoom(room.id);
                return;
            }

            // 加入房间
            const { error: joinError } = await supabase
                .from('room_players')
                .insert({
                    room_id: room.id,
                    player_id: auth.currentUser.id,
                    mmr_at_join: myMmr,
                    health: 100,
                    is_bot: false
                });

            if (joinError) throw joinError;

            currentRoom = room;
            subscribeToRoom(room.id);

        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            resetUI();
            const cancelBtn = document.getElementById('cancel-match-btn');
            if (cancelBtn) cancelBtn.style.display = 'none';
        }
    }

    // 取消匹配
    async function cancel() {
        if (!currentRoom) {
            resetUI();
            return;
        }

        log('🛑 正在取消匹配...');
        cleanup();

        // 从房间移除自己
        const { error } = await supabase
            .from('room_players')
            .delete()
            .eq('room_id', currentRoom.id)
            .eq('player_id', auth.currentUser.id);

        if (error) {
            log(`❌ 取消匹配失败: ${error.message}`, true);
        } else {
            log('✅ 已退出匹配队列');
        }

        // 检查房间是否还有真人玩家
        const { data: remaining } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', currentRoom.id)
            .eq('is_bot', false);

        // 如果没有真人玩家了，删除房间和游戏状态
        if (!remaining || remaining.length === 0) {
            await supabase.from('game_states').delete().eq('room_id', currentRoom.id);
            await supabase.from('rooms').delete().eq('id', currentRoom.id);
            log('🧹 房间已清空');
        }

        currentRoom = null;
        resetUI();
        
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    // 处理超时
    async function handleTimeout() {
        if (!currentRoom) return;

        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', currentRoom.id);

        const currentCount = players?.length || 0;
        const neededBots = config.MAX_PLAYERS - currentCount;

        if (neededBots <= 0) return;

        log(`🤖 需要填充 ${neededBots} 个人机`);

        const botPromises = [];
        for (let i = 0; i < neededBots; i++) {
            botPromises.push(
                supabase.from('room_players').insert({
                    room_id: currentRoom.id,
                    player_id: `bot_${Date.now()}_${i}`,
                    mmr_at_join: 1000,
                    health: 100,
                    is_bot: true
                })
            );
        }
        await Promise.all(botPromises);
        log(`✅ 已添加 ${neededBots} 个人机`);
    }

    // 订阅房间变化
    function subscribeToRoom(roomId) {
        if (roomSubscription) {
            roomSubscription.unsubscribe();
        }

        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'room_players',
                filter: `room_id=eq.${roomId}`
            }, async () => {
                await checkRoomFull(roomId);
            })
            .subscribe();

        checkRoomFull(roomId);
    }

    // 检查房间是否满员
    async function checkRoomFull(roomId) {
        const { data: players, error } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);

        if (error) {
            log(`❌ 获取房间人数失败: ${error.message}`, true);
            return;
        }

        const playerCount = players?.length || 0;
        updateStatus(`匹配中... ${playerCount}/${config.MAX_PLAYERS}`);

        if (playerCount >= config.MAX_PLAYERS) {
            if (matchmakingTimer) {
                clearTimeout(matchmakingTimer);
                matchmakingTimer = null;
            }

            await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);

            cleanup(); // 取消订阅

            log('🎮 房间已满，开始游戏！');
            updateStatus('', false);
            
            const cancelBtn = document.getElementById('cancel-match-btn');
            if (cancelBtn) cancelBtn.style.display = 'none';

            await initializeGame(roomId, players);
        }
    }

    // 初始化游戏状态
    async function initializeGame(roomId, players) {
        const state = {
            round: 1,
            phase: 'prepare',
            players: {}
        };

        players.forEach(p => {
            const isBot = p.is_bot || p.player_id.startsWith('bot_');
            const deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();

            state.players[p.player_id] = {
                health: 100,
                gold: 5,
                exp: 0,
                shopLevel: 1,
                board: deck.slice(0, 3),
                hand: deck.slice(3, 6),
                shopCards: utils.generateShopCards(1),
                isBot: isBot
            };
        });

        await supabase
            .from('game_states')
            .upsert({ room_id: roomId, state }, { onConflict: 'room_id' });

        log('🎉 游戏初始化完成，进入对战！');
        
        // ===== 切换到对战视图 =====
        if (window.YYCardBattle && typeof window.YYCardBattle.enterBattle === 'function') {
            window.YYCardBattle.enterBattle(roomId);
        } else {
            log('❌ 对战模块未加载', true);
            alert('游戏开始！对战界面开发中...');
        }
        
        resetUI();
    }

    // 公开 API
    return {
        start: start,
        cancel: cancel,
        currentRoom: () => currentRoom
    };
})();

console.log('✅ matchmaking.js 加载完成');
