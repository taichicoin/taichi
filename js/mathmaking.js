let currentRoom = null;
let roomSubscription = null;

async function startMatchmaking() {
    if (!currentProfile.username) {
        alert('请先设置游戏ID');
        return;
    }
    document.getElementById('match-status').textContent = '正在匹配...';
    const myMmr = currentProfile.mmr || 1000;
    
    // 查找或创建房间
    let { data: rooms } = await supabase.from('rooms')
        .select('*').eq('status', 'waiting').limit(1);
    let room = rooms?.[0];
    if (!room) {
        const { data: newRoom } = await supabase.from('rooms')
            .insert({ status: 'waiting' }).select().single();
        room = newRoom;
    }
    await supabase.from('room_players').insert({
        room_id: room.id, player_id: currentUser.id, mmr_at_join: myMmr
    });
    currentRoom = room;
    subscribeToRoom(room.id);
}

async function subscribeToRoom(roomId) {
    roomSubscription = supabase.channel(`room:${roomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
            async () => { await checkRoomFull(roomId); })
        .subscribe();
    await checkRoomFull(roomId);
}

async function checkRoomFull(roomId) {
    const { data: players } = await supabase.from('room_players').select('*').eq('room_id', roomId);
    const count = players?.length || 0;
    document.getElementById('match-status').textContent = `已找到 ${count}/8 名玩家`;
    if (count >= 2) { // 测试用2人，正式改8
        await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
        // 进入对战...
    }
}
