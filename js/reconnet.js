// ==================== 重连检测模块 (UI重构版) ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // ★ 弹窗：完全使用 CSS class，无内联样式
    function showReconnectModal(roomId, uid, supabase) {
        const oldModal = document.getElementById('reconnect-modal');
        if (oldModal) oldModal.remove();

        // 遮罩
        const mask = document.createElement('div');
        mask.className = 'reconnect-mask';
        mask.id = 'reconnect-modal';

        // 面板
        const panel = document.createElement('div');
        panel.className = 'reconnect-panel';
        panel.innerHTML = `
            <div>
                <div class="reconnect-title">⚠️ 对局未结束</div>
                <div class="reconnect-desc">
                    检测到你有一场进行中的战斗<br/>
                    是否重新进入战场？
                </div>
            </div>
            <div class="reconnect-actions">
                <button class="reconnect-btn no" id="reconnect-no">去意已决</button>
                <button class="reconnect-btn yes" id="reconnect-yes">重返战场</button>
            </div>
        `;

        mask.appendChild(panel);
        document.body.appendChild(mask);

        // 绑定事件
        panel.querySelector('#reconnect-yes').onclick = async () => {
            mask.remove();
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
        };

        panel.querySelector('#reconnect-no').onclick = async () => {
            mask.remove();
            console.log('[重连] 玩家选择退出并清理');
            await forceClean(uid, roomId, supabase);
        };
    }

    // 检测是否有未结束对局
    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) {
            console.log('[重连] 未登录，跳过检测');
            return;
        }
        console.log('[重连] 开始检测玩家:', uid.slice(0, 8));

        const supabase = window.supabase;
        if (!supabase) {
            console.error('[重连] Supabase客户端不存在');
            return;
        }

        // 1. 查找玩家所在房间
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
            await forceClean(uid, null, supabase);
            return;
        }

        if (!myRoomPlayer) {
            console.log('[重连] 无进行中游戏，无需重连');
            return;
        }

        const roomId = myRoomPlayer.room_id;
        console.log('[重连] 找到房间:', roomId.slice(0, 8));

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
            await forceClean(uid, null, supabase);
            return;
        }

        // 3. 战斗中则弹出重连窗口
        if (room.status === 'battle') {
            console.log('[重连] 检测到战斗中的房间，弹出重连窗口');
            showReconnectModal(roomId, uid, supabase);
        } else if (room.status === 'waiting') {
            console.log('[重连] 恢复等待中匹配');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
                // 恢复 UI（通过 matchmaking 的 resetUI 回调）
                if (window.YYCardMatchmaking.resetUI) {
                    window.YYCardMatchmaking.resetUI();
                }
            }
        } else {
            await forceClean(uid, roomId, supabase);
        }
    }

    // 强力清理函数（保留原有逻辑，但改为调用 matchmaking 的 resetUI）
    async function forceClean(uid, roomId, supabase) {
        if (!supabase) supabase = window.supabase;
        console.log('[重连] 执行强制清理，uid:', uid.slice(0, 8));
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
            // 通知匹配模块重置 UI（如果提供）
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            }
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
