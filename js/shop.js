// ==================== 商店与交互系统（完整版：拖拽出售 + 调试面板） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let selectedCard = null; // { type: 'hand', card, index } 用于点击放置
    let draggedCard = null;  // { type: 'hand'|'board', card, index } 用于拖拽出售

    // ===== 透明调试面板（独立，不依赖 battle.js） =====
    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `
            position:fixed;
            top:0;
            left:0;
            right:0;
            max-height:120px;
            overflow-y:auto;
            background:rgba(0,0,0,0.5);
            color:#0f0;
            font-size:11px;
            padding:4px 8px;
            z-index:100000;
            border-bottom:1px solid rgba(245,215,110,0.5);
            font-family:monospace;
            pointer-events:none;
            text-shadow:0 0 4px black;
            line-height:1.4;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = document.getElementById('shop-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 30) p.removeChild(p.firstChild);
    }

    function log(msg, isError = false) {
        console.log(msg);
        logToScreen(msg, isError);
    }

    // ===== 辅助函数 =====
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    async function updateGameState() {
        if (window.YYCardBattle?.updateGameState) {
            await window.YYCardBattle.updateGameState();
        }
    }

    // ===== 兼容原有接口 =====
    async function loadTemplates() {
        if (utils && utils.loadCardTemplates) {
            return await utils.loadCardTemplates();
        } else {
            log('⚠️ utils.loadCardTemplates 不存在，跳过加载', true);
            return [];
        }
    }

    async function generateShopCards(shopLevel) {
        const cards = await utils.generateShopCards(shopLevel);
        renderShop();
        return cards;
    }

    // ===== 渲染函数 =====
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
    }

    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const oppId = Object.keys(gameState.players).find(id => id !== userId);
        if (oppId) {
            renderBoard('enemy-board', gameState.players[oppId].board, false);
        }
    }

    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                // 点击选中（用于放置）
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleHandCardClick(card, i);
                });
                // 拖拽出售
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => handleDragStart(e, 'hand', card, i));
                el.addEventListener('dragend', (e) => e.preventDefault());
                container.appendChild(el);
            }
        });
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
            return;
        }
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.addEventListener('click', () => handleShopCardClick(card, i));
                container.appendChild(el);
            }
        });

        // 设置商店区域为可放置目标
        container.addEventListener('dragover', (e) => e.preventDefault());
        container.addEventListener('drop', handleDropOnShop);
    }

    function refreshAllUI() {
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();
        const gameState = getGameState();
        if (gameState) {
            const userId = getCurrentUserId();
            const my = gameState.players[userId];
            if (my) {
                document.getElementById('my-health').textContent = my.health;
                document.getElementById('my-gold').textContent = my.gold;
                document.getElementById('shop-level').textContent = my.shopLevel;
            }
            document.getElementById('round-num').textContent = gameState.round;
            updateBuyExpButtonState();
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const isMyTurn = gameState.phase === 'prepare';
        const shouldDisable = my.isBot || !isMyTurn || isMaxLevel;
        
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.textContent = isMaxLevel ? '📈 已满级' : '📈 升级';
                btn.disabled = shouldDisable;
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    // 点击放置
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // 如果已选中手牌，则执行放置；否则可以改为选中棋盘卡牌（这里暂不实现棋盘选中）
                        if (selectedCard && selectedCard.type === 'hand') {
                            handleBoardSlotClick(i);
                        }
                    });
                    // 拖拽出售
                    el.setAttribute('draggable', true);
                    el.addEventListener('dragstart', (e) => handleDragStart(e, 'board', c, i));
                    el.addEventListener('dragend', (e) => e.preventDefault());
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                if (isSelf) {
                    slot.addEventListener('click', () => handleBoardSlotClick(i));
                }
            }
            cont.appendChild(slot);
        }
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = getCardPrice(card);
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">🛡️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        return d;
    }

    function getCardPrice(c) {
        const p = config.ECONOMY?.CARD_PRICE || { Common:{buy:1, sell:1}, Rare:{buy:2, sell:2}, Epic:{buy:3, sell:3}, Legendary:{buy:5, sell:4} };
        return p[c.rarity]?.buy || 1;
    }

    function getCardSellPrice(c) {
        const p = config.ECONOMY?.CARD_PRICE || { Common:{buy:1, sell:1}, Rare:{buy:2, sell:2}, Epic:{buy:3, sell:3}, Legendary:{buy:5, sell:4} };
        return p[c.rarity]?.sell || 1;
    }

    // ===== 交互：点击手牌选中 =====
    function handleHandCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段操作', true);
            return;
        }
        selectedCard = { type: 'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
        log(`选中手牌: ${card.name}`);
    }

    // ===== 交互：购买商店卡牌 =====
    async function handleShopCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = getCardPrice(card);
        if (my.gold < price) {
            log('❌ 金币不足', true);
            return;
        }
        if (my.hand.filter(c => c).length >= (config.HAND_MAX_COUNT || 15)) {
            log('❌ 手牌已满', true);
            return;
        }
        my.gold -= price;
        const emptyIndex = my.hand.findIndex(c => c === null);
        const newCard = { ...card, instanceId: utils.uuid() };
        if (emptyIndex !== -1) {
            my.hand[emptyIndex] = newCard;
        } else {
            my.hand.push(newCard);
        }
        my.shopCards.splice(idx, 1);
        await updateGameState();
        refreshAllUI();
        log(`✅ 购买成功: ${card.name}`);
    }

    // ===== 交互：点击棋盘格子放置手牌 =====
    async function handleBoardSlotClick(slotIdx) {
        if (!selectedCard || selectedCard.type !== 'hand') {
            log('⚠️ 请先选择一张手牌', true);
            return;
        }
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const handIdx = selectedCard.index;
        const card = my.hand[handIdx];
        if (!card) return;

        const oldCard = my.board[slotIdx];
        my.board[slotIdx] = card;
        my.hand[handIdx] = oldCard || null;

        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
        await updateGameState();
        refreshAllUI();
        log(`📌 放置 ${card.name} 到位置 ${slotIdx}`);
    }

    // ===== 拖拽出售 =====
    function handleDragStart(e, type, card, index) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            e.preventDefault();
            log('⚠️ 只能在准备阶段出售', true);
            return;
        }
        draggedCard = { type, card, index };
        e.dataTransfer.setData('text/plain', card.name);
        e.dataTransfer.effectAllowed = 'move';
        log(`👆 开始拖拽: ${card.name}`);
    }

    async function handleDropOnShop(e) {
        e.preventDefault();
        if (!draggedCard) {
            log('⚠️ 没有拖拽的卡牌', true);
            return;
        }

        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段出售', true);
            draggedCard = null;
            return;
        }

        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const { type, card, index } = draggedCard;
        
        // 检查卡牌是否还存在
        let stillExists = false;
        if (type === 'hand') {
            stillExists = my.hand[index] && my.hand[index].instanceId === card.instanceId;
        } else if (type === 'board') {
            stillExists = my.board[index] && my.board[index].instanceId === card.instanceId;
        }
        if (!stillExists) {
            log('⚠️ 卡牌已不在原位置', true);
            draggedCard = null;
            return;
        }

        const sellPrice = getCardSellPrice(card);
        
        // 执行出售
        if (type === 'hand') {
            my.hand[index] = null;
        } else if (type === 'board') {
            my.board[index] = null;
        }
        my.gold += sellPrice;

        await updateGameState();
        refreshAllUI();
        log(`💰 出售成功: ${card.name}，获得 ${sellPrice} 金币`);
        draggedCard = null;
    }

    // ===== 刷新商店 =====
    async function refreshShopAction() {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            log('⚠️ 只能在准备阶段刷新', true);
            return;
        }
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) {
            log('❌ 金币不足', true);
            return;
        }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
        refreshAllUI();
        log(`🔄 商店已刷新`);
    }

    // ===== 购买经验 =====
    async function buyExpAction() {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (my.isBot) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) {
            log('⚠️ 商店已满级', true);
            return;
        }
        if (my.gold < 1) {
            log('❌ 金币不足', true);
            return;
        }
        my.gold--;
        my.exp += config.ECONOMY?.GOLD_TO_EXP_RATE || 1;
        const newLevel = getShopLevelByExp(my.exp);
        if (newLevel > my.shopLevel) {
            my.shopLevel = newLevel;
            log(`🎉 商店升级到 Lv.${my.shopLevel}`);
        }
        await updateGameState();
        refreshAllUI();
        log(`📈 购买经验，当前经验 ${my.exp}`);
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // ===== 绑定事件 =====
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // ===== 初始化 =====
    function init() {
        initDebugPanel();
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动');
    }

    return {
        init,
        refreshAllUI,
        renderMyBoard,
        renderEnemyBoard,
        renderHand,
        renderShop,
        buyExpAction,
        refreshShopAction,
        generateShopCards,
        loadTemplates
    };
})();

console.log('✅ shop.js 加载完成（拖拽出售 + 调试面板）');
