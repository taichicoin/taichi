// ==================== 商店与交互系统（极致流畅优化版 | 功能无改动） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    // 缓存token 减少重复请求
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    // 缓存常用DOM节点 避免反复查询
    const domCache = {};
    // 防抖锁 防止重复点击
    let actionLock = false;

    // 拖拽状态
    let dragState = {
        active: false,
        type: null,         // 'hand', 'board', 'shop'
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
        isOverShop: false
    };

    // 【极致优化】拖拽移动用requestAnimationFrame+节流，确保60帧流畅
    function throttleRAF(func) {
        let isRunning = false;
        return function(...args) {
            if (isRunning) return;
            isRunning = true;
            requestAnimationFrame(() => {
                func.apply(this, args);
                isRunning = false;
            });
        };
    }

    // 【防抖】防止按钮重复点击
    function debounceAction(func, delay = 800) {
        return async function(...args) {
            if (actionLock) {
                toast('操作太频繁啦', true);
                return;
            }
            actionLock = true;
            try {
                await func.apply(this, args);
            } finally {
                setTimeout(() => {
                    actionLock = false;
                }, delay);
            }
        };
    }

    // 后端函数 URL 完全保留无改动
    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

    // Toast提示 完全保留
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

    // ===== 辅助函数 完全保留逻辑，无改动 =====
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState() || null;
    }

    function getCurrentRoomId() {
        return window.YYCardBattle?.getCurrentRoomId?.() || window._currentRoomId || null;
    }

    function getSupabaseClient() {
        return window.supabase;
    }

    // 缓存token 获取 逻辑无改动
    async function getAccessToken() {
        if (cachedAccessToken) return cachedAccessToken;
        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            cachedAccessToken = session?.access_token;
            clearTimeout(tokenCacheTimer);
            tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
            return cachedAccessToken;
        } catch (e) {
            toast('获取登录状态失败', true);
            return null;
        }
    }

    // 通用：强制刷新UI 逻辑无改动，优化渲染时机
    async function syncFromBackend() {
        requestAnimationFrame(async () => {
            if (window.YYCardBattle?.forceRefreshState) {
                await window.YYCardBattle.forceRefreshState();
            } else {
                await window.YYCardBattle?.updateGameState();
            }
            refreshAllUI();
        });
    }

    // 渲染函数 逻辑完全保留，优化DOM操作性能
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
        let oppId = null;

        if (gameState.phase === 'battle' && gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        
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
            renderBoard('enemy-board', enemyDisplayBoard, false);
        }
    }

    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = domCache.handContainer || document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el), { passive: false });
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = domCache.shopContainer || document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
            return;
        }
        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el), { passive: false });
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
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
                (domCache.myHealth || document.getElementById('my-health')).textContent = my.health;
                (domCache.myGold || document.getElementById('my-gold')).textContent = my.gold;
                (domCache.shopLevel || document.getElementById('shop-level')).textContent = my.shopLevel;
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            (domCache.roundNum || document.getElementById('round-num')).textContent = gameState.round;
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
        const shouldDisable = my.isBot || !isMyTurn || isMaxLevel || actionLock;

        let expNeeded = 0;
        if (!isMaxLevel) {
            const exp = my.exp;
            if (exp < 4) expNeeded = 4 - exp;
            else if (exp < 12) expNeeded = 12 - exp;
            else if (exp < 26) expNeeded = 26 - exp;
            else if (exp < 46) expNeeded = 46 - exp;
        }

        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (isMaxLevel) {
                    btn.textContent = '📈 已满级';
                } else {
                    btn.textContent = `📈 升级 (${expNeeded}💰)`;
                }
                btn.disabled = shouldDisable || (expNeeded > my.gold);
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = domCache[containerId] || document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            slot.style.touchAction = 'none';
            slot.style.userSelect = 'none';
            
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el), { passive: false });
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            fragment.appendChild(slot);
        }
        cont.appendChild(fragment);
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        // 移动端触摸优化
        d.style.touchAction = 'none';
        d.style.userSelect = 'none';
        d.style.webkitUserSelect = 'none';
        d.draggable = false;

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

    // ==================== 拖拽核心【极致流畅优化版，逻辑完全不变】 ====================
    function onDragStart(e, type, card, index, element) {
        // 阶段校验 逻辑完全不变
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }
        if (currentPhase !== 'prepare') {
            toast('仅准备阶段可操作', true);
            return;
        }
        if (actionLock) return;

        e.preventDefault();
        e.stopPropagation();
        
        // 强制捕获指针，防止移动端拖拽中断
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;
        const rect = element.getBoundingClientRect();

        // 【核心优化】计算拖拽偏移量，用transform代替left/top，GPU加速
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;

        // 拖拽克隆元素优化，用transform定位
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 999999;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            opacity: 0.85;
            transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
            will-change: transform;
            transform-origin: center center;
        `;
        document.body.appendChild(clone);

        element.style.opacity = '0.3';

        // 重置拖拽状态
        dragState = {
            active: true,
            type,
            card,
            index,
            sourceElement: element,
            cloneElement: clone,
            startX: clientX,
            startY: clientY,
            offsetX,
            offsetY,
            isOverShop: false
        };

        // 绑定拖拽事件，用RAF优化
        document.addEventListener('pointermove', throttledDragMove, { passive: false, capture: true });
        document.addEventListener('pointerup', onDragEnd, { capture: true });
        document.addEventListener('pointercancel', onDragEnd, { capture: true });
    }

    // 【极致优化】拖拽移动用RAF，transform GPU加速，告别卡顿
    const throttledDragMove = throttleRAF(function(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 【核心优化】用transform代替left/top，不触发重排，GPU加速
        const translateX = clientX - dragState.offsetX;
        const translateY = clientY - dragState.offsetY;
        dragState.cloneElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(1.05)`;

        // 出售高亮优化：仅在进入/离开商店时修改class，不每次移动都改
        const shopArea = document.querySelector('.shop-area');
        if (shopArea && (dragState.type === 'hand' || dragState.type === 'board')) {
            const rect = shopArea.getBoundingClientRect();
            const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                               clientY >= rect.top && clientY <= rect.bottom;
            if (isOverShop !== dragState.isOverShop) {
                shopArea.classList.toggle('drop-target', isOverShop);
                dragState.isOverShop = isOverShop;
            }
        }
    });

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, card, index, sourceElement, cloneElement, startX, startY } = dragState;
        const endX = e.clientX;
        const endY = e.clientY;

        // 清理DOM
        cloneElement.remove();
        sourceElement.style.opacity = '';
        sourceElement.releasePointerCapture?.(e.pointerId);
        
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) {
            shopArea.classList.remove('drop-target');
            dragState.isOverShop = false;
        }

        // 清理事件
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 点击判定：拖拽距离过小视为点击，不执行落点逻辑
        const dragDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        if (dragDistance < 10) {
            dragState.active = false;
            return;
        }

        // 获取落点
        const targetElement = document.elementFromPoint(endX, endY);
        if (!targetElement) {
            dragState.active = false;
            return;
        }

        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }

        dragState.active = false;
    }

    // 落点识别 逻辑完全不变
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            // 棋盘格子
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            // 手牌区
            if (el.id === 'hand-container' || el.closest('#hand-container')) {
                return { zone: 'hand' };
            }
            // 商店区
            if (el.id === 'shop-container' || el.closest('#shop-container')) {
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

    // ===== 业务操作【逻辑100%完全保留，仅增加防抖+移除日志】 =====
    const handleHandToBoard = debounceAction(async (handIdx, boardIdx) => {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(PLACE_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    handIndex: handIdx,
                    boardIndex: boardIdx
                }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '放置失败', true);
                return;
            }
            await syncFromBackend();
            toast(data.exchanged ? '交换成功' : '放置成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const handleShopToBoard = debounceAction(async (card, shopIdx, boardIdx) => {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    shopIndex: shopIdx,
                    targetBoardIndex: boardIdx
                }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '购买失败', true);
                return;
            }
            await syncFromBackend();
            toast(data.exchanged ? '购买并交换成功' : '购买成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const handleShopToHand = debounceAction(async (card, shopIdx) => {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    shopIndex: shopIdx
                }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '购买失败', true);
                return;
            }
            await syncFromBackend();
            toast('购买成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const handleBoardSwap = debounceAction(async (idxA, idxB) => {
        if (idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(SWAP_BOARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    indexA: idxA,
                    indexB: idxB
                }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '交换失败', true);
                return;
            }
            await syncFromBackend();
            toast('交换成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const handleBoardToHand = debounceAction(async (boardIdx) => {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BOARD_TO_HAND_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId, boardIndex: boardIdx }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '移回手牌失败', true);
                return;
            }
            await syncFromBackend();
            toast('已移回手牌');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const handleSell = debounceAction(async (type, index) => {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(SELL_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId, type, index }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '出售失败', true);
                return;
            }
            await syncFromBackend();
            toast('出售成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const buyExpAction = debounceAction(async () => {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BUY_EXP_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId }),
                keepalive: true
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '升级失败', true);
                return;
            }
            await syncFromBackend();
            toast('升级成功');
        } catch (err) {
            toast('网络错误', true);
        }
    });

    const refreshShopAction = debounceAction(async () => {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            toast('只能在准备阶段刷新', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        
        if (!roomId) { toast('房间信息缺失', true); return; }
        if (!userId) { toast('用户信息缺失', true); return; }

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(REFRESH_SHOP_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId }),
                keepalive: true
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '刷新失败', true);
                return;
            }

            await syncFromBackend();
            toast('刷新成功');
        } catch (err) {
            toast('网络错误，刷新失败', true);
        }
    });

    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') { timerEl.textContent = `⏳ ${seconds}`; return; }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) battleTimerEl.textContent = (phase === 'battle') ? seconds : '00:00';
    }

    function setPhase(phase) {
        currentPhase = phase;
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
    }

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // 注入优化后的CSS，无冗余
    function injectStyles() {
        const styleId = 'yycard-shop-optimize';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { 
                touch-action: none; 
                user-select: none; 
                -webkit-user-select: none; 
                -webkit-touch-callout: none; 
                will-change: transform;
                -webkit-tap-highlight-color: transparent;
                transform: translateZ(0);
            }
            .card * {
                pointer-events: none;
            }
            .card-slot {
                touch-action: none;
                user-select: none;
            }
            .card-drag-clone { 
                pointer-events: none !important; 
                will-change: transform; 
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
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
            .card-slot, .card { 
                contain: layout style paint; 
            }
        `;
        document.head.appendChild(style);
    }

    function cacheDoms() {
        domCache.handContainer = document.getElementById('hand-container');
        domCache.shopContainer = document.getElementById('shop-container');
        domCache.myBoard = document.getElementById('my-board');
        domCache.enemyBoard = document.getElementById('enemy-board');
        domCache.myHealth = document.getElementById('my-health');
        domCache.myGold = document.getElementById('my-gold');
        domCache.shopLevel = document.getElementById('shop-level');
        domCache.roundNum = document.getElementById('round-num');
    }

    function init() {
        injectStyles();
        cacheDoms();
        bindUIEvents();
        refreshAllUI();
    }

    // 对外暴露的方法完全不变，确保和原有代码100%兼容
    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        toast
    };
})();

console.log('✅ shop.js 加载完成（极致流畅优化版）');
