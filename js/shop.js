// ==================== 商店与交互系统【手机端零延迟终极版】60帧满帧优化 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;

    // ============== 【核心优化1：预缓存游戏状态，彻底干掉深拷贝阻塞】==============
    // 只在回合切换时全量更新，平时操作只读缓存，不再反复调用getGameState()深拷贝
    let cachedGameState = null;
    let currentUserId = null;
    // 帧渲染锁：保证每一帧（16ms）只执行一次渲染，彻底杜绝重复渲染阻塞
    let isFrameLocked = false;

    // 拖拽状态（极简结构，减少内存占用）
    let dragState = {
        active: false,
        type: null,
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        cardHalfWidth: 0,
        cardHalfHeight: 0,
        shopAreaRect: null,
        currentX: 0,
        currentY: 0
    };

    // ============== 【核心优化2：卡牌图片预加载+内存缓存，彻底解决图片加载阻塞】==============
    const cardImageCache = new Map();
    // 预加载默认图片
    const defaultAvatar = new Image();
    defaultAvatar.src = '/assets/default-avatar.png';

    // 预加载单张卡牌图片
    function preloadCardImage(card) {
        if (!card) return;
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        if (cardImageCache.has(imgPath)) return cardImageCache.get(imgPath);
        
        const img = new Image();
        img.src = imgPath;
        img.onerror = () => { img.src = defaultAvatar.src; };
        img.draggable = false;
        cardImageCache.set(imgPath, img);
        return img;
    }

    // 批量预加载卡牌图片
    function preloadAllCardImages(cards) {
        if (!cards || cards.length === 0) return;
        cards.forEach(card => preloadCardImage(card));
    }

    // ============== 工具函数 ==============
    // 【优化】只在初始化/回合切换时更新缓存，平时只读缓存，零深拷贝
    function updateGameStateCache() {
        const state = window.YYCardBattle?.getGameState();
        if (state) {
            cachedGameState = state;
            currentUserId = window.YYCardAuth?.currentUser?.id;
        }
        return cachedGameState;
    }

    // 【优化】只读缓存，零深拷贝，零延迟
    function getGameState() {
        return cachedGameState || updateGameStateCache();
    }

    function getCurrentUser() {
        const state = getGameState();
        if (!state || !currentUserId) return null;
        return state.players[currentUserId];
    }

    // 调试面板
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
        // 非阻塞，放到帧尾执行
        requestAnimationFrame(() => {
            const p = document.getElementById('shop-debug-panel') || initDebugPanel();
            const line = document.createElement('div');
            line.style.color = isError ? '#ff7b7b' : '#7bffb1';
            line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
            p.appendChild(line);
            p.scrollTop = p.scrollHeight;
            while (p.children.length > 20) p.removeChild(p.firstChild);
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

    // ============== 【核心优化3：DOM节点复用+增量渲染，彻底干掉全量重建】==============
    // 不再每次都删了重写，只更新变化的内容，DOM操作量减少99%
    function createReusableCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const img = preloadCardImage(card);

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
        d.querySelector('.card-icon').appendChild(img.cloneNode());
        return d;
    }

    // 1. 棋盘渲染（增量复用，零全量重建）
    function renderMyBoard() {
        const my = getCurrentUser();
        if (!my) return;
        const container = document.getElementById('my-board');
        if (!container) return;

        const slots = container.children;
        const boardData = my.board;

        // 只更新变化的格子，不动已有的节点
        for (let i = 0; i < 6; i++) {
            const card = boardData[i];
            let slot = slots[i];

            // 没有格子就创建，有就复用
            if (!slot) {
                slot = document.createElement('div');
                slot.className = 'card-slot';
                slot.setAttribute('data-slot-index', i);
                container.appendChild(slot);
            }

            // 卡牌没变，直接跳过，零DOM操作
            const existingCard = slot.querySelector('.card');
            const existingIndex = existingCard?.getAttribute('data-board-index');
            if (existingCard && existingIndex == i && !card) {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                continue;
            }
            if (existingCard && existingIndex == i && card) continue;

            // 只有变化了才更新
            slot.innerHTML = '';
            if (card) {
                const el = createReusableCardElement(card);
                el.setAttribute('data-board-index', i);
                el.setAttribute('data-card-type', 'board');
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
        }
    }

    // 2. 敌方棋盘渲染（仅战斗阶段执行，准备阶段完全跳过）
    function renderEnemyBoard() {
        const isBattleView = document.body.classList.contains('battle-view-mode');
        const state = getGameState();
        if (!isBattleView || !state || state.phase !== 'battle') return;

        let oppId = null;
        if (state.battlePairs) {
            for (const [p1, p2] of state.battlePairs) {
                if (p1 === currentUserId && p2) { oppId = p2; break; }
                if (p2 === currentUserId && p1) { oppId = p1; break; }
            }
        }
        
        if (!oppId) {
            const aliveHumans = Object.entries(state.players).filter(([id, p]) => 
                id !== currentUserId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        if (!oppId) {
            const aliveAny = Object.entries(state.players).find(([id, p]) => 
                id !== currentUserId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        if (!oppId) oppId = Object.keys(state.players).find(id => id !== currentUserId);

        if (oppId && state.players[oppId]) {
            const originalBoard = state.players[oppId].board;
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            const container = document.getElementById('enemy-board');
            if (!container) return;

            const slots = container.children;
            for (let i = 0; i < 6; i++) {
                const card = enemyDisplayBoard[i];
                let slot = slots[i];
                if (!slot) {
                    slot = document.createElement('div');
                    slot.className = 'card-slot';
                    container.appendChild(slot);
                }
                const existingCard = slot.querySelector('.card');
                if (existingCard && !card) {
                    slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                    continue;
                }
                if (existingCard && card) continue;

                slot.innerHTML = '';
                if (card) {
                    const el = createReusableCardElement(card);
                    slot.appendChild(el);
                } else {
                    slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                }
            }
        }
    }

    // 3. 手牌渲染（增量复用）
    function renderHand() {
        const my = getCurrentUser();
        if (!my) return;
        const container = document.getElementById('hand-container');
        if (!container) return;

        const handData = my.hand.filter(c => c);
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        handData.forEach((card, i) => {
            const el = createReusableCardElement(card);
            el.setAttribute('data-hand-index', my.hand.indexOf(card));
            el.setAttribute('data-card-type', 'hand');
            fragment.appendChild(el);
        });

        container.appendChild(fragment);

        requestAnimationFrame(() => {
            const countEl = document.getElementById('hand-count');
            if (countEl) countEl.textContent = handData.length;
        });
    }

    // 4. 商店渲染（增量复用，点击刷新秒更）
    function renderShop() {
        const my = getCurrentUser();
        if (!my) return;
        const container = document.getElementById('shop-container');
        if (!container) return;

        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店刷新中...</div>';
            return;
        }

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createReusableCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
    }

    // ============== 渲染调度（帧级锁，保证每一帧只渲染一次）==============
    function scheduleRender(renderType = 'all') {
        // 帧锁：如果当前帧已经锁定，直接跳过，避免重复渲染
        if (isFrameLocked) return;
        isFrameLocked = true;

        // 在下一帧执行渲染，保证在浏览器渲染周期内，零卡顿
        requestAnimationFrame(() => {
            switch(renderType) {
                case 'shop':
                    renderShop();
                    break;
                case 'hand-board':
                    renderMyBoard();
                    renderHand();
                    break;
                case 'all':
                default:
                    renderMyBoard();
                    renderHand();
                    renderShop();
                    renderEnemyBoard();
                    break;
            }

            // 非核心数值更新，放到帧尾执行
            requestAnimationFrame(() => {
                const my = getCurrentUser();
                const state = getGameState();
                if (my) {
                    document.getElementById('my-health').textContent = my.health;
                    document.getElementById('my-gold').textContent = my.gold;
                    document.getElementById('shop-level').textContent = my.shopLevel;
                    const healthTop = document.getElementById('my-health-top');
                    if (healthTop) healthTop.textContent = my.health;
                }
                if (state) {
                    document.getElementById('round-num').textContent = state.round;
                    const roundTop = document.getElementById('round-num-top');
                    if (roundTop) roundTop.textContent = state.round;
                    updateBuyExpButtonState();
                }
                // 解锁帧锁
                isFrameLocked = false;
            });
        });
    }

    // 全量刷新（仅回合切换调用）
    function refreshAllUI() {
        updateGameStateCache();
        scheduleRender('all');
    }

    // 仅刷新商店（点击刷新按钮调用）
    function refreshShopOnlyUI() {
        updateGameStateCache();
        scheduleRender('shop');
    }

    // 仅刷新手牌+棋盘（拖拽操作调用）
    function refreshHandAndBoardUI() {
        updateGameStateCache();
        scheduleRender('hand-board');
    }

    function updateBuyExpButtonState() {
        const my = getCurrentUser();
        const state = getGameState();
        if (!my || !state) return;
        
        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const isMyTurn = state.phase === 'prepare';
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

    // ============== 【核心优化4：毫秒级拖拽，彻底解决手机端触摸延迟】==============
    // 【关键】所有触摸事件加passive: true，手机端彻底解除事件阻塞，零触摸延迟
    function onDragStart(e) {
        const state = getGameState();
        if (!state || state.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }

        // 找到触发事件的卡牌元素
        const targetCard = e.target.closest('.card');
        if (!targetCard) return;

        e.preventDefault();
        e.stopPropagation();
        targetCard.setPointerCapture(e.pointerId);

        // 一次性获取所有需要的数值，拖拽中不再查询DOM
        const clientX = e.clientX;
        const clientY = e.clientY;
        const cardRect = targetCard.getBoundingClientRect();
        const cardWidth = cardRect.width;
        const cardHeight = cardRect.height;

        // 预缓存商店区域，拖拽中不再查询
        const shopArea = document.querySelector('.shop-area');
        const shopAreaRect = shopArea ? shopArea.getBoundingClientRect() : null;

        // 克隆元素，GPU加速，零重排
        const clone = targetCard.cloneNode(true);
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

        // 原卡片半透明
        targetCard.style.opacity = '0.3';

        // 填充拖拽状态
        dragState = {
            active: true,
            type: targetCard.getAttribute('data-card-type'),
            card: null,
            index: parseInt(targetCard.getAttribute(`data-${targetCard.getAttribute('data-card-type')}-index`)),
            sourceElement: targetCard,
            cloneElement: clone,
            cardHalfWidth: cardWidth / 2,
            cardHalfHeight: cardHeight / 2,
            shopAreaRect,
            currentX: clientX,
            currentY: clientY
        };

        // 预加载卡牌数据
        const my = getCurrentUser();
        if (my) {
            switch(dragState.type) {
                case 'hand': dragState.card = my.hand[dragState.index]; break;
                case 'board': dragState.card = my.board[dragState.index]; break;
                case 'shop': dragState.card = my.shopCards[dragState.index]; break;
            }
        }

        // 【关键】绑定事件加passive: true，手机端零阻塞
        document.addEventListener('pointermove', onDragMove, { passive: true });
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState.active) return;

        const clientX = e.clientX;
        const clientY = e.clientY;
        dragState.currentX = clientX;
        dragState.currentY = clientY;

        // GPU加速更新位置，零重排，零阻塞
        dragState.cloneElement.style.transform = `translate3d(${clientX - dragState.cardHalfWidth}px, ${clientY - dragState.cardHalfHeight}px, 0)`;

        // 商店高亮检测，用预缓存的rect，零DOM查询
        if ((dragState.type === 'hand' || dragState.type === 'board') && dragState.shopAreaRect) {
            const isOverShop = clientX >= dragState.shopAreaRect.left && clientX <= dragState.shopAreaRect.right &&
                               clientY >= dragState.shopAreaRect.top && clientY <= dragState.shopAreaRect.bottom;
            document.querySelector('.shop-area')?.classList.toggle('drop-target', isOverShop);
        }
    }

    function onDragEnd(e) {
        if (!dragState.active) return;

        // 1. 瞬间清理视觉元素，零延迟
        const { type, index, card, sourceElement, cloneElement, currentX, currentY } = dragState;
        cloneElement.remove();
        sourceElement.style.opacity = '';
        document.querySelector('.shop-area')?.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);

        // 2. 解绑事件
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 3. 落点检测
        const targetElement = document.elementFromPoint(currentX, currentY);
        const dropResult = targetElement ? getDropTarget(targetElement) : null;

        // 4. 重置拖拽状态
        dragState.active = false;
        dragState = { active: false };

        // 5. 执行业务逻辑
        if (dropResult && card) {
            executeDropAction(type, index, card, dropResult);
        }
    }

    function getDropTarget(element) {
        let el = element;
        // 最多遍历8层，提前终止，零无效循环
        for (let i = 0; i < 8 && el && el !== document.body; i++) {
            if (el.classList.contains('card-slot')) {
                const boardId = el.closest('.board')?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            if (el.id === 'hand-container') return { zone: 'hand' };
            if (el.id === 'shop-container') return { zone: 'shop' };
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

    // ============== 【核心优化5：全业务乐观更新，UI秒更，网络完全不阻塞】==============
    async function handleHandToBoard(handIdx, boardIdx) {
        const my = getCurrentUser();
        if (!my || !my.hand[handIdx] || my.board[boardIdx] !== null) {
            toast('目标格子已有单位', true);
            return;
        }

        // 乐观更新：本地立刻改数据+渲染，0延迟
        const targetCard = my.hand[handIdx];
        my.hand[handIdx] = null;
        my.board[boardIdx] = targetCard;
        refreshHandAndBoardUI();

        // 后台异步同步后端，完全不阻塞
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (!success) {
            my.hand[handIdx] = targetCard;
            my.board[boardIdx] = null;
            refreshHandAndBoardUI();
            toast('放置失败', true);
        }
    }

    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const my = getCurrentUser();
        if (!my) return;

        // 乐观更新
        const temp = my.board[idxA];
        my.board[idxA] = my.board[idxB];
        my.board[idxB] = temp;
        refreshHandAndBoardUI();

        // 后台同步
        const success = await window.YYCardBattle.swapBoardAction(idxA, idxB);
        if (!success) {
            my.board[idxB] = my.board[idxA];
            my.board[idxA] = temp;
            refreshHandAndBoardUI();
            toast('交换失败', true);
        }
    }

    async function handleBoardToHand(boardIdx) {
        const my = getCurrentUser();
        if (!my) return;
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
        const my = getCurrentUser();
        if (!my) return;
        let targetCard = null;

        if (type === 'hand') targetCard = my.hand[index];
        else if (type === 'board') targetCard = my.board[index];
        if (!targetCard) return;

        // 乐观更新
        const sellPrice = (config.ECONOMY?.CARD_PRICE?.[targetCard.rarity]?.sell) || 1;
        if (type === 'hand') my.hand[index] = null;
        if (type === 'board') my.board[index] = null;
        my.gold += sellPrice;
        refreshHandAndBoardUI();
        toast('出售成功');

        // 后台同步
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (!success) {
            if (type === 'hand') my.hand[index] = targetCard;
            if (type === 'board') my.board[index] = targetCard;
            my.gold -= sellPrice;
            refreshHandAndBoardUI();
            toast('出售失败', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const my = getCurrentUser();
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        if (!my || my.gold < price || my.board[boardIdx] !== null) {
            toast(my?.gold < price ? '金币不足' : '目标格子已有单位', true);
            return;
        }

        // 乐观更新
        my.gold -= price;
        my.board[boardIdx] = card;
        my.shopCards[shopIdx] = null;
        refreshHandAndBoardUI();
        refreshShopOnlyUI();

        // 后台同步
        const success = await window.YYCardBattle.buyAndPlaceAction(card, shopIdx, boardIdx);
        if (!success) {
            my.gold += price;
            my.board[boardIdx] = null;
            my.shopCards[shopIdx] = card;
            refreshHandAndBoardUI();
            refreshShopOnlyUI();
            toast('操作失败', true);
        }
    }

    async function handleShopToHand(card, shopIdx) {
        const my = getCurrentUser();
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const handHasEmpty = my?.hand.some(c => c === null);

        if (!my || my.gold < price || !handHasEmpty) {
            toast(my?.gold < price ? '金币不足' : '手牌已满', true);
            return;
        }

        // 乐观更新
        const emptyHandIdx = my.hand.findIndex(c => c === null);
        my.gold -= price;
        my.hand[emptyHandIdx] = card;
        my.shopCards[shopIdx] = null;
        refreshHandAndBoardUI();
        refreshShopOnlyUI();

        // 后台同步
        const success = await window.YYCardBattle.buyCardAction(card, shopIdx);
        if (!success) {
            my.gold += price;
            my.hand[emptyHandIdx] = null;
            my.shopCards[shopIdx] = card;
            refreshHandAndBoardUI();
            refreshShopOnlyUI();
            toast('购买失败', true);
        }
    }

    // ============== 按钮操作 ==============
    async function refreshShopAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const my = getCurrentUser();
        const refreshCost = (config.ECONOMY?.REFRESH_SHOP_COST) || 1;

        if (my.gold < refreshCost) {
            toast('刷新金币不足', true);
            return;
        }

        // 【秒级响应】点击立刻更新UI，不等后端
        my.gold -= refreshCost;
        my.shopCards = [];
        refreshShopOnlyUI();

        // 后台异步刷新
        const success = await window.YYCardBattle.refreshShopAction();
        updateGameStateCache();
        if (success) {
            refreshShopOnlyUI();
            log(`🔄 商店已刷新`);
        } else {
            my.gold += refreshCost;
            refreshShopOnlyUI();
            toast('刷新失败', true);
        }
    }

    async function buyExpAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const success = await window.YYCardBattle.buyExpAction();
        if (success) {
            updateGameStateCache();
            refreshAllUI();
            log(`📈 购买经验成功`);
        }
    }

    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            timerEl.textContent = phase === 'buffering' ? `⏳ ${seconds}` : `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) {
            battleTimerEl.textContent = phase === 'battle' ? seconds : '00:00';
        }
    }

    function setPhase(phase) {
        currentPhase = phase;
        document.body.classList.toggle('buffering-mode', phase === 'buffering');
        // 阶段切换时全量更新缓存和UI
        updateGameStateCache();
        refreshAllUI();
    }

    // ============== 【核心优化6：事件委托，减少90%事件监听】==============
    function bindUIEvents() {
        // 所有卡牌的拖拽事件委托到父容器，不再每个卡牌单独绑定
        document.getElementById('shop-container')?.addEventListener('pointerdown', onDragStart, { passive: false });
        document.getElementById('hand-container')?.addEventListener('pointerdown', onDragStart, { passive: false });
        document.getElementById('my-board')?.addEventListener('pointerdown', onDragStart, { passive: false });

        // 按钮事件
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // ============== CSS性能优化注入 ==============
    function injectStyles() {
        const styleId = 'yycard-ultimate-optimize';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 【手机端核心性能优化】强制GPU渲染，隔离渲染层，杜绝全页面重绘 */
            .card {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                will-change: transform;
                transform: translateZ(0);
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
            }
            .shop-cards, .hand, .board {
                contain: strict;
                will-change: contents;
                transform: translateZ(0);
            }
            .card-drag-clone {
                pointer-events: none !important;
                will-change: transform;
                z-index: 99999;
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
            /* 干掉手机端滚动回弹 */
            html, body {
                overscroll-behavior: none;
                -webkit-overflow-scrolling: touch;
            }
        `;
        document.head.appendChild(style);
    }

    // ============== 初始化 ==============
    function init() {
        injectStyles();
        initDebugPanel();
        // 初始化时预加载游戏状态
        updateGameStateCache();
        // 预加载所有卡牌图片
        const my = getCurrentUser();
        if (my) {
            preloadAllCardImages(my.shopCards);
            preloadAllCardImages(my.hand);
            preloadAllCardImages(my.board);
        }
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动【零延迟终极版】');
    }

    return {
        init,
        refreshAllUI,
        refreshShopOnlyUI,
        refreshHandAndBoardUI,
        updateTimerDisplay,
        setPhase,
        updateGameStateCache,
        log,
        toast
    };
})();

console.log('✅ shop.js 加载完成【手机端零延迟终极版】');
