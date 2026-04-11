let gameState = null;
let gameSubscription = null;

function subscribeToGame(roomId) {
    gameSubscription = supabase
        .channel(`game:${roomId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'game_states',
            filter: `room_id=eq.${roomId}`
        }, (payload) => {
            gameState = payload.new.state;
            if (typeof renderBattleUI === 'function') {
                renderBattleUI();
            }
        })
        .subscribe();
}

async function updateGameState(newState) {
    gameState = newState;
    await supabase
        .from('game_states')
        .update({ state: gameState })
        .eq('room_id', currentRoom.id);
}
