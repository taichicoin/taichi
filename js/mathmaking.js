let currentRoom = null;
let roomSubscription = null;

// 开始匹配
async function startMatchmaking() {
    if (!currentProfile?.username) {
        alert('请先设置游戏ID');
        return;
    }
    
    const statusEl = document.getElementById('match-status');
    statusEl.textContent = '正在匹配...';
    
    const myMmr = currentProfile.mmr || 1000;
    
    // 查找等待中的房间
    let { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'waiting')
        .limit(1);
    
    let room = rooms?.[0];
    
    if (!room) {
        const { data: newRoom } = await supabase
            .from('rooms')
            .insert({ status: 'waiting' })
            .select()
            .single();
        room = newRoom;
    }
    
    // 加入房间
    await supabase.from('room_players').insert({
        room_id: room.id,
        player_id: currentUser.id,
        mmr_at_join: myMmr
    });
    
    currentRoom = room;
    subscribeToRoom(room.id);
}

// 订阅房间变化
function subscribeToRoom(roomId) {
    roomSubscription = supabase
        .channel(`room:${roomId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter: `room_id=eq.${roomId}`
        }, async () => {
            await checkRoomFull(roomId);
        })
        .subscribe();
    
    checkRoomFull(roomId);
}

// 检查房间是否满员
async function checkRoomFull(roomId) {
    const { data: players } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomId);
    
    const count = players?.length || 0;
    document.getElementById('match-status').textContent = `已找到 ${count}/8 名玩家`;
    
    if (count >= 2) { // 测试用2人，正式改8
        await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
        await initializeGame(roomId, players);
    }
}

// 初始化游戏状态
async function initializeGame(roomId, players) {
    const state = {
        round: 1,
        phase: 'prepare',
        players: {}
    };
    
    players.forEach(p => {
        const deck = getDefaultDeck();
        state.players[p.player_id] = {
            health: 30,
            gold: 5,
            exp: 0,
            shopLevel: 1,
            board: deck.slice(0, 3),
            hand: deck.slice(3, 5),
            shopCards: deck.slice(0, 3)
        };
    });
    
    await supabase
        .from('game_states')
        .upsert({ room_id: roomId, state }, { onConflict: 'room_id' });
    
    // 切换到对战视图
    document.getElementById('lobby-view').classList.remove('active');
    document.getElementById('battle-view').classList.add('active');
    
    // 订阅游戏状态
    if (typeof subscribeToGame === 'function') {
        subscribeToGame(roomId);
    }
}
