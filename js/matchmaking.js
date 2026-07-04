// /js/matchmaking.js (解耦版 + resetUI)
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 核心状态
    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;
    let checkRoomPollTimer = null;
    let isMatching = false;
    let isProcessing = false;
    let subscribeRetryCount = 0;
    const MAX_SUBSCRIBE_RETRY = 3;

    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // 回调接口（由 createRoom.js 注入）
    let _uiCallbacks = {
        onStartMatching: null,
        onCancelMatching: null,
        onStatusUpdate: null,
        onMatchFound: null,
        onCleanup: null
    };

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console[isError ? 'error' : 'log'](`[匹配系统] ${msg}`);
        }
    }

    // ==================== 内部工具 ====================
    function cleanup() {
        if (roomSubscription) { roomSubscription.unsubscribe(); roomSubscription = null; log('✅ 旧房间订阅已清理'); }
        if (matchmakingTimer) { clearTimeout(matchmakingTimer); matchmakingTimer = null; log('✅ 匹配超时定时器已清理'); }
        if (checkRoomPollTimer) { clearInterval(checkRoomPollTimer); checkRoomPollTimer = null; log('✅ 人数校验兜底轮询已清理'); }
        isMatching = false;
        isProcessing = false;
        currentRoom = null;
    }

    async function cleanPlayerResidualRooms(uid, excludeRoomId = null) {
        if (!uid) return;
        log(`🧹 正在清理玩家 ${uid.slice(0,8)} 的残留房间...`);
        let query = supabase.from('room_players').select('room_id').eq('player_id', uid);
        if (excludeRoomId) query = query.neq('room_id', excludeRoomId);
        const { data: myRooms } = await query;
        const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];
        if (roomIds.length > 0) {
            let deleteQuery = supabase.from('room_players').delete().eq('player_id', uid);
            if (excludeRoomId) deleteQuery = deleteQuery.neq('room_id', excludeRoomId);
            await deleteQuery;
            log(`✅ 玩家 ${roomIds.length} 条残留房间记录已删除`);
        }
        for (const roomId of roomIds) {
            await cleanRoomIfEmpty(roomId);
        }
        log(`✅ 残留房间清理完成`);
    }

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

    async function checkBetaAccess(uid, profile) {
        let isBeta = profile?.beta_tester;
        if (typeof isBeta === 'boolean') return isBeta;
        const { data, error } = await supabase
            .from('profiles')
            .select('beta_tester')
            .eq('id', uid)
            .single();
        if (error) {
            log(`❌ 获取内测权限失败: ${error.message}`, true);
            return false;
        }
        isBeta = data?.beta_tester || false;
        if (profile) profile.beta_tester = isBeta;
        return isBeta;
    }

    // ==================== 核心匹配流程 ====================
    async function start() {
        if (isProcessing || isMatching) { log('⚠️ 匹配已在进行中，请勿重复操作'); return; }
        isProcessing = true;

        const profile = auth?.currentProfile;
        const uid = auth?.currentUser?.id;
        if (!profile?.username || !uid) {
            if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
            isProcessing = false;
            return;
        }

        const isBeta = await checkBetaAccess(uid, profile);
        if (!isBeta) {
            log('⛔ 非内测用户，无法匹配', true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('您不是内测用户，暂无法匹配', true);
            isProcessing = false;
            return;
        }

        cleanup();
        isMatching = true;
        log('🔍 开始匹配...');

        // 通知 UI 层开始匹配
        if (_uiCallbacks.onStartMatching) _uiCallbacks.onStartMatching();

        await cleanPlayerResidualRooms(uid);

        const myMmr = profile.mmr || config.INITIAL_MMR;
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const matchTimeout = config.MATCHMAKING_TIMEOUT_MS || 15000;

        try {
            let { data: waitingRooms } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .order('created_at', { ascending: true })
                .limit(1);
            let room = waitingRooms?.[0];
            if (!room) {
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({ status: 'waiting', max_players: maxPlayers, created_at: new Date().toISOString() })
                    .select('*')
                    .single();
                if (createError) throw createError;
                room = newRoom;
                log(`✅ 创建新房间: ${room.id.slice(0,8)}`);
            } else {
                log(`✅ 找到可加入房间: ${room.id.slice(0,8)}`);
            }
            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', uid)
                .maybeSingle();
            if (existing) {
                log('⚠️ 已在房间中，恢复订阅');
                currentRoom = room;
                startMatchTimers(room.id, matchTimeout);
                subscribeToRoom(room.id);
                isProcessing = false;
                return;
            }
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
            startMatchTimers(room.id, matchTimeout);
            subscribeToRoom(room.id);
            log(`✅ 成功加入房间: ${room.id.slice(0,8)}`);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            cleanup();
            if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
        } finally {
            isProcessing = false;
        }
    }

    function startMatchTimers(roomId, timeoutMs) {
        if (matchmakingTimer) clearTimeout(matchmakingTimer);
        if (checkRoomPollTimer) clearInterval(checkRoomPollTimer);
        matchmakingTimer = setTimeout(() => handleTimeout(roomId), timeoutMs);
        log(`✅ 匹配超时定时器已开启，${timeoutMs/1000}秒后触发补人机`);
        checkRoomPollTimer = setInterval(() => {
            if (!isMatching || !currentRoom) { clearInterval(checkRoomPollTimer); checkRoomPollTimer = null; return; }
            checkRoomFull(roomId);
        }, 2000);
        log(`✅ 人数校验兜底轮询已开启，每2秒执行一次`);
    }

    async function cancel() {
        if (isProcessing) { log('⚠️ 正在处理匹配中，无法取消'); return; }
        log('🛑 玩家取消匹配');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        cleanup();
        if (uid) await cleanPlayerResidualRooms(uid, roomId);
        if (_uiCallbacks.onCancelMatching) _uiCallbacks.onCancelMatching();
    }

    async function leaveAndClean() {
        log('🚪 主动退出，执行全量清理...');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        cleanup();
        if (uid) await cleanPlayerResidualRooms(uid, roomId);
        if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
    }

    async function handleTimeout(roomId) {
        if (!currentRoom || currentRoom.id !== roomId || !isMatching || isProcessing) {
            log('⚠️ 超时触发时无有效匹配状态，忽略');
            return;
        }
        isProcessing = true;
        log('⏰ 匹配超时，开始填充人机...');
        try {
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            const { data: existingPlayers } = await supabase
                .from('room_players')
                .select('player_id, is_bot')
                .eq('room_id', roomId);
            const existingIds = existingPlayers?.map(p => p.player_id) || [];
            const realPlayerCount = existingPlayers?.filter(p => !p.is_bot).length || 0;
            const neededBots = maxPlayers - existingIds.length;
            log(`📊 当前房间人数: ${existingIds.length}/${maxPlayers}，真人: ${realPlayerCount}，需要填充 ${neededBots} 个人机`);
            if (realPlayerCount === 0) {
                log('⚠️ 房间内无真人，停止补人机，清理房间');
                await cleanRoomIfEmpty(roomId);
                cleanup();
                if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
                return;
            }
            if (neededBots <= 0) {
                await checkRoomFull(roomId);
                return;
            }
            const { data: allBots, error: botError } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_bot', true)
                .limit(200);
            if (botError || !allBots || allBots.length === 0) throw new Error('数据库中没有预制人机，无法填充');
            const availableBots = allBots.map(b => b.id).filter(id => !existingIds.includes(id)).slice(0, neededBots);
            if (availableBots.length < neededBots) throw new Error(`可用人机不足，需要 ${neededBots}，实际 ${availableBots.length}`);
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
            let checkRetry = 0;
            const maxCheckRetry = 3;
            const checkInterval = 800;
            while (checkRetry < maxCheckRetry) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                const { data: latestPlayers } = await supabase.from('room_players').select('player_id').eq('room_id', roomId);
                const latestCount = latestPlayers?.length || 0;
                if (latestCount >= maxPlayers) {
                    log(`✅ 第${checkRetry+1}次校验，人数已达标: ${latestCount}/${maxPlayers}`);
                    await checkRoomFull(roomId);
                    return;
                }
                checkRetry++;
                log(`⚠️ 第${checkRetry}次校验，人数未达标，继续等待...`);
            }
            log(`⚠️ 重试${maxCheckRetry}次后仍未完全同步，强制触发游戏开始校验`);
            await checkRoomFull(roomId);
        } catch (err) {
            log(`❌ 人机填充失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('匹配超时，人机填充失败，请重试', true);
            cleanup();
            if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
        } finally {
            isProcessing = false;
        }
    }

    function subscribeToRoom(roomId) {
        if (roomSubscription) { roomSubscription.unsubscribe(); roomSubscription = null; }
        log(`📡 开始订阅房间: ${roomId.slice(0,8)}，重试次数: ${subscribeRetryCount}`);
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
                if (isProcessing) return;
                checkRoomFull(roomId);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
                const newStatus = payload.new.status;
                log(`📡 房间状态更新: ${newStatus}`);
                if (newStatus === 'battle') {
                    cleanup();
                    if (_uiCallbacks.onMatchFound) _uiCallbacks.onMatchFound(roomId);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    log(`✅ 房间订阅成功`);
                    subscribeRetryCount = 0;
                    checkRoomFull(roomId);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    log(`❌ 房间订阅失败，状态: ${status}`, true);
                    if (subscribeRetryCount < MAX_SUBSCRIBE_RETRY) {
                        subscribeRetryCount++;
                        log(`🔄 第${subscribeRetryCount}次重试订阅...`);
                        setTimeout(() => subscribeToRoom(roomId), 1000 * subscribeRetryCount);
                    } else {
                        log(`❌ 订阅重试次数耗尽，匹配失败`, true);
                        if (window.YYCardShop?.toast) window.YYCardShop.toast('房间连接失败，请重试', true);
                        cleanup();
                        if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
                    }
                }
            });
    }

    async function checkRoomFull(roomId) {
        if (isProcessing || !isMatching || !currentRoom || currentRoom.id !== roomId) return;
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const { data: players } = await supabase.from('room_players').select('*').eq('room_id', roomId);
        const count = players?.length || 0;
        const realPlayerCount = players?.filter(p => !p.is_bot).length || 0;
        if (_uiCallbacks.onStatusUpdate) _uiCallbacks.onStatusUpdate(`匹配中... ${count}/${maxPlayers}`);
        log(`📊 房间人数校验: ${count}/${maxPlayers}，真人: ${realPlayerCount}`);
        if (realPlayerCount === 0) {
            log('⚠️ 房间内无真人，清理房间');
            await cleanRoomIfEmpty(roomId);
            cleanup();
            if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
            return;
        }
        if (count >= maxPlayers) {
            isProcessing = true;
            log('📝 房间满员，开始游戏初始化流程');
            try {
                const { data: updatedRoom, error: updateError } = await supabase
                    .from('rooms')
                    .update({ status: 'battle' })
                    .eq('id', roomId)
                    .eq('status', 'waiting')
                    .select('*')
                    .single();
                if (updateError || !updatedRoom) {
                    log('⚠️ 房间状态已被其他玩家更新，直接进入对战');
                    cleanup();
                    if (_uiCallbacks.onMatchFound) _uiCallbacks.onMatchFound(roomId);
                    return;
                }
                log('✅ 房间状态已更新为battle，开始初始化游戏');
                await initializeGame(roomId, players);
                cleanup();
                if (_uiCallbacks.onMatchFound) _uiCallbacks.onMatchFound(roomId);
            } catch (err) {
                log(`❌ 游戏开始流程失败: ${err.message}`, true);
                isProcessing = false;
                cleanup();
                if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
            }
        }
    }

    async function initializeGame(roomId, players) {
        log('🎮 开始初始化游戏状态（后端生成卡组）...');
        try {
            const { data: existing } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .eq('user_id', GLOBAL_USER_ID)
                .maybeSingle();
            if (existing) {
                log('⚠️ 游戏状态已存在，跳过初始化');
                return;
            }
            const userIds = players.map(p => p.player_id);
            const { data: result, error: initError } = await supabase.functions.invoke('init-game', {
                body: { roomId, userIds }
            });
            if (initError || !result?.success) {
                throw new Error(initError?.message || result?.error || '初始化失败');
            }
            log('🎉 游戏初始化完成（后端生成卡组）');
        } catch (err) {
            log(`❌ 游戏状态写入失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('游戏初始化失败，请重试', true);
            throw err;
        }
    }

    function setCurrentRoom(roomId) {
        cleanup();
        currentRoom = { id: roomId };
        isMatching = true;
        startMatchTimers(roomId, config.MATCHMAKING_TIMEOUT_MS || 15000);
        subscribeToRoom(roomId);
        log(`✅ 当前房间已设置: ${roomId.slice(0,8)}`);
    }

    function getCurrentRoomId() {
        return currentRoom?.id || null;
    }

    // ==================== 公开 API ====================
    return {
        start,
        cancel,
        setCurrentRoom,
        subscribeToRoom,
        leaveAndClean,
        getCurrentRoomId,
        currentRoom: () => currentRoom,
        setUICallbacks: function(callbacks) {
            _uiCallbacks = { ..._uiCallbacks, ...callbacks };
        },
        // 重置 UI（供重连模块使用）
        resetUI: function() {
            cleanup();
            if (_uiCallbacks.onCleanup) _uiCallbacks.onCleanup();
        }
    };
})();

console.log('✅ matchmaking.js 加载完成（解耦版）');
