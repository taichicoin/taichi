// ==================== 对战系统 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let selectedCard = null; // 当前选中的手牌/商店卡牌

    // 日志
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        }
    }

    // 进入对战视图
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        
        log('🎮 进入对战视图');
        
        // 订阅游戏状态变化
        subscribeToGame(roomId);
        
        // 绑定事件
        bindBattleEvents();
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

        // 立即获取当前状态
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

    // 更新游戏状态到数据库
    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
    }

    // 渲染UI
    function renderBattleUI() {
        if (!gameState) return;

        const myId = auth.currentUser.id;
        const myState = gameState.players[myId];
        if (!myState) return;

        // 更新基础信息
        document.getElementById('my-health').textContent = myState.health;
        document.getElementById('my-gold').textContent = myState.gold;
        document.getElementById('shop-level').textContent = myState.shopLevel;
        document.getElementById('round-num').textContent = gameState.round;
        document.getElementById('phase-info').textContent = gameState.phase === 'prepare' ? '🛒 准备阶段' : '⚔️ 战斗阶段';

        // 渲染我方棋盘
        renderBoard('my-board', myState.board, true);

        // 渲染敌方棋盘（取第一个非自己的玩家）
        const enemyId = Object.keys(gameState.players).find(id => id !== myId);
        if (enemyId) {
            const enemyState = gameState.players[enemyId];
            renderBoard('enemy-board', enemyState.board, false);
        }

        // 渲染手牌
        renderHand(myState.hand);

        // 渲染商店
        renderShop(myState.shopCards);

        // 更新手牌数量
        document.getElementById('hand-count').textContent = myState.hand.length;

        // 根据阶段控制按钮
        const endBtn = document.getElementById('end-prepare-btn');
        if (gameState.phase === 'prepare') {
            endBtn.style.display = 'block';
        } else {
            endBtn.style.display = 'none';
        }
    }

    // 渲染棋盘
    function renderBoard(containerId, cards, isSelf) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        for (let i = 0; i < 6; i++) {
            const card = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.dataset.index = i;
            
            if (card) {
                slot.innerHTML = `
                    <div class="card">
                        <div class="card-name">${card.name}</div>
                        <div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>
                        ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
                    </div>
                `;
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            
            // 我方棋盘可点击（放置卡牌）
            if (isSelf && gameState.phase === 'prepare') {
                slot.addEventListener('click', () => handleBoardSlotClick(i));
            }
            
            container.appendChild(slot);
        }
    }

    // 渲染手牌
    function renderHand(cards) {
        const container = document.getElementById('hand-container');
        container.innerHTML = '';
        
        cards.forEach((card, index) => {
            const cardEl = createCardElement(card);
            cardEl.addEventListener('click', () => handleHandCardClick(card, index));
            container.appendChild(cardEl);
        });
    }

    // 渲染商店
    function renderShop(cards) {
        const container = document.getElementById('shop-container');
        container.innerHTML = '';
        
        cards.forEach((card, index) => {
            const cardEl = createCardElement(card);
            cardEl.addEventListener('click', () => handleShopCardClick(card, index));
            container.appendChild(cardEl);
        });
    }

    // 创建卡牌DOM
    function createCardElement(card) {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <div class="card-name">${card.name}</div>
            <div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>
            <div class="card-price">💰${getCardPrice(card)}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        return div;
    }

    // 获取卡牌价格
    function getCardPrice(card) {
        const prices = { 'Common': 1, 'Rare': 2, 'Epic': 3, 'Legendary': 5 };
        return prices[card.rare] || 1;
    }

    // 处理手牌点击
    function handleHandCardClick(card, index) {
        if (gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段操作', true);
            return;
        }
        
        // 标记选中
        selectedCard = { type: 'hand', card, index };
        log(`选中手牌: ${card.name}`);
        
        // 高亮显示
        document.querySelectorAll('.hand .card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[index]?.classList.add('selected');
    }

    // 处理商店卡牌点击（购买）
    async function handleShopCardClick(card, index) {
        if (gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段购买', true);
            return;
        }

        const myState = gameState.players[auth.currentUser.id];
        const price = getCardPrice(card);
        
        if (myState.gold < price) {
            log('❌ 金币不足', true);
            return;
        }

        if (myState.hand.length >= 15) {
            log('❌ 手牌已满', true);
            return;
        }

        // 扣金币，卡牌加入手牌
        myState.gold -= price;
        myState.hand.push({ ...card, id: utils.uuid() });
        
        // 从商店移除
        myState.shopCards.splice(index, 1);
        
        await updateGameState();
        log(`✅ 购买成功: ${card.name}`);
    }

    // 处理棋盘格子点击（放置卡牌）
    async function handleBoardSlotClick(slotIndex) {
        if (!selectedCard || selectedCard.type !== 'hand') {
            log('⚠️ 请先选择一张手牌', true);
            return;
        }

        const myState = gameState.players[auth.currentUser.id];
        const handIndex = selectedCard.index;
        const card = myState.hand[handIndex];

        // 如果目标位置有卡牌，交换
        const existingCard = myState.board[slotIndex];
        
        // 放置新卡牌
        myState.board[slotIndex] = card;
        
        // 从手牌移除
        myState.hand.splice(handIndex, 1);
        
        // 如果原来有卡牌，放回手牌
        if (existingCard) {
            myState.hand.push(existingCard);
        }

        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        
        await updateGameState();
        log(`✅ 卡牌已放置`);
    }

    // 刷新商店
    async function refreshShop() {
        if (gameState.phase !== 'prepare') return;
        
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) {
            log('❌ 金币不足', true);
            return;
        }

        myState.gold--;
        myState.shopCards = utils.generateShopCards(myState.shopLevel);
        
        await updateGameState();
        log('🔄 商店已刷新');
    }

    // 购买经验
    async function buyExp() {
        if (gameState.phase !== 'prepare') return;
        
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) {
            log('❌ 金币不足', true);
            return;
        }

        myState.gold--;
        myState.exp++;
        
        // 检查升级
        const expNeeded = [0, 4, 10, 18, 28];
        while (myState.shopLevel < 5 && myState.exp >= expNeeded[myState.shopLevel]) {
            myState.shopLevel++;
            log(`🎉 商店升级到 Lv.${myState.shopLevel}`);
        }
        
        await updateGameState();
    }

    // 结束准备阶段（进入战斗）
    async function endPreparePhase() {
        if (gameState.phase !== 'prepare') return;
        
        gameState.phase = 'battle';
        await updateGameState();
        
        // 模拟自动战斗（简化版）
        await simulateBattle();
    }

    // 模拟战斗（简化版：随机扣血）
    async function simulateBattle() {
        const myId = auth.currentUser.id;
        const enemyId = Object.keys(gameState.players).find(id => id !== myId);
        if (!enemyId) return;

        const myState = gameState.players[myId];
        const enemyState = gameState.players[enemyId];

        // 随机决定胜负
        const iWin = Math.random() > 0.5;
        const loser = iWin ? enemyState : myState;
        const damage = 5 + Math.floor(Math.random() * 5);
        loser.health -= damage;

        log(`⚔️ 战斗结果: ${iWin ? '胜利' : '失败'}，造成 ${damage} 点伤害`);

        // 进入结算
        gameState.phase = 'settle';
        await updateGameState();

        // 检查淘汰
        if (loser.health <= 0) {
            log(`💀 ${loser === myState ? '你' : '对手'}被淘汰`);
            // 游戏结束处理...
            return;
        }

        // 发放奖励
        myState.gold += 5 + (iWin ? 3 : 1);
        myState.exp += 2 + (iWin ? 2 : 1);
        enemyState.gold += 5 + (iWin ? 1 : 3);
        enemyState.exp += 2 + (iWin ? 1 : 2);

        // 检查升级
        const expNeeded = [0, 4, 10, 18, 28];
        [myState, enemyState].forEach(s => {
            while (s.shopLevel < 5 && s.exp >= expNeeded[s.shopLevel]) {
                s.shopLevel++;
            }
        });

        // 刷新商店
        myState.shopCards = utils.generateShopCards(myState.shopLevel);

        // 进入下一回合准备阶段
        gameState.round++;
        gameState.phase = 'prepare';
        
        await updateGameState();
        log('🔄 进入下一回合');
    }

    // 绑定事件
    function bindBattleEvents() {
        document.getElementById('refresh-shop-btn').onclick = refreshShop;
        document.getElementById('buy-exp-btn').onclick = buyExp;
        document.getElementById('end-prepare-btn').onclick = endPreparePhase;
        document.getElementById('leave-battle-btn').onclick = () => {
            if (confirm('确定退出对战？')) {
                window.location.reload();
            }
        };
    }

    // 公开API
    return {
        enterBattle: enterBattle,
        getState: () => gameState
    };
})();

console.log('✅ battle.js 加载完成');
