// ==================== 商店与交互系统（刷新不显示卡牌终极修复版） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    // 取消永久DOM缓存，改为临时缓存，每次渲染前校验有效性
    let domCache = {};
    // 新增：刷新状态锁，防止实时推送覆盖本地状态
    let isRefreshingShop = false;
    // 新增：接口超时时间（10秒）
    const FETCH_TIMEOUT = 10000;

    let dragState = {
        active: false,
        type: null,
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    };

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

    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

    // ========== 【修复】全局游戏状态同步工具，解决快照引用失效问题 ==========
    function getCurrentUserState() {
        const gameState = window.YYCardBattle?.getGameState?.();
        const userId = window.YYCardAuth?.currentUser?.id || null;
        if (!gameState || !userId || !gameState.players?.[userId]) {
            return { gameState: null, userId: null, my: null };
        }
        return { gameState, userId, my: gameState.players[userId] };
    }

    // 【修复】强制更新全局玩家状态，确保修改能同步到YYCardBattle
    function updateGlobalPlayerState(userId, updatedPlayerData) {
        if (!userId || !updatedPlayerData) return false;
        // 优先调用Battle层的更新方法（如果有），确保全局状态同步
        if (window.YYCardBattle?.updatePlayerState) {
            return window.YYCardBattle.updatePlayerState(userId, updatedPlayerData);
        }
        // 兜底：直接修改Battle层的原始状态（适配无update方法的场景）
        const rawGameState = window.YYCardBattle?.rawGameState || window._gameState;
        if (rawGameState?.players?.[userId]) {
            Object.assign(rawGameState.players[userId], updatedPlayerData);
            return true;
        }
        console.warn('[商店系统] 无法同步全局状态，请确认YYCardBattle暴露了updatePlayerState方法');
        return false;
    }

    // ========== 【修复】合并后端返回的玩家数据，强制覆盖shopCards，无漏更 ==========
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer || !target) return;
        // 基础数值字段强制合并
        const mergeFields = ['gold', 'exp', 'shopLevel', 'health', 'isBot', 'isEliminated', 'isReady'];
        mergeFields.forEach(field => {
            if (updatedPlayer[field] !== undefined) target[field] = updatedPlayer[field];
        });
        // 【核心修复】shopCards强制合并，不管字段是否存在，兜底空数组
        target.shopCards = updatedPlayer.shopCards || target.shopCards || [];
        // 不合并 board 和 hand，避免覆盖乐观更新的结果
    }

    // ========== 成功后UI更新，强制同步全局状态 ==========
    function updateUIAfterSuccess(userId, updatedPlayer) {
        if (!userId || !updatedPlayer) return;
        // 先同步全局状态
        updateGlobalPlayerState(userId, updatedPlayer);
        
        // 更新金币显示
        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        // 更新经验/升级按钮
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }
        // 更新商店等级
        if (updatedPlayer.shopLevel !== undefined) {
            const levelEl = document.getElementById('shop-level');
            if (levelEl) levelEl.textContent = updatedPlayer.shopLevel;
        }
        // 更新血量
        if (updatedPlayer.health !== undefined) {
            const healthEl = document.getElementById('my-health');
            if (healthEl) healthEl.textContent = updatedPlayer.health;
            const healthTop = document.getElementById('my-health-top');
            if (healthTop) healthTop.textContent = updatedPlayer.health;
        }
        // 【修复】强制重新渲染商店，100%触发
        renderShop();
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

    // ========== 【修复】DOM获取工具，解决缓存失效问题 ==========
    function getDomElement(id, forceRefresh = false) {
        // 强制刷新或缓存失效时，重新获取DOM
        if (forceRefresh || !domCache[id] || !document.body.contains(domCache[id])) {
            domCache[id] = document.getElementById(id);
        }
        return domCache[id];
    }

    async function getAccessToken() {
        if (cachedAccessToken) return cachedAccessToken;
        const supabaseClient = window.supabase;
        const { data: { session } } = await supabaseClient?.auth?.getSession?.() || {};
        cachedAccessToken = session?.access_token;
        clearTimeout(tokenCacheTimer);
        tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
        return cachedAccessToken;
    }

    // ========== 【修复】渲染函数，每次都拿最新的全局状态，无快照问题 ==========
    function renderMyBoard() {
        const { gameState, userId, my } = getCurrentUserState();
        if (!gameState || !my) return;
        renderBoard('my-board', my.board, true);
    }

    function renderEnemyBoard() {
        const { gameState, userId } = getCurrentUserState();
        if (!gameState || !userId) return;
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
        const { gameState, userId, my } = getCurrentUserState();
        if (!gameState || !my) return;
        const container = getDomElement('hand-container', true);
        if (!container) return;
        container.innerHTML = '';
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
        container.appendChild(fragment);
        const countEl = getDomElement('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    // ========== 【核心修复】商店渲染函数，增加多层兜底和日志 ==========
    function renderShop() {
        const { gameState, userId, my } = getCurrentUserState();
        if (!gameState || !my) {
            console.warn('[商店渲染] 未获取到玩家状态');
            return;
        }
        const container = getDomElement('shop-container', true);
        if (!container) {
            console.error('[商店渲染] 未找到商店容器DOM');
            return;
        }

        // 清空容器，防止残留
        container.innerHTML = '';
        const shopCards = my.shopCards || [];
        console.log('[商店渲染] 待渲染卡牌数量:', shopCards.length, shopCards);

        // 空数据兜底
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        // 渲染卡牌
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
        container.appendChild(fragment);
    }

    function refreshAllUI() {
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();
        const { gameState, userId, my } = getCurrentUserState();
        if (gameState && my) {
            getDomElement('my-health').textContent = my.health;
            getDomElement('my-gold').textContent = my.gold;
            getDomElement('shop-level').textContent = my.shopLevel;
            const healthTop = getDomElement('my-health-top');
            if (healthTop) healthTop.textContent = my.health;
        }
        getDomElement('round-num').textContent = gameState?.round || 1;
        const roundTop = getDomElement('round-num-top');
        if (roundTop) roundTop.textContent = gameState?.round || 1;
        updateBuyExpButtonState();
    }

    function updateBuyExpButtonState() {
        const { gameState, my } = getCurrentUserState();
        if (!gameState || !my) return;
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
            const btn = getDomElement(id);
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
        const cont = getDomElement(containerId, true);
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
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
        d.querySelector('img').draggable = false;
        return d;
    }

    // 拖拽核心（无修改，仅适配新的状态工具）
    function onDragStart(e, type, card, index, element) {
        const { gameState } = getCurrentUserState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering' || isRefreshingShop) {
            toast('现在不能操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;

        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 99999;
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

        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

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

        if (dragState.type === 'hand' || dragState.type === 'board') {
            const shopContainer = getDomElement('shop-container');
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

        cloneElement.remove();
        sourceElement.style.opacity = '';
        
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        sourceElement.releasePointerCapture?.(e.pointerId);

        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        const targetElement = document.elementFromPoint(currentX, currentY);
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
            if (el.id === 'hand-container' || el.closest('#hand-container')) {
                return { zone: 'hand' };
            }
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

    // ==================== 乐观更新业务操作（适配新的状态同步） ====================
    async function handleHandToBoard(handIdx, boardIdx) {
        const { userId, gameState, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!card) { toast('卡牌不存在', true); return; }
        const oldTarget = my.board[boardIdx];

        // 乐观更新
        my.board[boardIdx] = card;
        my.hand[handIdx] = oldTarget || null;
        updateGlobalPlayerState(userId, { hand: my.hand, board: my.board });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            // 新增超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(PLACE_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, handIndex: handIdx, boardIndex: boardIdx }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                // 失败回滚
                updateGlobalPlayerState(userId, { hand: oldHand, board: oldBoard });
                refreshAllUI();
                toast(data.error || '放置失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast(data.exchanged ? '交换成功' : '放置成功');
        } catch (err) {
            // 网络错误回滚
            updateGlobalPlayerState(userId, { hand: oldHand, board: oldBoard });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];

        // 乐观更新
        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.board[boardIdx] = { ...card, instanceId: tempInstanceId };
        if (targetCard) {
            const emptyHandIdx = my.hand.findIndex(c => c === null);
            if (emptyHandIdx !== -1) my.hand[emptyHandIdx] = targetCard;
        }
        updateGlobalPlayerState(userId, { gold: my.gold, shopCards: my.shopCards, hand: my.hand, board: my.board });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards, hand: oldHand, board: oldBoard });
                refreshAllUI();
                toast(data.error || '购买失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast(data.exchanged ? '购买并交换成功' : '购买成功');
        } catch (err) {
            updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards, hand: oldHand, board: oldBoard });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function handleShopToHand(card, shopIdx) {
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];
        const emptyIdx = my.hand.findIndex(c => c === null);
        if (emptyIdx === -1) { toast('手牌已满', true); return; }

        // 乐观更新
        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.hand[emptyIdx] = { ...card, instanceId: tempInstanceId };
        updateGlobalPlayerState(userId, { gold: my.gold, shopCards: my.shopCards, hand: my.hand });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards, hand: oldHand });
                refreshAllUI();
                toast(data.error || '购买失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast('购买成功');
        } catch (err) {
            updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards, hand: oldHand });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        updateGlobalPlayerState(userId, { board: my.board });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(SWAP_BOARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, indexA: idxA, indexB: idxB }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { board: oldBoard });
                refreshAllUI();
                toast(data.error || '交换失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast('交换成功');
        } catch (err) {
            updateGlobalPlayerState(userId, { board: oldBoard });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function handleBoardToHand(boardIdx) {
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        const card = my.board[boardIdx];
        if (!card) { toast('该位置无卡牌', true); return; }
        const handCount = my.hand.filter(c => c !== null).length;
        if (handCount >= (config.HAND_MAX_COUNT || 15)) { toast('手牌已满', true); return; }
        const emptyIdx = my.hand.findIndex(c => c === null);
        if (emptyIdx === -1) { toast('手牌已满', true); return; }

        const oldBoard = [...my.board];
        const oldHand = [...my.hand];
        my.board[boardIdx] = null;
        my.hand[emptyIdx] = card;
        updateGlobalPlayerState(userId, { board: my.board, hand: my.hand });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(BOARD_TO_HAND_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, boardIndex: boardIdx }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { board: oldBoard, hand: oldHand });
                refreshAllUI();
                toast(data.error || '移回失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast('已移回手牌');
        } catch (err) {
            updateGlobalPlayerState(userId, { board: oldBoard, hand: oldHand });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function handleSell(type, index) {
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        let card = null;
        if (type === 'hand') card = my.hand[index];
        else card = my.board[index];
        if (!card) { toast('卡牌不存在', true); return; }
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;

        const oldGold = my.gold;
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];

        // 乐观更新
        if (type === 'hand') my.hand[index] = null;
        else my.board[index] = null;
        my.gold += price;
        updateGlobalPlayerState(userId, { gold: my.gold, hand: my.hand, board: my.board });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(SELL_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, type, index }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { gold: oldGold, hand: oldHand, board: oldBoard });
                refreshAllUI();
                toast(data.error || '出售失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast('出售成功');
        } catch (err) {
            updateGlobalPlayerState(userId, { gold: oldGold, hand: oldHand, board: oldBoard });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    async function buyExpAction() {
        if (currentPhase === 'buffering' || isRefreshingShop) {
            toast('缓冲期无法操作', true);
            return;
        }
        const { userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        if (!roomId || !userId || !my) { toast('房间信息缺失', true); return; }

        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) { toast('已满级', true); return; }
        if (my.gold < 1) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        my.gold -= 1;
        updateGlobalPlayerState(userId, { gold: my.gold });
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(BUY_EXP_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { gold: oldGold });
                refreshAllUI();
                toast(data.error || '升级失败', true);
                return;
            }
            if (data.updatedPlayer) {
                updateUIAfterSuccess(userId, data.updatedPlayer);
            }
            toast('升级成功');
        } catch (err) {
            updateGlobalPlayerState(userId, { gold: oldGold });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '请求超时' : '网络错误', true);
        }
    }

    // ========== 【终极修复】刷新商店函数，解决不显示卡牌的所有问题 ==========
    async function refreshShopAction() {
        // 防重复点击
        if (currentPhase === 'buffering' || isRefreshingShop) {
            toast('正在刷新中，请稍候', true);
            return;
        }
        const { gameState, userId, my } = getCurrentUserState();
        const roomId = window.YYCardMatchmaking?.getCurrentRoomId?.() || window._currentRoomId || null;
        
        // 前置校验
        if (!gameState || gameState.phase !== 'prepare') {
            toast('只能在准备阶段刷新', true);
            return;
        }
        if (!roomId || !userId || !my) {
            toast('房间信息缺失', true);
            return;
        }
        if (my.gold < 1) {
            toast('金币不足', true);
            return;
        }

        // 开启刷新锁，防止实时推送覆盖和重复点击
        isRefreshingShop = true;
        updateBuyExpButtonState();

        // 保存旧数据，用于失败回滚
        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];

        // 乐观更新：扣除金币，立即更新UI
        my.gold -= 1;
        updateGlobalPlayerState(userId, { gold: my.gold });
        const goldEl = getDomElement('my-gold');
        if (goldEl) goldEl.textContent = my.gold;
        updateBuyExpButtonState();

        // 添加刷新指示器
        const shopContainer = getDomElement('shop-container', true);
        let loadingHint = null;
        if (shopContainer && !shopContainer.querySelector('.refresh-loading-hint')) {
            loadingHint = document.createElement('div');
            loadingHint.className = 'refresh-loading-hint';
            loadingHint.textContent = '⟳ 刷新中...';
            loadingHint.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.7); color:#ffd966; border-radius:8px; padding:8px 16px; font-size:14px; z-index:10; pointer-events:none;';
            shopContainer.style.position = 'relative';
            shopContainer.appendChild(loadingHint);
        }

        try {
            const accessToken = await getAccessToken();
            // 新增超时控制，防止无限等待
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            // 发起请求
            const response = await fetch(REFRESH_SHOP_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            console.log('[刷新商店] 接口返回:', data);

            // 接口失败，回滚数据
            if (!response.ok || !data.success) {
                updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards });
                refreshAllUI();
                toast(data.error || '刷新失败', true);
                return;
            }

            // 【核心修复】多层兜底，确保新卡牌一定写入全局状态
            let finalShopCards = [];
            let finalPlayerData = {};

            // 优先用updatedPlayer
            if (data.updatedPlayer) {
                finalPlayerData = data.updatedPlayer;
                finalShopCards = data.updatedPlayer.shopCards || [];
            }
            // 兜底用直接返回的shopCards
            if (finalShopCards.length === 0 && data.shopCards) {
                finalShopCards = data.shopCards;
                finalPlayerData.shopCards = finalShopCards;
            }
            // 最终兜底：用旧卡牌，避免空白
            if (finalShopCards.length === 0) {
                finalShopCards = oldShopCards;
                finalPlayerData.shopCards = finalShopCards;
                console.warn('[刷新商店] 接口未返回新卡牌，使用旧数据兜底');
            }

            // 强制同步全局状态
            finalPlayerData.gold = data.gold || finalPlayerData.gold || my.gold;
            updateGlobalPlayerState(userId, finalPlayerData);

            // 强制刷新UI
            updateUIAfterSuccess(userId, finalPlayerData);
            toast('刷新成功');

        } catch (err) {
            // 网络/超时错误，全量回滚
            console.error('[刷新商店] 请求异常:', err);
            updateGlobalPlayerState(userId, { gold: oldGold, shopCards: oldShopCards });
            refreshAllUI();
            toast(err.name === 'AbortError' ? '刷新超时，请重试' : '网络错误，刷新失败', true);
        } finally {
            // 关闭刷新锁
            isRefreshingShop = false;
            updateBuyExpButtonState();
            // 移除加载指示器
            if (loadingHint && loadingHint.parentNode) loadingHint.remove();
        }
    }

    function updateTimerDisplay(seconds, phase) {
        const timerEl = getDomElement('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') { timerEl.textContent = `⏳ ${seconds}`; return; }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }
        const battleTimerEl = getDomElement('phase-timer-battle');
        if (battleTimerEl) battleTimerEl.textContent = (phase === 'battle') ? seconds : '00:00';
    }

    function setPhase(phase) {
        currentPhase = phase;
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
    }

    function bindUIEvents() {
        getDomElement('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        getDomElement('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        getDomElement('buy-exp-btn')?.addEventListener('click', buyExpAction);
        getDomElement('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; will-change: transform; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; transform: translateZ(0); }
            .shop-area.drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { pointer-events: none !important; opacity: 0.6; }
            .card-slot, .card { contain: layout style paint; }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        domCache = {}; // 初始化DOM缓存
        bindUIEvents();
        refreshAllUI();
        console.log('✅ 商店系统初始化完成（修复版）');
    }

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        toast,
        refreshShopAction,
        getCurrentUserState,
        updateGlobalPlayerState
    };
})();
