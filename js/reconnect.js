// ==================== 重连系统 ====================
window.YYCardReconnect = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;

    // 日志输出
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    // 清理空房间
    async function cleanEmptyRoom(roomId) {
        const { data: realPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);

        if (!realPlayers || realPlayers.length === 0) {
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
            log(`🧹 房间 ${roomId} 已无真人，已清理`);
        }
    }

    // 主检测函数
    async function check() {
        const uid = auth.currentUser?.id;
        if (!uid) return;

        // 1. 查询该玩家是否在某个房间中
        const { data: myRoomPlayer } = await supabase
            .from('room_players')
            .select('room_id, is_bot')
            .eq('player_id', uid)
            .maybeSingle();

        if (!myRoomPlayer) return;

        const roomId = myRoomPlayer.room_id;

        // 2. 查询房间状态
        const { data: room } = await supabase
            .from('rooms')
            .select('status')
            .eq('id', roomId)
            .single();

        if (!room) return;

        // 3. 如果房间处于战斗中，弹窗询问
        if (room.status === 'battle') {
            const shouldReconnect = confirm('检测到您有一场进行中的对局，是否重新连接？\n\n点击“确定”重连，点击“取消”放弃并开始新游戏。');

            if (shouldReconnect) {
                log('🔄 玩家选择重连');
                document.getElementById('lobby-view').style.display = 'none';
                document.getElementById('battle-view').style.display = 'block';

                if (window.YYCardMatchmaking) {
                    window.YYCardMatchmaking.setCurrentRoom(roomId);
                }

                if (window.YYCardBattle?.enterBattle) {
                    window.YYCardBattle.enterBattle(roomId);
                }
            } else {
                log('🚫 玩家放弃重连，清理房间记录');
                await supabase.from('room_players').delete().eq('player_id', uid);
                await cleanEmptyRoom(roomId);
            }
        } else if (room.status === 'waiting') {
            // 如果在等待匹配的房间中，直接恢复匹配状态
            log('🔄 检测到等待中的匹配，恢复状态...');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
                window.YYCardMatchmaking.subscribeToRoom(roomId);
            }
            const startBtn = document.getElementById('start-match-btn');
            if (startBtn) {
                startBtn.disabled = true;
                startBtn.textContent = '⏳ 匹配中...';
            }
            document.getElementById('match-status').style.display = 'block';
            document.getElementById('cancel-match-btn').style.display = 'inline-block';
        }
    }

    // 公开 API
    return {
        check
    };
})();

console.log('✅ reconnect.js 加载完成');
