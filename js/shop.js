// ==================== 商店与交互系统（极致流畅无日志版） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    // 预缓存token，减少重复请求
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    // 全量DOM预缓存，避免重复查询
    const domCache = {};

    // 拖拽状态
    let dragState = {
        active: false,
        type: null,
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
        currentTranslateX: 0,
        currentTranslateY: 0,
        rafId: null
    };

    // 预缓存区域边界，避免重复计算
    const areaBounds = {
        shop: null,
        hand: null,
        board: null
    };

    // 后端函数 URL
    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

    // Toast 提示（唯一保留的用户提示）
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

    // ===== 核心辅助函数 =====
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

    // Token获取与缓存
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
            console.error('获取access_token失败', e);
            return null;
        }
    }

    // 同步后端状态并刷新UI
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

    // 预计算区域边界，拖拽时直接复用
    function updateAreaBounds() {
        if (domCache.shopArea) areaBounds.shop = domCache.shopArea.getBoundingClientRect();
        if (domCache.handContainer) areaBounds.hand = domCache.handContainer.getBoundingClientRect();
        if (domCache.myBoard) areaBounds.board = domCache.myBoard.getBoundingClientRect();
    }

    // ===== UI渲染函数 =====
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
        
        const container = domCache.handContainer;
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
        
        const countEl = domCache.handCount;
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        
        const container = domCache.shopContainer;
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
                if (domCache.myHealth) domCache.myHealth.textContent = my.health;
                if (domCache.myGold) domCache.myGold.textContent = my.gold;
                if (domCache.shopLevel) domCache.shopLevel.textContent = my.shopLevel;
                if (domCache.myHealthTop) domCache.myHealthTop.textContent = my.health;
            }
            if (domCache.roundNum) domCache.roundNum.textContent = gameState.round;
            if (domCache.roundNumTop) domCache.roundNumTop.textContent = gameState.round;
            updateBuyExpButtonState();
        }
        // 刷新UI后更新区域边界
        updateAreaBounds();
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
                btn.textContent = isMaxLevel ? '📈 已满级' : `📈 升级 (${expNeeded}💰)`;
                btn.disabled = shouldDisable || (expNeeded > my.gold);
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = domCache[containerId];
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            slot.style.touchAction = 'none';
            
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
        d.style.touchAction = 'none';
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

    // ==================== 拖拽核心（极致流畅重构版） ====================
    function onDragStart(e) {
        // 阶段拦截
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('仅准备阶段可操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        
        // 提取拖拽参数
        const type = e.currentTarget.getAttribute('data-card-type');
        const index = parseInt(e.currentTarget.getAttribute(`data-${type}-index`));
        const card = getGameState()?.players?.[getCurrentUserId()]?.[type === 'hand' ? 'hand' : type === 'board' ? 'board' : 'shopCards']?.[index];
        const element = e.currentTarget;

        if (!type || !card || index < 0 || !element) return;

        // 强制捕获指针，防止移动端拖拽中断
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;
        const rect = element.getBoundingClientRect();

        // 计算偏移量，确保拖拽点和鼠标位置一致
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;

        // GPU加速克隆元素，用transform替代left/top
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
            transform-origin: center;
        `;
        document.body.appendChild(clone);

        // 原元素半透明
        element.style.opacity = '0.3';

        // 更新拖拽状态
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
            currentTranslateX: 0,
            currentTranslateY: 0,
            rafId: null
        };

        // 绑定事件
        document.addEventListener('pointermove', onDragMove, { passive: false });
        document.addEventListener('pointerup', onDragEnd, { passive: false });
        document.addEventListener('pointercancel', onDragEnd, { passive: false });

        // 拖拽开始时更新区域边界
        updateAreaBounds();
    }

    // 拖拽移动（RAF优化，GPU加速）
    function onDragMove(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 计算目标位置
        const targetLeft = clientX - dragState.offsetX;
        const targetTop = clientY - dragState.offsetY;

        // 取消上一帧的RAF
        if (dragState.rafId) cancelAnimationFrame(dragState.rafId);

        // 用RAF更新位置，确保和浏览器刷新同步
        dragState.rafId = requestAnimationFrame(() => {
            if (!dragState.cloneElement) return;
            // 用transform实现GPU加速，不触发重排
            dragState.cloneElement.style.transform = `translate(${targetLeft - dragState.cloneElement.offsetLeft}px, ${targetTop - dragState.cloneElement.offsetTop}px) scale(1.05)`;
        });

        // 出售高亮（仅计算，不操作DOM）
        if (dragState.type === 'hand' || dragState.type === 'board') {
            const isOverShop = clientX >= areaBounds.shop.left && clientX <= areaBounds.shop.right &&
                               clientY >= areaBounds.shop.top && clientY <= areaBounds.shop.bottom;
            domCache.shopArea.classList.toggle('drop-target', isOverShop);
        }
    }

    // 拖拽结束
    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, index, card, sourceElement, cloneElement, rafId } = dragState;
        const clientX = e.clientX;
        const clientY = e.clientY;

        // 清理RAF
        if (rafId) cancelAnimationFrame(rafId);

        // 清理DOM
        cloneElement.remove();
        sourceElement.style.opacity = '';
        sourceElement.releasePointerCapture?.(e.pointerId);
        domCache.shopArea.classList.remove('drop-target');

        // 清理事件
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 识别落点
        const targetElement = document.elementFromPoint(clientX, clientY);
        const dropResult = targetElement ? getDropTarget(targetElement) : null;

        // 执行落点动作
        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }

        // 重置拖拽状态
        dragState = {
            active: false,
            type: null,
            card: null,
            index: -1,
            sourceElement: null,
            cloneElement: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
            currentTranslateX: 0,
            currentTranslateY: 0,
            rafId: null
        };
    }

    // 落点识别（优化版，减少DOM遍历）
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            // 棋盘格子
            if (el.classList.contains('card-slot')) {
                const boardId = el.closest('.board')?.id;
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

    // 执行拖拽动作
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

    // ===== 业务操作函数（功能100%保留） =====
    async function handleHandToBoard(handIdx, boardIdx) {
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
                body: JSON.stringify({ roomId, userId, handIndex: handIdx, boardIndex: boardIdx }),
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
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
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx }),
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function handleShopToHand(card, shopIdx) {
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
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx }),
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function handleBoardSwap(idxA, idxB) {
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
                body: JSON.stringify({ roomId, userId, indexA: idxA, indexB: idxB }),
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function handleBoardToHand(boardIdx) {
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function handleSell(type, index) {
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function buyExpAction() {
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
            console.error(err);
            toast('网络错误', true);
        }
    }

    async function refreshShopAction() {
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
            console.error(err);
            toast('网络错误，刷新失败', true);
        }
    }

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

    // 性能优化CSS注入
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
                contain: strict;
            }
            .card * {
                pointer-events: none;
            }
            .card-slot {
                touch-action: none;
                user-select: none;
                contain: layout style paint;
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
        `;
        document.head.appendChild(style);
    }

    // DOM预缓存
    function cacheDoms() {
        domCache.handContainer = document.getElementById('hand-container');
        domCache.shopContainer = document.getElementById('shop-container');
        domCache.myBoard = document.getElementById('my-board');
        domCache.enemyBoard = document.getElementById('enemy-board');
        domCache.myHealth = document.getElementById('my-health');
        domCache.myGold = document.getElementById('my-gold');
        domCache.shopLevel = document.getElementById('shop-level');
        domCache.roundNum = document.getElementById('round-num');
        domCache.handCount = document.getElementById('hand-count');
        domCache.myHealthTop = document.getElementById('my-health-top');
        domCache.roundNumTop = document.getElementById('round-num-top');
        domCache.shopArea = document.querySelector('.shop-area');
    }

    // 初始化
    function init() {
        injectStyles();
        cacheDoms();
        bindUIEvents();
        refreshAllUI();
    }

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        toast
    };
})();

console.log('✅ shop.js 加载完成（极致流畅优化版）');
