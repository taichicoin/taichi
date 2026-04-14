// ==================== 商店与交互系统（完整版：购买、放置、刷新UI） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let selectedCard = null; // { type: 'hand', card, index }

    // ===== 辅助函数：获取当前用户ID和游戏状态 =====
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

    // ===== 兼容原有接口：加载卡牌模板 =====
    async function loadTemplates() {
        if (utils && utils.loadCardTemplates) {
            return await utils.loadCardTemplates();
        } else {
            console.warn('⚠️ utils.loadCardTemplates 不存在，跳过加载');
            return [];
        }
    }

    // ===== 生成商店卡牌（供匹配系统调用） =====
    async function generateShopCards(shopLevel) {
        const cards = await utils.generateShopCards(shopLevel);
        renderShop();
        return cards;
    }

    // ===== 渲染我方棋盘 =====
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
    }

    // ===== 渲染敌方棋盘 =====
    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const oppId = Object.keys(gameState.players).find(id => id !== userId);
        if (oppId) {
            renderBoard('enemy-board', gameState.players[oppId].board, false);
        }
    }

    // ===== 渲染手牌 =====
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
                el.addEventListener('click', () => handleHandCardClick(card, i));
                container.appendChild(el);
            }
        });
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    // ===== 渲染商店 =====
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
    }

    // ===== 刷新所有 UI（供 battle.js 调用） =====
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
            // 更新升级按钮状态
            updateBuyExpButtonState();
        }
    }

    // ===== 更新升级按钮状态（满级禁用） =====
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

    // ===== 内部：渲染棋盘格子 =====
    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (c) {
                slot.appendChild(createCardElement(c));
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            if (isSelf) {
                const gameState = getGameState();
                if (gameState && gameState.phase === 'prepare') {
                    slot.addEventListener('click', () => handleBoardSlotClick(i));
                }
            }
            cont.appendChild(slot);
        }
    }

    // ===== 创建卡牌 DOM =====
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
        const p = config.ECONOMY?.CARD_PRICE || { Common:{buy:1}, Rare:{buy:2}, Epic:{buy:3}, Legendary:{buy:5} };
        return p[c.rarity]?.buy || 1;
    }

    // ===== 交互：点击手牌选中 =====
    function handleHandCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            alert('只能在准备阶段操作');
            return;
        }
        selectedCard = { type: 'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
    }

    // ===== 交互：购买商店卡牌 =====
    async function handleShopCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            alert('只能在准备阶段操作');
            return;
        }
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = getCardPrice(card);
        if (my.gold < price) {
            alert('金币不足');
            return;
        }
        if (my.hand.filter(c => c).length >= (config.HAND_MAX_COUNT || 15)) {
            alert('手牌已满');
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
    }

    // ===== 交互：点击棋盘格子放置手牌 =====
    async function handleBoardSlotClick(slotIdx) {
        if (!selectedCard || selectedCard.type !== 'hand') {
            alert('请先选择一张手牌');
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
    }

    // ===== 刷新商店（扣金币） =====
    async function refreshShopAction() {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            alert('只能在准备阶段刷新');
            return;
        }
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) {
            alert('金币不足');
            return;
        }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
        refreshAllUI();
    }

    // ===== 购买经验（满级拦截） =====
    async function buyExpAction() {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (my.isBot) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) {
            alert('商店已满级');
            return;
        }
        if (my.gold < 1) {
            alert('金币不足');
            return;
        }
        my.gold--;
        my.exp += config.ECONOMY?.GOLD_TO_EXP_RATE || 1;
        const newLevel = getShopLevelByExp(my.exp);
        if (newLevel > my.shopLevel) {
            my.shopLevel = newLevel;
        }
        await updateGameState();
        refreshAllUI();
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // ===== 绑定按钮事件 =====
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // ===== 初始化（battle.js 进入对战时调用） =====
    function init() {
        bindUIEvents();
        refreshAllUI();
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
        generateShopCards,   // 供匹配系统调用
        loadTemplates        // 兼容原有接口
    };
})();

console.log('✅ shop.js 加载完成（完整交互版）');
