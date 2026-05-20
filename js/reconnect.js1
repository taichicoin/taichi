// ==================== 重连检测模块 (强制重连版) ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) {
            console.log('[重连] 未登录，跳过检测');
            return;
        }

        console.log('[重连] 开始检测玩家:', uid.slice(0,8));

        const supabase = window.supabase;
        if (!supabase) {
            console.error('[重连] Supabase客户端不存在');
            return;
        }

        // 1. 查找玩家在哪个房间
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
            await forceClean(uid);
            return;
        }

        // 3. ★ 强制重连：战斗中的房间直接进入，不弹窗
        if (room.status === 'battle') {
            console.log('[重连] 检测到战斗中的房间，强制重连');
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
        } else if (room.status === 'waiting') {
            // 等待中：恢复匹配状态，不弹窗
            console.log('[重连] 恢复等待中匹配');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
            }
            const startBtn = document.getElementById('start-match-btn');
            if (startBtn) {
                startBtn.disabled = true;
                startBtn.textContent = '⏳ 匹配中...';
            }
            const statusEl = document.getElementById('match-status');
            if (statusEl) statusEl.style.display = 'block';
            const cancelBtn = document.getElementById('cancel-match-btn');
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
        } else {
            // 状态异常，清理
            await forceClean(uid, roomId);
        }
    }

    // 强力清理函数
    async function forceClean(uid, roomId = null) {
        const supabase = window.supabase;
        console.log('[重连] 执行强制清理，uid:', uid.slice(0,8));
        try {
            await supabase.from('room_players').delete().eq('player_id', uid);
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
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            }
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
