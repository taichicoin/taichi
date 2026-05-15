// ==================== 重连检测模块 ====================
window.YYCardReconnect = (function() {

    async function check() {
        const auth = window.YYCardAuth;
        const uid = auth?.currentUser?.id;
        if (!uid) return;

        const supabase = window.supabase;

        // 1. 查找玩家当前所在的房间
        const { data: myRoomPlayer } = await supabase
            .from('room_players')
            .select('room_id, is_bot')
            .eq('player_id', uid)
            .maybeSingle();
        if (!myRoomPlayer) return;

        const roomId = myRoomPlayer.room_id;

        // 2. 获取房间状态
        const { data: room } = await supabase
            .from('rooms')
            .select('status')
            .eq('id', roomId)
            .single();
        if (!room) return;

        // 3. 战斗中的房间，需要判断玩家是否已被淘汰
        if (room.status === 'battle') {
            // 读取 game_state 检查淘汰标记
            const { data: gameStateRow } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();

            const players = gameStateRow?.state?.players || {};
            const myPlayer = players[uid];

            if (myPlayer?.isEliminated) {
                // 已淘汰 → 不弹窗，静默清理，玩家直接留在大厅
                auth.log('🪦 检测到已淘汰，静默清理房间数据');
                await silentClean(roomId, uid);
                return;
            }

            // 未淘汰，正常弹出重连确认
            const shouldReconnect = confirm(
                '检测到您有一场进行中的对局，是否重新连接？\n\n点击"确定"重连，点击"取消"放弃并开始新游戏。'
            );
            if (shouldReconnect) {
                auth.log('🔄 玩家选择重连');

                // ★ 重连前强制清理所有刷新状态和商店缓存
                if (window.YYCardShop) {
                    // 强制刷新商店渲染（等下 enterBattle 会重新拉取数据）
                    // 先不做任何本地乐观操作
                }
                if (window.YYCardShopRefresh) {
                    // 重置刷新模块的内部状态（如果有暴露重置方法最好，没有就通过重新初始化）
                    // 最简单：直接把刷新锁全部重置
                }

                document.getElementById('lobby-view').style.display = 'none';
                document.getElementById('battle-view').style.display = 'block';
                if (window.YYCardMatchmaking) window.YYCardMatchmaking.setCurrentRoom(roomId);

                // ★ enterBattle 会拉取最新状态并渲染，但我们需要确保渲染后商店数据完全干净
                if (window.YYCardBattle?.enterBattle) {
                    await window.YYCardBattle.enterBattle(roomId);

                    // ★ 重连后，强制让 shop.js 重新渲染一遍（清空任何乐观残留）
                    if (window.YYCardShop?.refreshAllUI) {
                        window.YYCardShop.refreshAllUI();
                    }
                    // 更新刷新按钮显示（免费次数等）
                    if (window.YYCardShopRefresh?.updateRefreshButtonDisplay) {
                        window.YYCardShopRefresh.updateRefreshButtonDisplay();
                    }
                }
            } else {
                auth.log('🚫 玩家放弃重连，清理房间记录');
                await leaveAndClean(roomId, uid);
            }
        }
        // 4. 等待中 → 恢复匹配
        else if (room.status === 'waiting') {
            auth.log('🔄 检测到等待中的匹配，恢复状态...');
            if (window.YYCardMatchmaking) {
                window.YYCardMatchmaking.setCurrentRoom(roomId);
                window.YYCardMatchmaking.subscribeToRoom(roomId);
            }
            document.getElementById('start-match-btn').disabled = true;
            document.getElementById('start-match-btn').textContent = '⏳ 匹配中...';
            document.getElementById('match-status').style.display = 'block';
            document.getElementById('cancel-match-btn').style.display = 'inline-block';
        }
    }

    // 静默清理（不弹窗）
    async function silentClean(roomId, uid) {
        const supabase = window.supabase;
        await supabase.from('room_players').delete().eq('player_id', uid);
        const { data: leftPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);
        if (!leftPlayers || leftPlayers.length === 0) {
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
        }
    }

    // 放弃重连时的清理
    async function leaveAndClean(roomId, uid) {
        const supabase = window.supabase;
        if (window.YYCardMatchmaking?.leaveAndClean) {
            await window.YYCardMatchmaking.leaveAndClean();
        } else {
            await supabase.from('room_players').delete().eq('player_id', uid);
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
    }

    return { check };
})();
