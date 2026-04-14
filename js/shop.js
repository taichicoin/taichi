// ==================== 商店与交互系统（完整拖拽版：三区交互 + 出售区） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let selectedCard = null;           // 点击选中模式
    let draggedCard = null;           // 当前拖拽的卡牌信息
    let currentPhase = 'prepare';
    let toastTimer = null;
    let sellZone = null;              // 出售区元素
    let sellZoneVisible = false;

    // ===== 透明调试面板 =====
    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; max-height:120px; overflow-y:auto;
            background:rgba(0,0,0,0.5); color:#0f0; font-size:11px; padding:4px 8px;
            z-index:100000; border-bottom:1px solid rgba(245,215,110,0.5);
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
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

    // ===== 短暂提示条 =====
    function toast(message, isError = false, duration = 2000) {
        const oldToast = document.getElementById('shop-toast');
        if (oldToast) oldToast.remove();
        if (toastTimer) clearTimeout(toastTimer);
        
        const toastEl = document.createElement('div');
        toastEl.id = 'shop-toast';
        toastEl.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isError ? 'rgba(200,50,50,0.9)' : 'rgba(30,40,60,0.95)'};
            color:white; font-size:14px; padding:10px 20px; border-radius:30px;
            z-index:100001; border:1px solid ${isError ? '#ff7b7b' : '#f5d76e'};
            box-shadow:0 4px 12px rgba(0,0,0,0.3); font-weight:bold;
            backdrop-filter:blur(4px); pointer-events:none; white-space:nowrap;
        `;
        toastEl.textContent = message;
        document.body.appendChild(toastEl);
        
        toastTimer = setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
            toastTimer = null;
        }, duration);
    }

    // ===== 出售区管理 =====
    function createSellZone() {
        if (sellZone) return sellZone;
        sellZone = document.createElement('div');
        sellZone.id = 'sell-zone';
        sellZone.style.cssText = `
            position:fixed; bottom:0; left:0; right:0; height:40vh;
            background:rgba(255,50,50,0.3); border-top:3px dashed #ff3333;
            z-index:90; pointer-events:none; display:none;
            backdrop-filter:blur(2px); transition:opacity 0.2s;
        `;
        // 添加文字提示
        const text = document.createElement('div');
        text.style.cssText = `
            position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
            color:white; font-size:18px; font-weight:bold; text-shadow:0 0 8px black;
            background:rgba(200,0,0,0.6); padding:8px 24px; border-radius:40px;
            border:1px solid #ff9999;
        `;
        text.textContent = '松开出售';
        sellZone.appendChild(text);
        document.body.appendChild(sellZone);
        return sellZone;
    }

    function showSellZone() {
        if (!sellZone) createSellZone();
        sellZone.style.display = 'block';
        sellZoneVisible = true;
    }

    function hideSellZone() {
        if (sellZone) {
            sellZone.style.display = 'none';
            sellZoneVisible = false;
        }
    }

    // 判断拖拽位置是否在出售区（屏幕下半部分，手牌区域上方）
    function isInSellZone(clientY) {
        const handArea = document.querySelector('.hand-area');
        if (!handArea) return false;
        const rect = handArea.getBoundingClientRect();
        // 出售区定义为从屏幕中间到手牌区域顶部
        const screenMiddle = window.innerHeight / 2;
        return clientY > screenMiddle && clientY < rect.top;
    }

    // ===== 辅助函数 =====
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    async function loadTemplates() {
        if (utils && utils.loadCardTemplates) {
            return await utils.loadCardTemplates();
        } else {
            log('⚠️ utils.loadCardTemplates 不存在', true);
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
                // 点击选中
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleHandCardClick(card, i);
                });
                // 拖拽：手牌可以放置或出售
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => handleDragStart(e, 'hand', card, i));
                el.addEventListener('dragend', (e) => { e.preventDefault(); hideSellZone(); });
                container.appendChild(el);
            }
        });
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;

        // 手牌区作为放置目标：从棋盘取回手牌
        container.addEventListener('dragover', (e) => e.preventDefault());
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            hideSellZone();
            if (!draggedCard) return;
            if (draggedCard.type === 'board') {
                // 棋盘卡牌拖回手牌：相当于放回手牌
                handleBoardToHand(draggedCard.index);
            }
            // 其他类型（如商店）拖到手牌区无效果
            draggedCard = null;
        });
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
                // 点击购买
                el.addEventListener('click', () => handleShopCardClick(card, i));
                // 拖拽购买（直接放到棋盘）
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => handleDragStart(e, 'shop', card, i));
                el.addEventListener('dragend', (e) => { e.preventDefault(); hideSellZone(); });
                container.appendChild(el);
            }
        });
        // 商店区不作为放置目标（商店不能出售，但可以刷新）
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
                    // 点击放置（配合选中）
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (selectedCard && selectedCard.type === 'hand') {
                            handleBoardSlotClick(i);
                        }
                    });
                    // 拖拽：棋盘卡牌可以移动、出售
                    el.setAttribute('draggable', true);
                    el.addEventListener('dragstart', (e) => handleDragStart(e, 'board', c, i));
                    el.addEventListener('dragend', (e) => { e.preventDefault(); hideSellZone(); });
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                if (isSelf) {
                    slot.addEventListener('click', () => handleBoardSlotClick(i));
                }
            }
            // 棋盘格子作为放置目标：手牌/商店卡牌放置到这里
            slot.addEventListener('dragover', (e) => e.preventDefault());
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                hideSellZone();
                if (!draggedCard) return;
                const targetIndex = i;
                if (draggedCard.type === 'hand') {
                    // 手牌放到棋盘
                    handleHandToBoard(draggedCard.index, targetIndex);
                } else if (draggedCard.type === 'shop') {
                    // 商店卡牌直接购买并放到棋盘
                    handleShopToBoard(draggedCard.card, draggedCard.index, targetIndex);
                } else if (draggedCard.type === 'board' && isSelf) {
                    // 棋盘内部交换位置
                    handleBoardSwap(draggedCard.index, targetIndex);
                }
                draggedCard = null;
            });
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

    // ===== 交互逻辑 =====
    function handleHandCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            toast('只能在准备阶段操作', true);
            return;
        }
        selectedCard = { type: 'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
        log(`选中手牌: ${card.name}`);
    }

    async function handleShopCardClick(card, idx) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            toast('只能在准备阶段操作', true);
            return;
        }
        const success = await window.YYCardBattle.buyCardAction(card, idx);
        if (success) {
            refreshAllUI();
            log(`✅ 购买成功: ${card.name}`);
        } else {
            toast('购买失败（金币不足或手牌已满）', true);
        }
    }

    async function handleBoardSlotClick(slotIdx) {
        if (!selectedCard || selectedCard.type !== 'hand') {
            toast('请先选择一张手牌', true);
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
            toast('放置失败', true);
        }
    }

    // 拖拽开始
    function handleDragStart(e, type, card, index) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            e.preventDefault();
            toast('只能在准备阶段操作', true);
            return;
        }
        // 商店卡牌不能出售，但可以拖拽购买（后续 drop 处理）
        draggedCard = { type, card, index };
        e.dataTransfer.setData('text/plain', card.name);
        e.dataTransfer.effectAllowed = 'move';
        log(`👆 开始拖拽: ${card.name} (${type})`);

        // 监听全局拖拽位置，显示出售区（仅当类型为 hand 或 board 时）
        if (type === 'hand' || type === 'board') {
            const handleDragOver = (ev) => {
                ev.preventDefault();
                if (isInSellZone(ev.clientY)) {
                    showSellZone();
                } else {
                    hideSellZone();
                }
            };
            document.addEventListener('dragover', handleDragOver);
            // 拖拽结束时清理
            const cleanup = () => {
                document.removeEventListener('dragover', handleDragOver);
                hideSellZone();
                document.removeEventListener('dragend', cleanup);
            };
            document.addEventListener('dragend', cleanup, { once: true });
        }
    }

    // 手牌放到棋盘
    async function handleHandToBoard(handIdx, boardIdx) {
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (success) {
            refreshAllUI();
            log(`📌 手牌放置到 ${boardIdx}`);
        } else {
            toast('放置失败', true);
        }
    }

    // 商店直接购买到棋盘
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
        if (my.gold < price) {
            toast('金币不足', true);
            return;
        }
        // 检查棋盘格子是否为空
        if (my.board[boardIdx] !== null && my.board[boardIdx] !== undefined) {
            toast('目标格子已有单位', true);
            return;
        }
        // 执行购买并放置
        const success = await window.YYCardBattle.buyAndPlaceAction(card, shopIdx, boardIdx);
        if (success) {
            refreshAllUI();
            log(`✅ 购买并放置 ${card.name} 到 ${boardIdx}`);
        } else {
            toast('操作失败', true);
        }
    }

    // 棋盘内部交换
    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const success = await window.YYCardBattle.swapBoardAction(idxA, idxB);
        if (success) {
            refreshAllUI();
            log(`🔄 棋盘位置交换`);
        } else {
            toast('交换失败', true);
        }
    }

    // 棋盘卡牌拖回手牌
    async function handleBoardToHand(boardIdx) {
        const success = await window.YYCardBattle.boardToHandAction(boardIdx);
        if (success) {
            refreshAllUI();
            log(`👋 单位返回手牌`);
        } else {
            toast('手牌已满', true);
        }
    }

    // 出售（由出售区 drop 触发）
    async function handleSell() {
        if (!draggedCard) return;
        const { type, index } = draggedCard;
        if (type !== 'hand' && type !== 'board') {
            toast('该卡牌不能出售', true);
            return;
        }
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (success) {
            refreshAllUI();
            const card = draggedCard.card;
            const sellPrice = config.ECONOMY.CARD_PRICE[card.rarity].sell;
            toast(`出售成功，获得 ${sellPrice} 金币`);
            log(`💰 出售成功: ${card.name}，获得 ${sellPrice} 金币`);
        } else {
            toast('出售失败', true);
        }
        draggedCard = null;
    }

    // 全局 drop 处理（出售区）
    function setupGlobalDrop() {
        // 出售区自己处理 drop
        const sz = createSellZone();
        sz.addEventListener('dragover', (e) => e.preventDefault());
        sz.addEventListener('drop', (e) => {
            e.preventDefault();
            hideSellZone();
            handleSell();
        });
    }

    // ===== 刷新/升级 =====
    async function refreshShopAction() {
        const success = await window.YYCardBattle.refreshShopAction();
        if (success) {
            refreshAllUI();
            log(`🔄 商店已刷新`);
        } else {
            toast('刷新失败（金币不足或不在准备阶段）', true);
        }
    }

    async function buyExpAction() {
        const success = await window.YYCardBattle.buyExpAction();
        if (success) {
            refreshAllUI();
            log(`📈 购买经验成功`);
        }
    }

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

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    function init() {
        initDebugPanel();
        bindUIEvents();
        setupGlobalDrop();
        refreshAllUI();
        log('✅ 商店交互模块已启动（完整拖拽版）');
    }

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        log,
        toast,
        generateShopCards,
        loadTemplates
    };
})();

console.log('✅ shop.js 加载完成（完整拖拽版）');
