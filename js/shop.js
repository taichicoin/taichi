// ==================== 商店与交互系统（纯拖拽版：出售区=商店区域） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    let draggedCard = null;                // 当前拖拽的卡牌信息
    let dragOverShop = false;             // 是否悬停在商店区（用于出售）

    // ===== 调试面板 =====
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

    // ===== 辅助 =====
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    // ===== 渲染 =====
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
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => handleDragStart(e, 'hand', card, i));
                el.addEventListener('dragend', handleDragEnd);
                container.appendChild(el);
            }
        });
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;

        // 手牌区作为放置目标（接收棋盘返回的单位）
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedCard) return;
            if (draggedCard.type === 'board') {
                handleBoardToHand(draggedCard.index);
            }
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
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => handleDragStart(e, 'shop', card, i));
                el.addEventListener('dragend', handleDragEnd);
                container.appendChild(el);
            }
        });

        // 商店区作为出售目标（拖手牌/棋盘单位到这里 = 出售）
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // 视觉反馈：商店区高亮
            container.style.boxShadow = '0 0 0 3px #ff4444';
        });
        container.addEventListener('dragleave', () => {
            container.style.boxShadow = '';
        });
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.style.boxShadow = '';
            if (!draggedCard) return;
            const { type, index } = draggedCard;
            if (type === 'hand' || type === 'board') {
                handleSell(type, index);
            }
            draggedCard = null;
        });
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
            slot.setAttribute('data-slot-index', i);
            
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('draggable', true);
                    el.addEventListener('dragstart', (e) => handleDragStart(e, 'board', c, i));
                    el.addEventListener('dragend', handleDragEnd);
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }

            // 每个格子作为放置目标
            if (isSelf) {
                slot.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!draggedCard) return;
                    const targetIndex = i;
                    if (draggedCard.type === 'hand') {
                        handleHandToBoard(draggedCard.index, targetIndex);
                    } else if (draggedCard.type === 'shop') {
                        handleShopToBoard(draggedCard.card, draggedCard.index, targetIndex);
                    } else if (draggedCard.type === 'board' && isSelf) {
                        handleBoardSwap(draggedCard.index, targetIndex);
                    }
                    draggedCard = null;
                });
            }
            cont.appendChild(slot);
        }
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'" draggable="false">
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

    // ===== 拖拽核心 =====
    function handleDragStart(e, type, card, index) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            e.preventDefault();
            toast('只能在准备阶段操作', true);
            return;
        }

        draggedCard = { type, card, index };
        e.dataTransfer.setData('text/plain', card.name);
        e.dataTransfer.effectAllowed = 'move';
        
        // 隐藏默认预览图
        const emptyCanvas = document.createElement('canvas');
        emptyCanvas.width = 1;
        emptyCanvas.height = 1;
        e.dataTransfer.setDragImage(emptyCanvas, 0, 0);
        
        e.target.style.opacity = '0.5';
        log(`👆 开始拖拽: ${card.name} (${type})`);
    }

    function handleDragEnd(e) {
        e.target.style.opacity = '';
        // 清理商店区高亮
        const shopContainer = document.getElementById('shop-container');
        if (shopContainer) shopContainer.style.boxShadow = '';
    }

    async function handleHandToBoard(handIdx, boardIdx) {
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (success) {
            refreshAllUI();
            log(`📌 手牌放置到 ${boardIdx}`);
        } else {
            toast('放置失败', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) {
            toast('金币不足', true);
            return;
        }
        if (my.board[boardIdx] !== null) {
            toast('目标格子已有单位', true);
            return;
        }
        const success = await window.YYCardBattle.buyAndPlaceAction(card, shopIdx, boardIdx);
        if (success) {
            refreshAllUI();
            log(`✅ 购买并放置 ${card.name} 到 ${boardIdx}`);
        } else {
            toast('操作失败', true);
        }
    }

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

    async function handleBoardToHand(boardIdx) {
        const success = await window.YYCardBattle.boardToHandAction(boardIdx);
        if (success) {
            refreshAllUI();
            log(`👋 单位返回手牌`);
        } else {
            toast('手牌已满', true);
        }
    }

    async function handleSell(type, index) {
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (success) {
            refreshAllUI();
            toast('出售成功');
            log(`💰 出售成功`);
        } else {
            toast('出售失败', true);
        }
    }

    // ===== 全局拦截 =====
    function setupGlobalDropGuard() {
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    // ===== 按钮操作（保留点击） =====
    async function refreshShopAction() {
        const success = await window.YYCardBattle.refreshShopAction();
        if (success) {
            refreshAllUI();
            log(`🔄 商店已刷新`);
        } else {
            toast('刷新失败', true);
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

    function injectDisableStyles() {
        const styleId = 'yycard-drag-fix';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            img { -webkit-user-drag: none; user-drag: none; pointer-events: none; }
            .card, .card-slot, .hand-area, .shop-area, .board-area {
                -webkit-user-select: none; user-select: none;
                -webkit-touch-callout: none;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectDisableStyles();
        initDebugPanel();
        bindUIEvents();
        setupGlobalDropGuard();
        refreshAllUI();
        log('✅ 商店交互模块已启动（纯拖拽版，出售区=商店区）');
    }

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        log,
        toast
    };
})();

console.log('✅ shop.js 加载完成（纯拖拽版）');
