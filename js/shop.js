// ==================== 商店与交互系统（完全对接 battle.js 核心） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let selectedCard = null; // { type: 'hand', card, index }
    let draggedCard = null;  // { type: 'hand'|'board', card, index }
    let currentPhase = 'prepare'; // 用于 UI 显示控制

    // ===== 透明调试面板 =====
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
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleHandCardClick(card, i);
                });
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
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            document.getElementById('round-num').textContent = gameState.round;
            const roundTop = document.getElementById('round-num-top');
            if (roundTop) roundTop.textContent = gameState.round;
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
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (selectedCard && selectedCard.type === 'hand') {
                            handleBoardSlotClick(i);
                        }
                    });
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
        const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
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
        const success = await window.YYCardBattle.buyCardAction(card, idx);
        if (success) {
            refreshAllUI();
            log(`✅ 购买成功: ${card.name}`);
        } else {
            log('❌ 购买失败（金币不足或手牌已满）', true);
        }
    }

    // ===== 交互：点击棋盘格子放置手牌 =====
    async function handleBoardSlotClick(slotIdx) {
        if (!selectedCard || selectedCard.type !== 'hand') {
            log('⚠️ 请先选择一张手牌', true);
            return;
        }
        const handIdx = selectedCard.index;
        const success = await window.YYCardBattle.placeCardAction(handIdx, slotIdx);
        if (success) {
            selectedCard = null;
            document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
            refreshAllUI();
            log(`📌 放置成功`);
        } else {
            log('❌ 放置失败', true);
        }
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
        const { type, card, index } = draggedCard;
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (success) {
            refreshAllUI();
            log(`💰 出售成功: ${card.name}，获得 ${config.ECONOMY.CARD_PRICE[card.rarity].sell} 金币`);
        } else {
            log('❌ 出售失败', true);
        }
        draggedCard = null;
    }

    // ===== 刷新商店 =====
    async function refreshShopAction() {
        const success = await window.YYCardBattle.refreshShopAction();
        if (success) {
            refreshAllUI();
            log(`🔄 商店已刷新`);
        } else {
            log('❌ 刷新失败', true);
        }
    }

    // ===== 购买经验 =====
    async function buyExpAction() {
        await window.YYCardBattle.buyExpAction();
        refreshAllUI();
    }

    // ===== 计时器显示更新（由 battle.js 调用） =====
    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) {
            battleTimerEl.textContent = phase === 'battle' ? seconds : '00:00';
        }
    }

    function setPhase(phase) {
        currentPhase = phase;
    }

    // ===== 绑定事件 =====
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
        
        const endPrepareBtn = document.getElementById('end-prepare-btn');
        if (endPrepareBtn) {
            endPrepareBtn.addEventListener('click', async () => {
                if (window.YYCardBattle?.endPreparePhase) {
                    await window.YYCardBattle.endPreparePhase();
                } else {
                    log('❌ 准备功能不可用', true);
                }
            });
        }
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
        updateTimerDisplay,
        setPhase,
        log,
        generateShopCards,
        loadTemplates
    };
})();

console.log('✅ shop.js 加载完成（完全对接 battle 核心版）');
