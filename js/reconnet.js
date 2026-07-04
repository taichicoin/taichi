// /js/reconnect.js (无遮挡版 - 绝对纯净)
window.YYCardReconnect = (function() {
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    function showReconnectModal(roomId, uid, supabase) {
        const old = document.getElementById('reconnect-modal');
        if (old) old.remove();

        const mask = document.createElement('div');
        mask.className = 'reconnect-mask';
        mask.id = 'reconnect-modal';
        // 确保在最顶层，但不使用 important
        mask.style.zIndex = '100000';

        const panel = document.createElement('div');
        panel.className = 'reconnect-panel';
        panel.innerHTML = `
            <div>
                <div class="reconnect-title">⚠️ 对局未结束</div>
                <div class="reconnect-desc">检测到你有一场进行中的战斗<br/>是否重新进入战场？</div>
            </div>
            <div class="reconnect-actions">
                <button class="reconnect-btn no" id="reconnect-no">去意已决</button>
                <button class="reconnect-btn yes" id="reconnect-yes">重返战场</button>
            </div>
        `;
        mask.appendChild(panel);
        document.body.appendChild(mask);

        panel.querySelector('#reconnect-yes').onclick = async () => {
            if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
            panel.style.transform = 'scale(0.98)';
            panel.style.transition = '0.1s';
            setTimeout(() => mask.remove(), 120);
            setTimeout(async () => {
                document.getElementById('lobby-view').style.display = 'none';
                document.getElementById('battle-view').style.display = 'block';
                // 隐藏匹配房间和底部导航
                const mv = document.getElementById('match-room-view');
                if (mv) mv.style.display = 'none';
                const nav = document.querySelector('.bottom-nav');
                if (nav) nav.style.display = 'none';
                if (window.YYCardMatchmaking) window.YYCardMatchmaking.setCurrentRoom(roomId);
                if (window.YYCardBattle?.enterBattle) await window.YYCardBattle.enterBattle(roomId);
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }, 180);
        };

        panel.querySelector('#reconnect-no').onclick = async () => {
            mask.remove();
            await forceClean(uid, roomId, supabase);
            const nav = document.querySelector('.bottom-nav');
            if (nav) nav.style.display = '';
        };
    }

    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) return;
        const supabase = window.supabase;
        if (!supabase) return;

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
            await forceClean(uid, null, supabase);
            return;
        }
        if (!myRoomPlayer) return;

        const roomId = myRoomPlayer.room_id;
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
            await forceClean(uid, null, supabase);
            return;
        }

        if (room.status === 'battle') {
            showReconnectModal(roomId, uid, supabase);
        } else if (room.status === 'waiting') {
            // 恢复匹配房间
            const mv = document.getElementById('match-room-view');
            if (mv) mv.style.display = 'none';
            if (window.YYCardMatchmaking) window.YYCardMatchmaking.setCurrentRoom(roomId);
            if (window.YYCardCreateRoom?.showRoom) {
                window.YYCardCreateRoom.showRoom();
                const startBtn = document.getElementById('start-match-btn');
                const cancelBtn = document.getElementById('cancel-match-btn');
                const statusEl = document.getElementById('match-status');
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'block';
                if (statusEl) statusEl.textContent = '正在匹配...';
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
            // 重置UI
            const mv = document.getElementById('match-room-view');
            if (mv) mv.style.display = 'none';
            const gameArea = document.getElementById('game-area');
            if (gameArea) gameArea.style.display = 'block';
            const nav = document.querySelector('.bottom-nav');
            if (nav) nav.style.display = '';
        } catch (err) {
            console.error('[重连] 清理失败:', err.message);
        }
    }

    return { check };
})();
