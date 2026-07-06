// ==================== 重连检测模块（修复：退出恢复大厅 + 导航栏） ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // 触觉反馈工具
    function triggerHaptic(style = 'medium') {
        const tg = window.Telegram?.WebApp;
        if (tg?.HapticFeedback) {
            if (style === 'light') tg.HapticFeedback.impactOccurred('light');
            else if (style === 'heavy') tg.HapticFeedback.impactOccurred('heavy');
            else tg.HapticFeedback.impactOccurred('medium');
        } else if (navigator.vibrate) {
            navigator.vibrate(style === 'heavy' ? 30 : 20);
        }
    }

    // 获取导航栏的辅助函数
    function getBottomNav() {
        return document.getElementById('yy-nav');
    }

    // 恢复大厅状态（显示大厅视图、导航栏，清理残留的匹配状态）
    function restoreLobbyUI() {
        const lobbyView = document.getElementById('lobby-view');
        const battleView = document.getElementById('battle-view');
        const bottomNav = getBottomNav();

        if (lobbyView) lobbyView.style.display = 'block';
        if (battleView) battleView.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'flex';

        // 清理可能残留的匹配 UI 状态
        if (window.YYCardMatchmaking?.resetUI) {
            window.YYCardMatchmaking.resetUI();
        }
    }

    // 重连弹窗
    function showReconnectModal(roomId, uid, supabase) {
        const old = document.getElementById("reconnect-modal");
        if (old) old.remove();

        const mask = document.createElement("div");
        mask.className = "reconnect-mask";
        mask.id = "reconnect-modal";
        mask.classList.add("active");

        const panel = document.createElement("div");
        panel.className = "reconnect-panel";

        panel.innerHTML = `
            <div>
                <div class="reconnect-title">⚠️ 对局未结束</div>
                <div class="reconnect-desc">
                    检测到你有一场进行中的战斗<br/>
                    是否重新进入战场？
                </div>
            </div>

            <div class="reconnect-actions">
                <button class="reconnect-btn no" id="reconnect-no">
                    去意已决
                </button>
                <button class="reconnect-btn yes" id="reconnect-yes">
                    重返战场
                </button>
            </div>
        `;

        mask.appendChild(panel);
        document.body.appendChild(mask);

        // 重返战场
        panel.querySelector("#reconnect-yes").onclick = async () => {
            triggerHaptic('heavy');
            panel.style.transform = "scale(0.98)";
            panel.style.transition = "0.1s";

            setTimeout(() => {
                mask.remove();
            }, 120);

            setTimeout(async () => {
                document.getElementById("lobby-view").style.display = "none";
                document.getElementById("battle-view").style.display = "block";

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

        // 去意已决 —— 清理并恢复大厅界面
        panel.querySelector("#reconnect-no").onclick = async () => {
            mask.remove();
            await forceClean(uid, roomId, supabase);
            restoreLobbyUI();   // ★ 恢复大厅和导航栏
        };
    }

    // 检测
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
            restoreLobbyUI();   // ★ 失败也恢复 UI
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
            restoreLobbyUI();
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
            restoreLobbyUI();
        }
    }

    // 强力清理
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
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
