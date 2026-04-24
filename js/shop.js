// ==================== 商店与交互系统（拖拽彻底修复 + 阶段日志） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    const domCache = {};
    let isRefreshingShop = false;

    // 拖拽状态（简化）
    let dragState = {
        active: false,
        type: null,          // 'hand', 'board', 'shop'
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    };

    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

    // ----- 工具函数 -----
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        if (updatedPlayer.gold !== undefined) target.gold = updatedPlayer.gold;
        if (updatedPlayer.exp !== undefined) target.exp = updatedPlayer.exp;
        if (updatedPlayer.shopLevel !== undefined) target.shopLevel = updatedPlayer.shopLevel;
        if (updatedPlayer.health !== undefined) target.health = updatedPlayer.health;
        if (updatedPlayer.shopCards !== undefined) target.shopCards = updatedPlayer.shopCards;
        if (updatedPlayer.isBot !== undefined) target.isBot = updatedPlayer.isBot;
        if (updatedPlayer.isEliminated !== undefined) target.isEliminated = updatedPlayer.isEliminated;
        if (updatedPlayer.isReady !== undefined) target.isReady = updatedPlayer.isReady;
    }

    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) updateBuyExpButtonState();
        if (updatedPlayer.shopLevel !== undefined) {
            const levelEl = document.getElementById('shop-level');
            if (levelEl) levelEl.textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.health !== undefined) {
            const healthEl = document.getElementById('my-health');
            if (healthEl) healthEl.textContent = updatedPlayer.health;
            const healthTop = document.getElementById('my-health-top');
            if (healthTop) healthTop.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopCards !== undefined) renderShop();
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

    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }

    // ★ 可靠的阶段获取，附带控制台提示
    function getCurrentPhaseFromBattle() {
        try {
            const battle = window.YYCardBattle;
            if (battle?.getCurrentPhaseInfo) {
                const info = battle.getCurrentPhaseInfo();
                console.log('[Shop] 实时阶段计算:', info.phase);
                return info.phase;
            }
        } catch (e) {}
        // 回退
        const gs = getGameState();
        const fallback = gs ? gs.phase : 'prepare';
        console.warn('[Shop] 使用缓存的 gameState.phase:', fallback);
        return fallback;
    }

    function getSupabaseClient() {
        return window.supabase;
    }

    async function getAccessToken() {
        if (cachedAccessToken) return cachedAccessToken;
        const supabaseClient = getSupabaseClient();
        const { data: { session } } = await supabaseClient.auth.getSession();
        cachedAccessToken = session?.access_token;
        clearTimeout(tokenCacheTimer);
        tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
        return cachedAccessToken;
    }

    // ========== 棋盘渲染 ==========
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        const boardEl = document.getElementById('my-board');
        if (boardEl) boardEl.setAttribute('data-player-id', userId);
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
            const aliveHumans = Object.entries(gameState.players).filter(([id, p]) => id !== userId && !p.isBot && p.health > 0 && !p.isEliminated);
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        if (!oppId) {
            const aliveAny = Object.entries(gameState.players).find(([id, p]) => id !== userId && p.health > 0 && !p.isEliminated);
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
            const boardEl = document.getElementById('enemy-board');
            if (boardEl) boardEl.setAttribute('data-player-id', oppId);
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
                // 绑定拖拽：同时监听 mouse 和 touch
                el.addEventListener('mousedown', (e) => onDragStart(e, 'hand', card, i, el));
                el.addEventListener('touchstart', (e) => onDragStart(e, 'hand', card, i, el), { passive: false });
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
                el.addEventListener('mousedown', (e) => onDragStart(e, 'shop', card, i, el));
                el.addEventListener('touchstart', (e) => onDragStart(e, 'shop', card, i, el), { passive: false });
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
    }

    function refreshAllUI() {
        if (window.YYCardInspector?.cleanupAllRemnants) window.YYCardInspector.cleanupAllRemnants();
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
        const shouldDisable = my.isBot || !isMyTurn || isMaxLevel || isRefreshingShop;

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
        const cont = domCache[containerId] || document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            let dataIndex;
            if (isSelf) dataIndex = i;
            else dataIndex = i < 3 ? i + 3 : i - 3;
            slot.setAttribute('data-board-index', dataIndex);
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('mousedown', (e) => onDragStart(e, 'board', c, i, el));
                    el.addEventListener('touchstart', (e) => onDragStart(e, 'board', c, i, el), { passive: false });
                } else {
                    el.setAttribute('data-board-index', dataIndex);
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
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        d.innerHTML = `
            <div class="card-icon"><img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats"><span class="card-atk">⚔️${card.atk}</span><span class="card-hp">🛡️${card.hp}</span></div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 全新拖拽系统（仅松手执行） ==========
    function onDragStart(e, type, card, index, element) {
        const phase = getCurrentPhaseFromBattle();
        console.log('[Shop] 拖拽开始，当前阶段:', phase);
        if (phase !== 'prepare' || isRefreshingShop) {
            toast('现在不能操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // 获取起始坐标（兼容鼠标和触摸）
        const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

        // 克隆元素
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed; z-index: 99999; left: 0; top: 0;
            width: ${element.offsetWidth}px; height: ${element.offsetHeight}px;
            opacity: 0.85; transform: translate(${clientX - element.offsetWidth/2}px, ${clientY - element.offsetHeight/2}px) scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5); pointer-events: none; transition: none; will-change: transform;
        `;
        document.body.appendChild(clone);

        // 原位置完全隐藏（visibility, 不占位但看不见）
        element.style.visibility = 'hidden';

        dragState = {
            active: true,
            type, card, index,
            sourceElement: element,
            cloneElement: clone,
            startX: clientX, startY: clientY,
            currentX: clientX, currentY: clientY
        };

        // 全局移动和释放监听
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        dragState.currentX = clientX;
        dragState.currentY = clientY;

        const clone = dragState.cloneElement;
        clone.style.transform = `translate(${clientX - clone.offsetWidth/2}px, ${clientY - clone.offsetHeight/2}px) scale(1.05)`;

        // 视觉反馈：高亮商店区域
        const shopContainer = domCache.shopContainer || document.getElementById('shop-container');
        if (shopContainer) {
            const shopArea = shopContainer.closest('.shop-area');
            if (shopArea) {
                const rect = shopArea.getBoundingClientRect();
                const isOver = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
                shopArea.classList.toggle('drop-target', isOver);
            }
        }
    }

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, card, index, sourceElement, cloneElement, currentX, currentY } = dragState;

        // 清理
        cloneElement.remove();
        sourceElement.style.visibility = ''; // 恢复可见
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('touchcancel', onDragEnd);

        dragState.active = false;

        // 判断落点
        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) return;

        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }
    }

    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            if (el.id === 'hand-container' || el.closest('#hand-container')) return { zone: 'hand' };
            if (el.id === 'shop-container' || el.closest('#shop-container')) return { zone: 'shop' };
            el = el.parentElement;
        }
        return null;
    }

    async function executeDropAction(type, index, card, dropResult) {
        if (type === 'hand') {
            if (dropResult.zone === 'board') await handleHandToBoard(index, dropResult.index);
            else if (dropResult.zone === 'shop') await handleSell('hand', index);
        } else if (type === 'board') {
            if (dropResult.zone === 'board') await handleBoardSwap(index, dropResult.index);
            else if (dropResult.zone === 'hand') await handleBoardToHand(index);
            else if (dropResult.zone === 'shop') await handleSell('board', index);
        } else if (type === 'shop') {
            if (dropResult.zone === 'board') await handleShopToBoard(card, index, dropResult.index);
            else if (dropResult.zone === 'hand') await handleShopToHand(card, index);
        }
    }

    // ==================== 业务操作（保持不变） ====================
    async function handleHandToBoard(handIdx, boardIdx) { /* 完全相同，为节省篇幅不再重复，实际需保留 */ }
    async function handleShopToBoard(card, shopIdx, boardIdx) { /* ... */ }
    async function handleShopToHand(card, shopIdx) { /* ... */ }
    async function handleBoardSwap(idxA, idxB) { /* ... */ }
    async function handleBoardToHand(boardIdx) { /* ... */ }
    async function handleSell(type, index) { /* ... */ }
    async function buyExpAction() { /* ... */ }
    async function refreshShopAction() { /* ... */ }

    // 计时器与阶段
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
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; will-change: transform; }
            .card-drag-clone { pointer-events: none !important; will-change: transform; }
            .shop-area.drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { pointer-events: none !important; opacity: 0.6; }
            .card-slot, .card { contain: layout style paint; }
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

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        toast
    };
})();
