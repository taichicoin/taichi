// /js/reconnect.js (完整交互版：震动+缩放+切场+扫光动画+防遮挡)
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // ★ 弹窗：保留所有游戏化交互
    function showReconnectModal(roomId, uid, supabase) {
        console.log('[重连] 开始创建重连弹窗');
        const old = document.getElementById('reconnect-modal');
        if (old) old.remove();

        // 遮罩
        const mask = document.createElement('div');
        mask.className = 'reconnect-mask';
        mask.id = 'reconnect-modal';
        mask.style.setProperty('z-index', '999999', 'important');

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

        // 重返战场（YES）——完整交互
        panel.querySelector('#reconnect-yes').onclick = async () => {
            // 1. 震动反馈
            if (navigator.vibrate) {
                navigator.vibrate([20, 30, 20]);
            }

            // 2. 点击缩放反馈
            panel.style.transform = 'scale(0.98)';
            panel.style.transition = '0.1s';

            // 3. 短暂延迟后移除弹窗（让缩放效果可见）
            setTimeout(() => {
                mask.remove();
            }, 120);

            // 4. 延迟进入战斗（切场感）
            setTimeout(async () => {
                document.getElementById('lobby-view').style.display = 'none';
                document.getElementById('battle-view').style.display = 'block';

                // 强制隐藏匹配房间（防遮挡）
                const mv = document.getElementById('match-room-view');
                if (mv) mv.style.setProperty('display', 'none', 'important');

                // 战斗模式下隐藏底部导航
                const nav = document.querySelector('.bottom-nav');
                if (nav) nav.style.display = 'none';

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

        // 去意已决（NO）
        panel.querySelector('#reconnect-no').onclick = async () => {
            mask.remove();
            console.log('[重连] 玩家选择退出并清理');
            await forceClean(uid, roomId, supabase);

            // 清理后确保底部导航可用
            const nav = document.querySelector('.bottom-nav');
            if (nav) nav.style.display = '';
        };
    }

    // 检测是否有未结束对局
    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        console.log('[重连] check() 开始，uid:', uid?.slice(0, 8));
        if (!uid) {
            console.log('[重连] 未登录，跳过');
            return;
        }

        const supabase = window.supabase;
        if (!supabase) {
            console.error('[重连] Supabase 客户端不存在');
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
            console.log('[重连] 无进行中游戏');
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

        // 3. 根据状态处理
        if (room.status === 'battle') {
            console.log('[重连] 状态为 battle，弹出重连弹窗');
            showReconnectModal(roomId, uid, supabase);
        } else if (room.status === 'waiting') {
            console.log('[重连] 状态为 waiting，恢复匹配房间');
            // 先清理可能残留的遮挡
            const mv = document.getElementById('match-room-view');
            if (mv) mv.style.setProperty('display', 'none', 'important');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
            }
            // 显示匹配房间
            if (window.YYCardCreateRoom && window.YYCardCreateRoom.showRoom) {
                window.YYCardCreateRoom.showRoom();
                // 手动切换到匹配中状态
                const startBtn = document.getElementById('start-match-btn');
                const cancelBtn = document.getElementById('cancel-match-btn');
                const statusEl = document.getElementById('match-status');
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'block';
                if (statusEl) statusEl.textContent = '正在匹配...';
            }
        } else {
            console.log('[重连] 其他状态，清理');
            await forceClean(uid, roomId, supabase);
        }
    }

    // 强力清理函数（保留原有逻辑 + UI 重置）
    async function forceClean(uid, roomId, supabase) {
        if (!supabase) supabase = window.supabase;
        console.log('[重连] 执行强制清理，uid:', uid?.slice(0, 8));
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
            // 重置匹配 UI（会隐藏匹配房间并回到大厅）
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            } else {
                // 手动强制清理遮挡
                const mv = document.getElementById('match-room-view');
                if (mv) mv.style.setProperty('display', 'none', 'important');
                const gameArea = document.getElementById('game-area');
                if (gameArea) gameArea.style.display = 'block';
                const nav = document.querySelector('.bottom-nav');
                if (nav) nav.style.display = '';
            }
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
