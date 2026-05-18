// ==================== 重连检测模块（带手机屏幕日志） ====================
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    // ========== 手机调试面板 ==========
    function ensureDebugPanel() {
        if (document.getElementById('reconnect-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'reconnect-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 0; right: 0; width: 100%; max-height: 30vh;
            overflow-y: auto; background: rgba(0,0,0,0.8); color: #0f0;
            font-family: monospace; font-size: 11px; padding: 6px; z-index: 100000;
            border-top: 1px solid #f5d76e; pointer-events: auto;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';
        const title = document.createElement('span');
        title.textContent = '🔍 重连检测日志';
        title.style.cssText = 'font-weight:bold; color:#ff0;';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖';
        closeBtn.style.cssText = 'background:none; border:none; color:#fff; font-size:14px; cursor:pointer;';
        closeBtn.onclick = () => panel.remove();
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const content = document.createElement('div');
        content.id = 'reconnect-debug-content';
        content.style.cssText = 'white-space:pre-wrap; word-break:break-all;';
        panel.appendChild(content);
        document.body.appendChild(panel);
    }

    function logToScreen(msg) {
        ensureDebugPanel();
        const content = document.getElementById('reconnect-debug-content');
        if (!content) return;
        const line = document.createElement('div');
        line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        content.appendChild(line);
        const panel = document.getElementById('reconnect-debug-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
        // 同时保留 console.log，方便 F12 查看
        console.log('[重连] ' + msg);
    }

    // ========== 重连核心逻辑 ==========
    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) {
            logToScreen('未登录，跳过重连检测');
            return;
        }

        logToScreen('开始重连检测，玩家ID: ' + uid.slice(0,8));
        const supabase = window.supabase;
        if (!supabase) {
            logToScreen('❌ Supabase客户端不存在');
            return;
        }

        // 1. 查找玩家在哪个房间
        let myRoomPlayer = null;
        try {
            logToScreen('正在查询 room_players 表...');
            const { data, error } = await supabase
                .from('room_players')
                .select('room_id, is_bot')
                .eq('player_id', uid)
                .maybeSingle();

            if (error) {
                logToScreen('❌ 查询失败: ' + error.message);
                await forceClean(uid);
                return;
            }
            myRoomPlayer = data;
            if (myRoomPlayer) {
                logToScreen('✅ 找到房间: ' + myRoomPlayer.room_id.slice(0,8));
            } else {
                logToScreen('ℹ️ 玩家不在任何房间，无需重连');
                return;
            }
        } catch (err) {
            logToScreen('❌ 查询异常: ' + err.message);
            await forceClean(uid);
            return;
        }

        const roomId = myRoomPlayer.room_id;

        // 2. 获取房间状态
        let room = null;
        try {
            logToScreen('查询房间状态...');
            const { data, error } = await supabase
                .from('rooms')
                .select('status')
                .eq('id', roomId)
                .single();
            if (error) {
                logToScreen('❌ 房间状态查询失败: ' + error.message);
                await forceClean(uid, roomId);
                return;
            }
            room = data;
            logToScreen('房间状态: ' + room.status);
        } catch (err) {
            logToScreen('❌ 查询房间异常: ' + err.message);
            await forceClean(uid, roomId);
            return;
        }

        // 3. 根据状态处理
        if (room.status === 'battle') {
            logToScreen('检测到战斗中的房间，弹出重连确认框...');
            // 强制弹窗
            const shouldReconnect = confirm(
                '检测到您有一场进行中的对局，是否重新连接？\n\n点击"确定"重连，点击"取消"放弃并开始新游戏。'
            );
            logToScreen('用户选择: ' + (shouldReconnect ? '重连' : '放弃'));

            if (shouldReconnect) {
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
                await forceClean(uid, roomId);
            }
        } else if (room.status === 'waiting') {
            logToScreen('房间等待中，恢复匹配状态');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
                window.YYCardMatchmaking.subscribeToRoom(roomId);
            }
            document.getElementById('start-match-btn').disabled = true;
            document.getElementById('start-match-btn').textContent = '⏳ 匹配中...';
            document.getElementById('match-status').style.display = 'block';
            document.getElementById('cancel-match-btn').style.display = 'inline-block';
        } else {
            logToScreen('房间状态异常，强制清理');
            await forceClean(uid, roomId);
        }
    }

    // 强制清理函数
    async function forceClean(uid, roomId = null) {
        logToScreen('开始强制清理...');
        const supabase = window.supabase;
        try {
            await supabase.from('room_players').delete().eq('player_id', uid);
            logToScreen('已删除玩家在 room_players 中的记录');
            if (roomId) {
                const { data: realPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_id', roomId)
                    .eq('is_bot', false);
                if (!realPlayers || realPlayers.length === 0) {
                    logToScreen('房间无真人，清理 game_states 和 rooms');
                    await supabase.from('game_states').delete().eq('room_id', roomId);
                    await supabase.from('rooms').delete().eq('id', roomId);
                }
            }
            // 重置 UI
            if (window.YYCardMatchmaking?.resetUI) {
                window.YYCardMatchmaking.resetUI();
            }
            logToScreen('✅ 清理完成');
        } catch (err) {
            logToScreen('❌ 清理失败: ' + err.message);
        }
    }

    return { check };
})();
