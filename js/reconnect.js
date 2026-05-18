// ==================== 重连检测模块 (修复版) ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) {
            console.warn('[重连] 未登录，跳过检测');
            return;
        }

        console.log('[重连] 开始检测玩家:', uid.slice(0,8));

        const supabase = window.supabase;
        if (!supabase) {
            console.error('[重连] Supabase客户端不存在');
            return;
        }

        // 1. 直接查玩家在所有等待或战斗中的房间
        let myRoomPlayer = null;
        try {
            const { data, error } = await supabase
                .from('room_players')
                .select('room_id, is_bot')
                .eq('player_id', uid)
                .maybeSingle();

            if (error) throw error;
            myRoomPlayer = data;
            console.log('[重连] room_players 查询结果:', myRoomPlayer);
        } catch (err) {
            console.error('[重连] room_players 查询失败:', err.message);
            // 就算查询失败，也强制尝试清理一下残留数据（页面关闭时可能没清干净）
            await forceClean(uid);
            return;
        }

        if (!myRoomPlayer) {
            console.log('[重连] 无进行中游戏，无需重连');
            return;
        }

        const roomId = myRoomPlayer.room_id;
        console.log('[重连] 找到房间:', roomId.slice(0,8));

        // 2. 获取房间状态
        let room = null;
        try {
            const { data, error } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', roomId)
                .single();
            if (error) throw error;
            room = data;
            console.log('[重连] 房间状态:', room.status);
        } catch (err) {
            console.error('[重连] 查询房间状态失败:', err.message);
            // 房间可能被删了，直接清理自己的记录
            await forceClean(uid);
            return;
        }

        // 3. 根据状态弹窗或恢复匹配
        if (room.status === 'battle') {
            // ★ 强制弹窗，不依赖复杂的 gameState 判断
            const shouldReconnect = confirm(
                '检测到您有一场进行中的对局，是否重新连接？\n\n点击"确定"重连，点击"取消"放弃并开始新游戏。'
            );
            if (shouldReconnect) {
                console.log('[重连] 玩家选择重连');
                document.getElementById('lobby-view').style.display = 'none';
                document.getElementById('battle-view').style.display = 'block';
                if (window.YYCardMatchmaking) {
                    window.YYCardMatchmaking.setCurrentRoom(roomId);
                }
                if (window.YYCardBattle?.enterBattle) {
                    await window.YYCardBattle.enterBattle(roomId);
                }
                if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
            } else {
                console.log('[重连] 玩家放弃重连，清理记录');
                await forceClean(uid, roomId);
            }
        } else if (room.status === 'waiting') {
            // 恢复匹配状态，但不弹窗
            console.log('[重连] 恢复等待中匹配');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
                window.YYCardMatchmaking.subscribeToRoom(roomId);
            }
            document.getElementById('start-match-btn').disabled = true;
            document.getElementById('start-match-btn').textContent = '⏳ 匹配中...';
            document.getElementById('match-status').style.display = 'block';
            document.getElementById('cancel-match-btn').style.display = 'inline-block';
        } else {
            // 状态异常，清理
            await forceClean(uid, roomId);
        }
    }

    // 强力清理函数，不管什么情况都把玩家记录删掉
    async function forceClean(uid, roomId = null) {
        const supabase = window.supabase;
        console.log('[重连] 执行强制清理，uid:', uid.slice(0,8));
        try {
            // 删除自己的 room_players 记录
            await supabase.from('room_players').delete().eq('player_id', uid);
            // 如果提供了 roomId，检查房间是否还有真人，没有就删房间相关数据
            if (roomId) {
                const { data: realPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_id', roomId)
                    .eq('is_bot', false);
                if (!realPlayers || realPlayers.length === 0) {
                    console.log('[重连] 房间无真人，清理游戏状态和房间');
                    await supabase.from('game_states').delete().eq('room_id', roomId);
                    await supabase.from('rooms').delete().eq('id', roomId);
                }
            }
            // 最后，重置 UI
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            }
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
