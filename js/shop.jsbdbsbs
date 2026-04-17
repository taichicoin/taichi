// ==================== 商店与交互系统【操作零失败修复版】兼顾流畅度 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    // 帧渲染锁：保证每一帧只执行一次渲染，杜绝重复渲染卡顿
    let isFrameLocked = false;
    // 卡牌图片预加载缓存（不影响数据，纯性能优化）
    const cardImageCache = new Map();
    const defaultAvatar = new Image();
    defaultAvatar.src = '/assets/default-avatar.png';

    // 拖拽状态（极简，只存索引，不存数据，避免和后端不同步）
    let dragState = {
        active: false,
        type: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        cardHalfWidth: 0,
        cardHalfHeight: 0,
        shopAreaRect: null,
        currentX: 0,
        currentY: 0
    };

    // ============== 工具函数（保证永远拿后端最新状态，杜绝缓存不同步）==============
    function getGameState() {
        // 永远拿最新的状态，不做强缓存，杜绝数据不同步
        return window.YYCardBattle?.getGameState();
    }

    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id;
    }

    function getCurrentUser() {
        const state = getGameState();
        const userId = getCurrentUserId();
        if (!state || !userId) return null;
        return state.players[userId];
    }

    // 卡牌图片预加载（纯性能优化，不影响数据）
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

    // ============== 调试&提示 ==============
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

    // ============== 渲染函数（保留性能优化，不影响数据正确性）==============
    function createCardElement(card) {
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

    // 棋盘渲染（DocumentFragment批量操作，减少重排）
    function renderMyBoard() {
        const my = getCurrentUser();
        if (!my) return;
        const container = document.getElementById('my-board');
        if (!container) return;

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const card = my.board[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-board-index', i);
                el.setAttribute('data-card-type', 'board');
                // 每个卡牌单独绑定事件，保证索引100%正确，杜绝操作错卡牌
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', i, el));
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            fragment.appendChild(slot);
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // 敌方棋盘渲染（仅战斗阶段执行，减少无效渲染）
    function renderEnemyBoard() {
        const isBattleView = document.body.classList.contains('battle-view-mode');
        const state = getGameState();
        const userId = getCurrentUserId();
        if (!isBattleView || !state || state.phase !== 'battle' || !userId) return;

        let oppId = null;
        if (state.battlePairs) {
            for (const [p1, p2] of state.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        
        if (!oppId) {
            const aliveHumans = Object.entries(state.players).filter(([id, p]) => 
                id !== userId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        if (!oppId) {
            const aliveAny = Object.entries(state.players).find(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        if (!oppId) oppId = Object.keys(state.players).find(id => id !== userId);

        if (oppId && state.players[oppId]) {
            const originalBoard = state.players[oppId].board;
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            const container = document.getElementById('enemy-board');
            if (!container) return;

            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 6; i++) {
                const card = enemyDisplayBoard[i];
                const slot = document.createElement('div');
                slot.className = 'card-slot';
                if (card) {
                    slot.appendChild(createCardElement(card));
                } else {
                    slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                }
                fragment.appendChild(slot);
            }
            container.innerHTML = '';
            container.appendChild(fragment);
        }
    }

    // 手牌渲染
    function renderHand() {
        const my = getCurrentUser();
        if (!my) return;
        const container = document.getElementById('hand-container');
        if (!container) return;

        const fragment = document.createDocumentFragment();
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', i, el));
                fragment.appendChild(el);
            }
        });

        container.innerHTML = '';
        container.appendChild(fragment);

        requestAnimationFrame(() => {
            const countEl = document.getElementById('hand-count');
            if (countEl) countEl.textContent = my.hand.filter(c => c).length;
        });
    }

    // 商店渲染
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

        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', i, el));
                fragment.appendChild(el);
            }
        });
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // 渲染调度（帧锁，避免重复渲染）
    function scheduleRender(renderType = 'all') {
        if (isFrameLocked) return;
        isFrameLocked = true;

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

            // 非核心数值更新
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
                isFrameLocked = false;
            });
        });
    }

    // 全量刷新
    function refreshAllUI() {
        scheduleRender('all');
    }

    // 仅刷新商店
    function refreshShopOnlyUI() {
        scheduleRender('shop');
    }

    // 仅刷新手牌+棋盘
    function refreshHandAndBoardUI() {
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

    // ============== 【修复版拖拽核心】保证操作100%正确，同时流畅不卡顿 ==============
    function onDragStart(e, type, index, element) {
        const state = getGameState();
        if (!state || state.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        // 一次性获取数值，拖拽中不再查询DOM
        const clientX = e.clientX;
        const clientY = e.clientY;
        const cardRect = element.getBoundingClientRect();
        const cardWidth = cardRect.width;
        const cardHeight = cardRect.height;

        // 预缓存商店区域
        const shopArea = document.querySelector('.shop-area');
        const shopAreaRect = shopArea ? shopArea.getBoundingClientRect() : null;

        // 克隆元素GPU加速，零重排
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

        // 拖拽状态只存索引和类型，不存卡牌数据，避免和后端不同步
        dragState = {
            active: true,
            type,
            index,
            sourceElement: element,
            cloneElement: clone,
            cardHalfWidth: cardWidth / 2,
            cardHalfHeight: cardHeight / 2,
            shopAreaRect,
            currentX: clientX,
            currentY: clientY
        };

        // 【关键】触摸事件加passive: true，解决手机端触摸延迟
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

        // GPU加速更新位置，零重排
        dragState.cloneElement.style.transform = `translate3d(${clientX - dragState.cardHalfWidth}px, ${clientY - dragState.cardHalfHeight}px, 0)`;

        // 商店高亮检测
        if ((dragState.type === 'hand' || dragState.type === 'board') && dragState.shopAreaRect) {
            const isOverShop = clientX >= dragState.shopAreaRect.left && clientX <= dragState.shopAreaRect.right &&
                               clientY >= dragState.shopAreaRect.top && clientY <= dragState.shopAreaRect.bottom;
            document.querySelector('.shop-area')?.classList.toggle('drop-target', isOverShop);
        }
    }

    function onDragEnd(e) {
        if (!dragState.active) return;

        // 1. 瞬间清理视觉元素
        const { type, index, sourceElement, cloneElement, currentX, currentY } = dragState;
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

        // 5. 执行业务逻辑（拿最新的状态，保证数据正确）
        if (dropResult) {
            executeDropAction(type, index, dropResult);
        }
    }

    function getDropTarget(element) {
        let el = element;
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

    // ============== 【核心修复】业务逻辑：先等后端成功，再更新UI，杜绝假成功 ==============
    async function executeDropAction(type, index, dropResult) {
        const my = getCurrentUser();
        if (!my) return;

        // 手牌操作
        if (type === 'hand') {
            const card = my.hand[index];
            if (!card) return;

            if (dropResult.zone === 'board') {
                await handleHandToBoard(index, dropResult.index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('hand', index);
            }
        }
        // 棋盘操作
        else if (type === 'board') {
            const card = my.board[index];
            if (!card) return;

            if (dropResult.zone === 'board') {
                await handleBoardSwap(index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleBoardToHand(index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('board', index);
            }
        }
        // 商店操作
        else if (type === 'shop') {
            const card = my.shopCards[index];
            if (!card) return;

            if (dropResult.zone === 'board') {
                await handleShopToBoard(card, index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleShopToHand(card, index);
            }
        }
    }

    // 手牌→棋盘
    async function handleHandToBoard(handIdx, boardIdx) {
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (success) {
            refreshHandAndBoardUI();
            log(`✅ 放置成功`);
        } else {
            toast('放置失败', true);
        }
    }

    // 棋盘交换
    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const success = await window.YYCardBattle.swapBoardAction(idxA, idxB);
        if (success) {
            renderMyBoard();
            log(`✅ 交换成功`);
        } else {
            toast('交换失败', true);
        }
    }

    // 棋盘→手牌
    async function handleBoardToHand(boardIdx) {
        const success = await window.YYCardBattle.boardToHandAction(boardIdx);
        if (success) {
            refreshHandAndBoardUI();
            log(`✅ 收回手牌成功`);
        } else {
            toast('手牌已满', true);
        }
    }

    // 出售卡牌
    async function handleSell(type, index) {
        const success = await window.YYCardBattle.sellCardAction(type, index);
        if (success) {
            refreshHandAndBoardUI();
            toast('出售成功');
            log(`💰 出售成功`);
        } else {
            toast('出售失败', true);
        }
    }

    // 商店→棋盘（购买并放置）
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const my = getCurrentUser();
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
            refreshHandAndBoardUI();
            renderShop();
            log(`✅ 购买并放置 ${card.name}`);
        } else {
            toast('购买放置失败', true);
        }
    }

    // 商店→手牌（购买）
    async function handleShopToHand(card, shopIdx) {
        const my = getCurrentUser();
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

        const success = await window.YYCardBattle.buyCardAction(card, shopIdx);
        if (success) {
            refreshHandAndBoardUI();
            renderShop();
            log(`✅ 购买 ${card.name} 成功`);
        } else {
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

        // 点击立刻给加载反馈，不等后端
        const shopContainer = document.getElementById('shop-container');
        if (shopContainer) shopContainer.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">刷新中...</div>';

        const success = await window.YYCardBattle.refreshShopAction();
        if (success) {
            refreshShopOnlyUI();
            log(`🔄 商店已刷新`);
        } else {
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
            refreshAllUI();
            log(`📈 购买经验成功`);
        } else {
            toast('升级失败', true);
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
        // 阶段切换全量刷新
        refreshAllUI();
    }

    // ============== 事件绑定 ==============
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // ============== CSS性能优化注入 ==============
    function injectStyles() {
        const styleId = 'yycard-fix-optimize';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* GPU渲染加速，不影响数据 */
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
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动【操作零失败修复版】');
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

console.log('✅ shop.js 加载完成【操作零失败修复版】');
