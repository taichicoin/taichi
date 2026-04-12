// ==================== 对战系统（悠悠牌UI + 完整回合制 + 人机托管） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let selectedCard = null;
    let autoBotTimer = null;

    // 日志
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    // 进入对战视图
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        
        log('🎮 进入对战视图');
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();
    }

    // 订阅游戏状态
    function subscribeToGame(roomId) {
        if (gameSubscription) {
            gameSubscription.unsubscribe();
        }

        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, (payload) => {
                gameState = payload.new.state;
                renderBattleUI();
            })
            .subscribe();

        supabase
            .from('game_states')
            .select('state')
            .eq('room_id', roomId)
            .single()
            .then(({ data }) => {
                if (data) {
                    gameState = data.state;
                    renderBattleUI();
                }
            });
    }

    // 更新游戏状态
    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
    }

    // ===== 渲染8名玩家状态栏 =====
    function renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container || !gameState) return;
        
        const players = gameState.players;
        const myId = auth.currentUser.id;
        let html = '';
        
        for (const [pid, p] of Object.entries(players)) {
            const isMe = (pid === myId);
            // 从 profiles 获取昵称和头像（这里简化处理，实际应缓存）
            const displayName = isMe ? '我' : (p.display_name || pid.slice(0,6));
            const avatarUrl = p.avatar_url || '/yycard/assets/default-avatar.png';
            
            html += `
                <div class="player-status-item">
                    <img src="${avatarUrl}" onerror="this.src='/yycard/assets/default-avatar.png'">
                    <div style="flex:1;">
                        <div style="font-size:0.6rem;">${displayName}</div>
                        <div class="hp-bar">
                            <div class="hp-fill" style="width:${Math.max(0, (p.health/100)*100)}%;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // 渲染UI
    function renderBattleUI() {
        if (!gameState) return;

        const myId = auth.currentUser.id;
        const myState = gameState.players[myId];
        if (!myState) return;

        document.getElementById('my-health').textContent = myState.health;
        document.getElementById('my-gold').textContent = myState.gold;
        document.getElementById('shop-level').textContent = myState.shopLevel;
        document.getElementById('round-num').textContent = gameState.round;
        document.getElementById('phase-info').textContent = 
            gameState.phase === 'prepare' ? '🛒 准备阶段' : 
            gameState.phase === 'battle' ? '⚔️ 战斗阶段' : '📊 结算阶段';

        renderBoard('my-board', myState.board, true);
        renderHand(myState.hand);
        renderShop(myState.shopCards);
        document.getElementById('hand-count').textContent = myState.hand.length;

        // 敌方棋盘
        const opponentId = Object.keys(gameState.players).find(id => id !== myId);
        if (opponentId) {
            renderBoard('enemy-board', gameState.players[opponentId].board, false);
        }

        // 控制按钮状态
        const isBot = myState.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        const refreshBtn = document.getElementById('refresh-shop-btn');
        const buyExpBtn = document.getElementById('buy-exp-btn');
        
        if (isBot) {
            endBtn.style.display = 'none';
            if (refreshBtn) refreshBtn.style.display = 'none';
            if (buyExpBtn) buyExpBtn.style.display = 'none';
        } else {
            endBtn.style.display = isMyTurn ? 'block' : 'none';
            if (refreshBtn) refreshBtn.style.display = isMyTurn ? 'block' : 'none';
            if (buyExpBtn) buyExpBtn.style.display = isMyTurn ? 'block' : 'none';
        }

        // 渲染8人状态栏
        renderPlayerStatus();
    }

    function renderBoard(containerId, cards, isSelf) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const card = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.dataset.index = i;
            if (card) {
                slot.innerHTML = `<div class="card"><div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}</div>`;
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            if (isSelf && gameState.phase === 'prepare') {
                slot.addEventListener('click', () => handleBoardSlotClick(i));
            }
            container.appendChild(slot);
        }
    }

    function renderHand(cards) {
        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        cards.forEach((card, index) => {
            const el = createCardElement(card);
            el.addEventListener('click', () => handleHandCardClick(card, index));
            container.appendChild(el);
        });
    }

    function renderShop(cards) {
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        cards.forEach((card, index) => {
            const el = createCardElement(card);
            el.addEventListener('click', () => handleShopCardClick(card, index));
            container.appendChild(el);
        });
    }

    function createCardElement(card) {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div><div class="card-price">💰${getCardPrice(card)}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}`;
        return div;
    }

    function getCardPrice(card) {
        const prices = { 'Common': 1, 'Rare': 2, 'Epic': 3, 'Legendary': 5 };
        return prices[card.rare] || 1;
    }

    function handleHandCardClick(card, index) {
        if (gameState.phase !== 'prepare') { log('⚠️ 只能在准备阶段操作', true); return; }
        selectedCard = { type: 'hand', card, index };
        document.querySelectorAll('.hand .card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[index]?.classList.add('selected');
    }

    async function handleShopCardClick(card, index) {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        const price = getCardPrice(card);
        if (myState.gold < price) { log('❌ 金币不足', true); return; }
        if (myState.hand.length >= 15) { log('❌ 手牌已满', true); return; }
        myState.gold -= price;
        myState.hand.push({ ...card, id: utils.uuid() });
        myState.shopCards.splice(index, 1);
        await updateGameState();
    }

    async function handleBoardSlotClick(slotIndex) {
        if (!selectedCard || selectedCard.type !== 'hand') { log('⚠️ 请先选择一张手牌', true); return; }
        const myState = gameState.players[auth.currentUser.id];
        const handIndex = selectedCard.index;
        const card = myState.hand[handIndex];
        const existingCard = myState.board[slotIndex];
        myState.board[slotIndex] = card;
        myState.hand.splice(handIndex, 1);
        if (existingCard) myState.hand.push(existingCard);
        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        await updateGameState();
    }

    async function refreshShop() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) { log('❌ 金币不足', true); return; }
        myState.gold--;
        myState.shopCards = utils.generateShopCards(myState.shopLevel);
        await updateGameState();
    }

    async function buyExp() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) { log('❌ 金币不足', true); return; }
        myState.gold--;
        myState.exp++;
        const expNeeded = [0, 4, 10, 18, 28];
        while (myState.shopLevel < 5 && myState.exp >= expNeeded[myState.shopLevel]) {
            myState.shopLevel++;
            log(`🎉 商店升级到 Lv.${myState.shopLevel}`);
        }
        await updateGameState();
    }

    async function endPreparePhase() {
        if (gameState.phase !== 'prepare') return;
        gameState.phase = 'battle';
        await updateGameState();
        await simulateBattle();
    }

    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length < 2) return;

        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 >= players.length) break;
            const p1 = players[i], p2 = players[i + 1];
            const winner = Math.random() > 0.5 ? p1 : p2;
            const loser = winner === p1 ? p2 : p1;
            const damage = 5 + Math.floor(Math.random() * 10);
            gameState.players[loser].health = Math.max(0, gameState.players[loser].health - damage);
            log(`⚔️ ${winner} 击败 ${loser}，造成 ${damage} 点伤害`);
        }

        players.forEach(pid => {
            if (gameState.players[pid].health <= 0) {
                log(`💀 玩家 ${pid} 被淘汰`);
            }
        });

        players.forEach(pid => {
            const p = gameState.players[pid];
            p.gold += 5;
            p.exp += 2;
            const expNeeded = [0, 4, 10, 18, 28];
            while (p.shopLevel < 5 && p.exp >= expNeeded[p.shopLevel]) {
                p.shopLevel++;
            }
            p.shopCards = utils.generateShopCards(p.shopLevel);
        });

        gameState.round++;
        gameState.phase = 'prepare';
        await updateGameState();
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const myId = auth.currentUser?.id;
            if (!myId) return;
            const myState = gameState.players[myId];
            if (!myState || !myState.isBot) return;

            if (myState.gold >= 1 && myState.shopLevel < 5) {
                myState.gold--;
                myState.exp++;
                const expNeeded = [0, 4, 10, 18, 28];
                while (myState.shopLevel < 5 && myState.exp >= expNeeded[myState.shopLevel]) {
                    myState.shopLevel++;
                }
                await updateGameState();
            } else {
                gameState.phase = 'battle';
                await updateGameState();
                await simulateBattle();
            }
        }, 3000);
    }

    function bindBattleEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShop);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExp);
        document.getElementById('end-prepare-btn')?.addEventListener('click', endPreparePhase);
        document.getElementById('leave-battle-btn')?.addEventListener('click', () => {
            if (confirm('确定退出对战？')) {
                window.location.reload();
            }
        });
    }

    return {
        enterBattle: enterBattle,
        getState: () => gameState
    };
})();

console.log('✅ battle.js 加载完成');
