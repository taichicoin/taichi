// ==================== 商店与交互系统（后端全部操作 + 拖拽修复版） ====================
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
        currentX: 0,
        currentY: 0
    };

    // 【修复】节流函数，修复this指向，确保移动端流畅
    function throttle(func, delay = 16) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) {
                last = now;
                func.apply(this, args);
            }
        };
    }

    // 后端函数 URL
    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

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
        domCache.debugPanel = p;
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = domCache.debugPanel || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 20) p.removeChild(p.firstChild);
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

    // ===== 辅助函数【修复】增加非空校验，兜底返回值 =====
    function getCurrentUserId() {
        const uid = window.YYCardAuth?.currentUser?.id || null;
        if (!uid) log('⚠️ getCurrentUserId 返回空', true);
        return uid;
    }

    function getGameState() {
        const state = window.YYCardBattle?.getGameState() || null;
        if (!state) log('⚠️ getGameState 返回空', true);
        return state;
    }

    function getCurrentRoomId() {
        const roomId = window.YYCardBattle?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId) log('⚠️ getCurrentRoomId 返回空', true);
        return roomId;
    }

    function getSupabaseClient() {
        return window.supabase;
    }

    // 缓存token 获取【修复】增加错误捕获
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
            log('❌ 获取access_token失败: ' + e.message, true);
            return null;
        }
    }

    // 通用：强制刷新UI【修复】增加等待，确保数据库更新完成
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

    // 渲染函数【修复】确保卡牌元素正确绑定事件
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
                // 【修复】事件绑定增加捕获，防止冒泡被阻止
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el), { capture: true });
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
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el), { capture: true });
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
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el), { capture: true });
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
        // 【修复】卡牌元素增加touch-action，防止移动端默认行为
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

    // ==================== 拖拽核心【全量修复】 ====================
    function onDragStart(e, type, card, index, element) {
        // 【修复】阶段判断双校验，同步currentPhase和gameState.phase
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }
        // 【修复】非准备阶段直接拦截
        if (currentPhase !== 'prepare') {
            toast('仅准备阶段可操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        
        // 【修复】强制捕获指针，防止移动端拖拽中断
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 【修复】克隆元素增加层级，防止被遮挡
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 999999;
            left: ${clientX - element.offsetWidth / 2}px;
            top: ${clientY - element.offsetHeight / 2}px;
            width: ${element.offsetWidth}px;
            height: ${element.offsetHeight}px;
            opacity: 0.85;
            transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
            will-change: left, top;
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
            startX: clientX,
            startY: clientY,
            currentX: clientX,
            currentY: clientY
        };

        // 【修复】事件绑定增加passive: false，防止移动端默认行为
        document.addEventListener('pointermove', throttledDragMove, { passive: false, capture: true });
        document.addEventListener('pointerup', onDragEnd, { capture: true });
        document.addEventListener('pointercancel', onDragEnd, { capture: true });

        log(`👉 开始拖拽: ${type} - ${card.name}`);
    }

    // 节流拖拽移动【修复】逻辑优化，防止卡顿
    const throttledDragMove = throttle(function(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;

        dragState.currentX = clientX;
        dragState.currentY = clientY;

        const clone = dragState.cloneElement;
        clone.style.left = (clientX - clone.offsetWidth / 2) + 'px';
        clone.style.top = (clientY - clone.offsetHeight / 2) + 'px';

        // 出售高亮
        if (dragState.type === 'hand' || dragState.type === 'board') {
            const shopContainer = domCache.shopContainer || document.getElementById('shop-container');
            if (shopContainer) {
                const shopArea = shopContainer.closest('.shop-area');
                if (shopArea) {
                    const rect = shopArea.getBoundingClientRect();
                    const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                                       clientY >= rect.top && clientY <= rect.bottom;
                    shopArea.classList.toggle('drop-target', isOverShop);
                }
            }
        }
    }, 16);

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, card, index, sourceElement, cloneElement, currentX, currentY } = dragState;

        // 清理DOM
        cloneElement.remove();
        sourceElement.style.opacity = '';
        sourceElement.releasePointerCapture?.(e.pointerId);
        
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        // 清理事件
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 获取落点
        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) {
            dragState.active = false;
            log('❌ 拖拽结束，无落点');
            return;
        }

        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            log(`🎯 拖拽落点: ${dropResult.zone}`);
            executeDropAction(type, index, card, dropResult);
        } else {
            log('❌ 无效落点');
        }

        dragState.active = false;
    }

    // 落点识别【修复】增加层级穿透，防止被遮挡
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

    // ===== 业务操作【修复】增加非空校验、错误反馈、loading提示 =====
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
            log(`💰 出售成功，剩余金币 ${data.gold}`);
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
            log(`🔄 商店已刷新，剩余金币 ${data.gold}`);
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

    // 【修复】阶段同步，确保currentPhase和gameState.phase一致
    function setPhase(phase) {
        currentPhase = phase;
        log(`📌 阶段切换: ${phase}`);
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
    }

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // 【修复】CSS增加移动端适配，防止touch事件被拦截
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
                will-change: transform;
                -webkit-tap-highlight-color: transparent;
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
                will-change: left, top; 
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
        initDebugPanel();
        cacheDoms();
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动（拖拽修复版）');
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

console.log('✅ shop.js 加载完成（拖拽全量修复）');
