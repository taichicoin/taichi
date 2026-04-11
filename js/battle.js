function renderBattleUI() {
    if (!gameState) return;
    const myState = gameState.players[currentUser.id];
    document.getElementById('my-health').textContent = myState.health;
    document.getElementById('my-gold').textContent = myState.gold;
    document.getElementById('shop-level').textContent = myState.shopLevel;
    document.getElementById('phase-info').textContent = gameState.phase === 'prepare' ? '准备阶段' : '战斗阶段';

    // 我方棋盘
    const myBoardDiv = document.getElementById('my-board');
    myBoardDiv.innerHTML = myState.board.map(c => `
        <div class="card"><div class="name">${c.name}</div><div class="stats">⚔️${c.atk} 🛡️${c.hp}</div></div>
    `).join('');

    // 敌方棋盘
    const opponentId = Object.keys(gameState.players).find(id => id !== currentUser.id);
    if (opponentId) {
        const enemyState = gameState.players[opponentId];
        document.getElementById('enemy-board').innerHTML = enemyState.board.map(c => `
            <div class="card"><div class="name">${c.name}</div><div class="stats">⚔️${c.atk} 🛡️${c.hp}</div></div>
        `).join('');
    }

    // 手牌
    document.getElementById('hand-container').innerHTML = myState.hand.map(c => `
        <div class="card"><div class="name">${c.name}</div><div class="stats">⚔️${c.atk} 🛡️${c.hp}</div></div>
    `).join('');

    // 商店
    document.getElementById('shop-cards').innerHTML = myState.shopCards.map(c => `
        <div class="card"><div class="name">${c.name}</div><div class="stats">⚔️${c.atk} 🛡️${c.hp}</div></div>
    `).join('');
}

async function startBattle() {
    if (gameState.phase !== 'prepare') return;
    const players = Object.keys(gameState.players);
    const p1 = players[0], p2 = players[1];
    const loser = Math.random() > 0.5 ? p1 : p2;
    gameState.players[loser].health -= 5;
    gameState.phase = 'prepare';
    gameState.round++;
    Object.values(gameState.players).forEach(p => { p.gold += 5; p.exp += 2; });
    await updateGameState(gameState);
    if (gameState.players[loser].health <= 0) alert(`玩家被淘汰！`);
}

async function refreshShop() {
    const myState = gameState.players[currentUser.id];
    if (myState.gold < 1) { alert('金币不足'); return; }
    myState.gold--;
    myState.shopCards = getDefaultDeck().slice(0, 3);
    await updateGameState(gameState);
}

function leaveRoom() {
    window.location.reload();
}
