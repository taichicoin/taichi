// /js/reconnect.js (修复底部导航遮挡 + 修正 waiting 处理)
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    function showReconnectModal(roomId, uid, supabase) {
        const oldModal = document.getElementById('reconnect-modal');
        if (oldModal) oldModal.remove();

        const mask = document.createElement('div');
        mask.className = 'reconnect-mask';
        mask.id = 'reconnect-modal';

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

        // 重返战场
        panel.querySelector('#reconnect-yes').onclick = async () => {
            if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
            panel.style.transform = 'scale(0.98)';
            panel.style.transition = '0.1s';
            setTimeout(() => mask.remove(), 120);
            setTimeout(async () => {
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
            }, 180);
        };

        // 去意已决
        panel.querySelector('#reconnect-no').onclick = async () => {
            mask.remove();
            await forceClean(uid, roomId, supabase);
        };
    }

    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) return;

        const supabase = window.supabase;
        if (!supabase) return;

        // 1. 查找所在房间
        let myRoomPlayer = null;
        try {
            const { data, error } = await supabase
                .from('room_players')
                .select('room_id, is_bot')
                .eq('player_id', uid)
                .maybeSingle();
            if (error) throw error;
            myRoomPlayer = data;
        } catch (err) {
            console.error('[重连] 查询失败:', err.message);
            await forceClean(uid, null, supabase);
            return;
        }

        if (!myRoomPlayer) {
            console.log('[重连] 无进行中游戏');
            return;
        }

        const roomId = myRoomPlayer.room_id;

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
        } catch (err) {
            console.error('[重连] 房间状态查询失败:', err.message);
            await forceClean(uid, null, supabase);
            return;
        }

        // 3. 根据状态处理
        if (room.status === 'battle') {
            showReconnectModal(roomId, uid, supabase);
        } else if (room.status === 'waiting') {
            // 修复：等待中的房间，应该让玩家回到匹配房间并显示“匹配中”状态
            // 直接调用匹配模块的 setCurrentRoom 恢复订阅，然后通过 createRoom 显示房间
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
            }
            // 如果 createRoom 已初始化，则直接显示匹配房间并进入匹配状态
            if (window.YYCardCreateRoom && window.YYCardCreateRoom.showRoom) {
                window.YYCardCreateRoom.showRoom();
                // 手动触发匹配开始 UI（因为 setCurrentRoom 会启动订阅，但不会触发 onStartMatching 回调）
                // 我们需要模拟匹配中状态
                const startBtn = document.getElementById('start-match-btn');
                const cancelBtn = document.getElementById('cancel-match-btn');
                const statusEl = document.getElementById('match-status');
                if (startBtn) {
                    startBtn.style.display = 'none';
                }
                if (cancelBtn) {
                    cancelBtn.style.display = 'block';
                }
                if (statusEl) {
                    statusEl.textContent = '正在匹配...';
                }
            }
        } else {
            await forceClean(uid, roomId, supabase);
        }
    }

    async function forceClean(uid, roomId, supabase) {
        if (!supabase) supabase = window.supabase;
        try {
            await supabase.from('room_players').delete().eq('player_id', uid);
            if (roomId) {
                const { data: realPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_id', roomId)
                    .eq('is_bot', false);
                if (!realPlayers || realPlayers.length === 0) {
                    await supabase.from('game_states').delete().eq('room_id', roomId);
                    await supabase.from('rooms').delete().eq('id', roomId);
                }
            }
            // 重置匹配 UI（会隐藏匹配房间并回到大厅）
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            }
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
