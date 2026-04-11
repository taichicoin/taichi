function renderBattleUI() {
    if (!gameState) return;
    
    const myState = gameState.players[currentUser.id];
    if (!myState) return;
    
    document.getElementById('my-health').textContent = myState.health;
    document.getElementById('my-gold').textContent = myState.gold;
    document.getElementById('shop-level').textContent = myState.shopLevel;
    document.getElementById('phase-info').textContent = gameState.phase === 'prepare' ? '准备阶段' : '战斗阶段';
    
    // 渲染我方棋盘
    const myBoardDiv = document.getElementById('my-board');
    myBoardDiv.innerHTML = myState.board.map(c => `
        <div class="card">
            <div class="name">${c.name}</div>
            <div class="stats">⚔️${c.atk} 🛡️${c.hp}</div>
        </div>
    `).join('');
    
    // 渲染敌方棋盘（第一个对手）
    const opponentId = Object.keys(gameState.players).find(id => id !== currentUser.id);
    if (opponentId) {
        const enemyState = gameState.players[opponentId];
        document.getElementById('enemy-board').innerHTML = enemyState.board.map(c => `
            <div class="card">
                <div class="name">${c.name}</div>
                <div class="stats">⚔️${c.atk} 🛡️${c.hp}</div>
            </div>
        `).join('');
    }
    
    // 渲染手牌
    document.getElementById('hand-container').innerHTML = myState.hand.map(c => `
        <div class="card">
            <div class="name">${c.name}</div>
            <div class="stats">⚔️${c.atk} 🛡️${c.hp}</div>
        </div>
    `).join('');
    
    // 渲染商店
    document.getElementById('shop-cards').innerHTML = myState.shopCards.map(c => `
        <div class="card">
            <div class="name">${c.name}</div>
            <div class="stats">⚔️${c.atk} 🛡️${c.hp}</div>
        </div>
    `).join('');
}

// 结束准备阶段
async function endPreparePhase() {
    if (!gameState || gameState.phase !== 'prepare') return;
    
    // 简化的战斗逻辑：随机扣血
    const players = Object.keys(gameState.players);
    const loser = players[Math.floor(Math.random() * players.length)];
    gameState.players[loser].health -= 5;
    gameState.phase = 'prepare';
    gameState.round++;
    
    // 发放资源
    Object.values(gameState.players).forEach(p => {
        p.gold += 5;
        p.exp += 2;
    });
    
    await updateGameState(gameState);
}

// 刷新商店
async function refreshShop() {
    if (!gameState) return;
    const myState = gameState.players[currentUser.id];
    if (myState.gold < 1) {
        alert('金币不足');
        return;
    }
    myState.gold--;
    myState.shopCards = getDefaultDeck().slice(0, 3);
    await updateGameState(gameState);
        }
