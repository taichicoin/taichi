// ==================== 重连检测模块（最终版：修复遮罩显示 + 触觉反馈增强） ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // ★ 触觉反馈工具（优先 Telegram，回退普通浏览器）
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

    // ★ 升级版 V2 弹窗（游戏化增强）
    function showReconnectModal(roomId, uid, supabase) {
        const old = document.getElementById("reconnect-modal");
        if (old) old.remove();

        // 遮罩
        const mask = document.createElement("div");
        mask.className = "reconnect-mask";
        mask.id = "reconnect-modal";
        mask.classList.add("active"); // ✅ 关键修复：激活遮罩显示

        // 面板
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

        // ===== 重返战场（增强反馈） =====
        panel.querySelector("#reconnect-yes").onclick = async () => {
            // 1. 触觉反馈（电报原生震动）
            triggerHaptic('heavy');

            // 2. 面板按压动画
            panel.style.transform = "scale(0.98)";
            panel.style.transition = "0.1s";

            // 3. 短暂延迟后移除遮罩，切场感更强
            setTimeout(() => {
                mask.remove();
            }, 120);

            // 4. 进入战场（延迟执行，制造切场节奏）
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

        // ===== 去意已决（仅清理） =====
        panel.querySelector("#reconnect-no").onclick = async () => {
            mask.remove();
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

        console.log('[重连] 开始检测玩家:', uid.slice(0,8));

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

    // 强力清理函数
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
