// ==================== 重连检测模块 (保留边框，无其它特效) ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    function showReconnectModal(roomId, uid, supabase) {
        const oldModal = document.getElementById('reconnect-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'reconnect-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const popup = document.createElement('div');
        // ★ 加上原来的边框样式，同时保留百分比尺寸、背景图铺满
        popup.style.cssText = `
            position: fixed;
            top: 8%;
            bottom: 8%;
            left: 6%;
            right: 6%;
            background: url('/assets/recobg.png') no-repeat center center;
            background-size: 100% 100%;
            border: 2px solid #f5d76e;
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #fff;
            font-family: 'Segoe UI', Roboto, sans-serif;
            padding: 8% 6%;
            box-sizing: border-box;
        `;

        popup.innerHTML = `
            <div style="
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4vh;
            ">
                <div style="font-size: clamp(18px, 5vw, 28px); font-weight: bold; text-shadow: 1px 1px 2px #000;">
                    ⚠️ 检测到进行中的对局
                </div>
                <div style="font-size: clamp(14px, 3.5vw, 18px); text-shadow: 1px 1px 1px #000;">
                    你有一场未结束的战斗，是否重新连接？
                </div>
                <div style="display: flex; flex-direction: column; gap: 2vh; width: 70%; min-width: 180px;">
                    <button id="reconnect-yes" style="
                        width: 100%;
                        padding: 2px 0;
                        background: #f5c542;
                        color: #1a1a2e;
                        border: none;
                        border-radius: 8px;
                        font-size: clamp(14px, 4vw, 18px);
                        font-weight: bold;
                        cursor: pointer;
                    "> 重返战场</button>
                    <button id="reconnect-no" style="
                        width: 100%;
                        padding: 1px 0;
                        background: #3a4a6a;
                        color: #fff;
                        border: none;
                        border-radius: 8px;
                        font-size: clamp(14px, 4vw, 18px);
                        font-weight: bold;
                        cursor: pointer;
                    "> 去意已决</button>
                </div>
            </div>
        `;

        modal.appendChild(popup);
        document.body.appendChild(modal);

        document.getElementById('reconnect-yes').addEventListener('click', async () => {
            modal.remove();
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
        });

        document.getElementById('reconnect-no').addEventListener('click', async () => {
            modal.remove();
            console.log('[重连] 玩家选择退出并清理');
            await forceClean(uid, roomId, supabase);
        });
    }

    async function check() { /* 保持不变，和之前完全一样 */ 
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
        console.log('[重连] 找到房间:', roomId.slice(0,8));
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
        if (room.status === 'battle') {
            console.log('[重连] 检测到战斗中的房间，弹出重连窗口');
            showReconnectModal(roomId, uid, supabase);
        } else if (room.status === 'waiting') {
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
            await forceClean(uid, roomId, supabase);
        }
    }

    async function forceClean(uid, roomId, supabase) {
        if (!supabase) supabase = window.supabase;
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
