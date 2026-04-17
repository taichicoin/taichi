// ==================== 商店与交互系统（极致流畅拖拽 + 毫秒级刷新零延迟版） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    // 【优化1：渲染锁，防止重复渲染阻塞主线程】
    let isRendering = false;

    // 拖拽状态（预存所有需要的数值，避免拖拽中重复查询DOM/重排）
    let dragState = {
        active: false,
        type: null,         // 'hand', 'board', 'shop'
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        // 预计算核心数值（拖拽中不再查询DOM）
        cardHalfWidth: 0,
        cardHalfHeight: 0,
        // 预缓存目标区域（避免拖拽中重复获取DOM）
        shopArea: null,
        shopAreaRect: null,
        // 坐标数据
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    };

    // 调试面板（透明背景、无边框）
    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; max-height:120px; overflow-y:auto;
            color:#0f0; font-size:11px; padding:4px 8px;
            z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent;
            border: none;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        // 非阻塞渲染，放到空闲时间执行
        requestIdleCallback(() => {
            const p = document.getElementById('shop-debug-panel') || initDebugPanel();
            const line = document.createElement('div');
            line.style.color = isError ? '#ff7b7b' : '#7bffb1';
            line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
            p.appendChild(line);
            p.scrollTop = p.scrollHeight;
            while (p.children.length > 30) p.removeChild(p.firstChild);
        });
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

    // ===== 【核心优化2：渲染全重构，零碎片化重排 + 增量更新】=====
    // 1. 棋盘渲染（仅重绘自己，用DocumentFragment一次性插入）
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('my-board');
        if (!container) return;

        // 用DocumentFragment合并DOM操作，只触发一次重排
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const c = my.board[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            if (c) {
                const el = createCardElement(c);
                el.setAttribute('data-board-index', i);
                el.setAttribute('data-card-type', 'board');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            fragment.appendChild(slot);
        }

        // 一次性清空+插入，仅2次DOM操作
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // 2. 敌方棋盘渲染（仅战斗阶段渲染，准备阶段不执行，减少无效性能消耗）
    function renderEnemyBoard() {
        // 非对战视图/非战斗阶段，直接跳过，不执行渲染
        const isBattleView = document.body.classList.contains('battle-view-mode');
        const gameState = getGameState();
        if (!isBattleView || !gameState || gameState.phase !== 'battle') return;

        const userId = getCurrentUserId();
        let oppId = null;

        // 战斗阶段：根据配对找出真正的对手
        if (gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        
        // 回退逻辑
        if (!oppId) {
            const aliveHumans = Object.entries(gameState.players).filter(([id, p]) => 
                id !== userId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        if (!oppId) {
            const aliveAny = Object.entries(gameState.players).find(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        if (!oppId) oppId = Object.keys(gameState.players).find(id => id !== userId);

        if (oppId && gameState.players[oppId]) {
            const originalBoard = gameState.players[oppId].board;
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            const container = document.getElementById('enemy-board');
            if (!container) return;

            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 6; i++) {
                const c = enemyDisplayBoard[i];
                const slot = document.createElement('div');
                slot.className = 'card-slot';
                slot.setAttribute('data-slot-index', i);
                
                if (c) {
                    const el = createCardElement(c);
                    slot.appendChild(el);
                } else {
                    slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                }
                fragment.appendChild(slot);
            }
            container.innerHTML = '';
            container.appendChild(fragment);
        }
    }

    // 3. 手牌渲染（仅重绘自己，合并DOM操作）
    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('hand-container');
        if (!container) return;

        const fragment = document.createDocumentFragment();
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
                fragment.appendChild(el);
            }
        });

        container.innerHTML = '';
        container.appendChild(fragment);

        // 手牌数量更新放到空闲时间
        requestIdleCallback(() => {
            const countEl = document.getElementById('hand-count');
            if (countEl) countEl.textContent = my.hand.filter(c => c).length;
        });
    }

    // 4. 商店渲染（仅重绘自己，点击刷新时单独调用，不碰其他区域）
    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('shop-container');
        if (!container) return;

        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店刷新中...</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el));
                fragment.appendChild(el);
            }
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // ===== 【核心优化3：增量刷新，只更新变化的区域，告别全量重绘】=====
    // 全量刷新（仅回合切换/战斗结束时调用）
    function refreshAllUI() {
        // 渲染锁，防止重复执行
        if (isRendering) return;
        isRendering = true;

        // 核心渲染同步执行，保证视觉一致
        renderMyBoard();
        renderHand();
        renderShop();
        renderEnemyBoard();

        // 非核心数值更新，放到空闲时间执行，不阻塞主线程
        requestIdleCallback(() => {
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
            // 解锁渲染锁
            isRendering = false;
        });
    }

    // 【增量刷新1：仅刷新商店，点击刷新按钮时调用，DOM操作量减少90%】
    function refreshShopOnlyUI() {
        renderShop();
        requestIdleCallback(() => {
            const gameState = getGameState();
            if (gameState) {
                const userId = getCurrentUserId();
                const my = gameState.players[userId];
                if (my) {
                    document.getElementById('my-gold').textContent = my.gold;
                }
            }
        });
    }

    // 【增量刷新2：仅刷新手牌+棋盘，拖拽操作时调用，不碰商店/敌方棋盘】
    function refreshHandAndBoardUI() {
        if (isRendering) return;
        isRendering = true;
        renderMyBoard();
        renderHand();
        requestIdleCallback(() => {
            const gameState = getGameState();
            if (gameState) {
                const userId = getCurrentUserId();
                const my = gameState.players[userId];
                if (my) {
                    document.getElementById('my-gold').textContent = my.gold;
                }
                updateBuyExpButtonState();
            }
            isRendering = false;
        });
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

    // 卡牌元素创建（预加载图片，避免渲染时阻塞）
    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        // 【优化4：图片预加载，避免渲染时闪烁/阻塞】
        const img = new Image();
        img.src = imgPath;
        img.onerror = () => { img.src = '/assets/default-avatar.png'; };
        img.draggable = false;

        d.innerHTML = `
            <div class="card-icon"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">🛡️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        // 把预加载的图片插入，避免二次请求
        d.querySelector('.card-icon').appendChild(img);
        return d;
    }

    // ==================== 【保留极致流畅拖拽核心，零修改】====================
    function onDragStart(e, type, card, index, element) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;
        const cardRect = element.getBoundingClientRect();
        const cardWidth = cardRect.width;
        const cardHeight = cardRect.height;

        const shopArea = document.querySelector('.shop-area');
        const shopAreaRect = shopArea ? shopArea.getBoundingClientRect() : null;

        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 99999;
            left: 0;
            top: 0;
            width: ${cardWidth}px;
            height: ${cardHeight}px;
            opacity: 0.85;
            transform: translate3d(${clientX - cardWidth/2}px, ${clientY - cardHeight/2}px, 0);
            transform-origin: center center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
            will-change: transform;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
        `;
        document.body.appendChild(clone);

        element.style.opacity = '0.3';

        dragState = {
            active: true,
            type,
            card,
            index,
            sourceElement: element,
            cloneElement: clone,
            cardHalfWidth: cardWidth / 2,
            cardHalfHeight: cardHeight / 2,
            shopArea,
            shopAreaRect,
            startX: clientX,
            startY: clientY,
            currentX: clientX,
            currentY: clientY
        };

        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;
        dragState.currentX = clientX;
        dragState.currentY = clientY;

        dragState.cloneElement.style.transform = `translate3d(${clientX - dragState.cardHalfWidth}px, ${clientY - dragState.cardHalfHeight}px, 0)`;

        if ((dragState.type === 'hand' || dragState.type === 'board') && dragState.shopArea && dragState.shopAreaRect) {
            const isOverShop = clientX >= dragState.shopAreaRect.left && clientX <= dragState.shopAreaRect.right &&
                               clientY >= dragState.shopAreaRect.top && clientY <= dragState.shopAreaRect.bottom;
            dragState.shopArea.classList.toggle('drop-target', isOverShop);
        }
    }

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, index, card, sourceElement, cloneElement, currentX, currentY, shopArea } = dragState;
        cloneElement.remove();
        sourceElement.style.opacity = '';
        if (shopArea) shopArea.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);

        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        const targetElement = document.elementFromPoint(currentX, currentY);
        const dropResult = targetElement ? getDropTarget(targetElement) : null;

        dragState.active = false;
        dragState = { active: false };

        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }
    }

    function getDropTarget(element) {
        let el = element;
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
            if (el.classList.contains('card-slot')) {
                const boardId = el.closest('.board')?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            if (el.id === 'hand-container') {
                return { zone: 'hand' };
            }
            if (el.id === 'shop-container') {
                return { zone: 'shop' };
            }
            el = el.parentElement;
        }
        return null;
    }

    async function executeDropAction(type, index, card, dropResult) {
        if (type === 'hand') {
            if (dropResult.zone === 'board') {
                await handleHandToBoard(index, dropResult.index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('hand', index);
            }
        } else if (type === 'board') {
            if (dropResult.zone === 'board') {
                await handleBoardSwap(index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleBoardToHand(index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('board', index);
            }
        } else if (type === 'shop') {
            if (dropResult.zone === 'board') {
                await handleShopToBoard(card, index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleShopToHand(card, index);
            }
        }
    }

    // ===== 【核心优化5：业务逻辑全乐观更新，零网络阻塞，松手秒更UI】=====
    async function handleHandToBoard(handIdx, boardIdx) {
        // 1. 前置校验
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my || !my.hand[handIdx] || my.board[boardIdx] !== null) {
            toast('目标格子已有单位', true);
            return;
        }

        // 2. 乐观更新：本地立刻改数据+渲染UI，0延迟
        const targetCard = my.hand[handIdx];
        my.hand[handIdx] = null;
        my.board[boardIdx] = targetCard;
        refreshHandAndBoardUI();

        // 3. 后台异步同步后端，完全不阻塞用户
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (!success) {
            // 失败静默回滚
            my.hand[handIdx] = targetCard;
            my.board[boardIdx] = null;
            refreshHandAndBoardUI();
            toast('放置失败', true);
        }
    }

    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];

        // 乐观更新：本地立刻交换+渲染
        const temp = my.board[idxA];
        my.board[idxA] = my.board[idxB];
        my.board[idxB] = temp;
        refreshHandAndBoardUI();

        // 后台异步同步
        const success = await window.YYCardBattle.swapBoardAction(idxA, idxB);
        if (!success) {
            my.board[idxB] = my.board[idxA];
            my.board[idxA] = temp;
            refreshHandAndBoardUI();
            toast('交换失败', true);
        }
    }

    async function handleBoardToHand(boardIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const handHasEmpty = my.hand.some(c => c === null);
        if (!handHasEmpty) {
            toast('手牌已满', true);
            return;
        }

        // 乐观更新
        const targetCard = my.board[boardIdx];
        const emptyHandIdx = my.hand.findIndex(c => c === null);
        my.board[boardIdx] = null;
        my.hand[emptyHandIdx] = targetCard;
        refreshHandAndBoardUI();

        // 后台同步
        const success = await window.YYCardBattle.boardToHandAction(boardIdx);
        if (!success) {
            my.board[boardIdx] = targetCard;
            my.hand[emptyHandIdx] = null;
            refreshHandAndBoardUI();
            toast('操作失败', true);
        }
    }

    async function handleSell(type, index) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        let targetCard = null;

        // 前置校验+获取卡牌
        if (type === 'hand') {
            targetCard = my.hand[index];
            if (!targetCard) return;
        } else if (type === 'board') {
            targetCard = my.board[index];
            if (!targetCard) return;
        }

        // 乐观更新：立刻移除卡牌+更新金币+渲染
        const sellPrice = (config.ECONOMY?.CARD_PRICE?.[targetCard.rarity]?.sell) || 1;
        if (type === 'hand') my.hand[index] = null;
        if (type === 'board') my.board[index] = null;
        my.gold += sellPrice;
        refreshHandAndBoardUI();
        toast('出售成功');

        // 后台同步
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (!success) {
            // 失败回滚
            if (type === 'hand') my.hand[index] = targetCard;
            if (type === 'board') my.board[index] = targetCard;
            my.gold -= sellPrice;
            refreshHandAndBoardUI();
            toast('出售失败', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        // 前置校验
        if (my.gold < price) {
            toast('金币不足', true);
            return;
        }
        if (my.board[boardIdx] !== null) {
            toast('目标格子已有单位', true);
            return;
        }

        // 乐观更新：立刻扣金币+放卡牌+渲染
        my.gold -= price;
        my.board[boardIdx] = card;
        my.shopCards[shopIdx] = null;
        refreshHandAndBoardUI();
        renderShop();

        // 后台同步
        const success = await window.YYCardBattle.buyAndPlaceAction(card, shopIdx, boardIdx);
        if (!success) {
            // 失败回滚
            my.gold += price;
            my.board[boardIdx] = null;
            my.shopCards[shopIdx] = card;
            refreshHandAndBoardUI();
            renderShop();
            toast('操作失败', true);
        }
    }

    async function handleShopToHand(card, shopIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const handHasEmpty = my.hand.some(c => c === null);

        if (my.gold < price) {
            toast('金币不足', true);
            return;
        }
        if (!handHasEmpty) {
            toast('手牌已满', true);
            return;
        }

        // 乐观更新
        const emptyHandIdx = my.hand.findIndex(c => c === null);
        my.gold -= price;
        my.hand[emptyHandIdx] = card;
        my.shopCards[shopIdx] = null;
        refreshHandAndBoardUI();
        renderShop();

        // 后台同步
        const success = await window.YYCardBattle.buyCardAction(card, shopIdx);
        if (!success) {
            my.gold += price;
            my.hand[emptyHandIdx] = null;
            my.shopCards[shopIdx] = card;
            refreshHandAndBoardUI();
            renderShop();
            toast('购买失败', true);
        }
    }

    // ===== 【核心优化6：商店刷新按钮秒级响应，点击立刻给反馈】=====
    async function refreshShopAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        const refreshCost = (config.ECONOMY?.REFRESH_SHOP_COST) || 1;

        // 前置校验
        if (my.gold < refreshCost) {
            toast('刷新金币不足', true);
            return;
        }

        // 【秒级响应】点击立刻扣金币+清空商店+显示刷新中，不等后端返回
        my.gold -= refreshCost;
        my.shopCards = [];
        renderShopOnlyUI();

        // 后台异步执行刷新
        const success = await window.YYCardBattle.refreshShopAction();
        if (success) {
            // 后端返回新卡牌，立刻渲染
            renderShopOnlyUI();
            log(`🔄 商店已刷新`);
        } else {
            // 失败回滚
            my.gold += refreshCost;
            renderShopOnlyUI();
            toast('刷新失败', true);
        }
    }

    async function buyExpAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        // 升级按钮不做乐观更新，避免等级显示异常，保留原逻辑
        const success = await window.YYCardBattle.buyExpAction();
        if (success) {
            refreshAllUI();
            log(`📈 购买经验成功`);
        }
    }

    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') {
                timerEl.textContent = `⏳ ${seconds}`;
                return;
            }
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
        if (phase === 'buffering') {
            document.body.classList.add('buffering-mode');
        } else {
            document.body.classList.remove('buffering-mode');
        }
        // 阶段切换时才全量刷新，平时不用
        refreshAllUI();
    }

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
            }
            .card-drag-clone {
                pointer-events: none !important;
                will-change: transform;
            }
            .shop-area.drop-target {
                box-shadow: 0 0 0 4px #ff4444 !important;
                transition: box-shadow 0.1s;
            }
            .buffering-mode .card,
            .buffering-mode .btn,
            .buffering-mode .shop-area,
            .buffering-mode .hand-area {
                pointer-events: none !important;
                opacity: 0.6;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        initDebugPanel();
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动（极致流畅+毫秒级刷新版）');
    }

    return {
        init,
        refreshAllUI,
        refreshShopOnlyUI,
        refreshHandAndBoardUI,
        updateTimerDisplay,
        setPhase,
        log,
        toast
    };
})();

console.log('✅ shop.js 加载完成（极致流畅拖拽 + 毫秒级刷新零延迟版）');
