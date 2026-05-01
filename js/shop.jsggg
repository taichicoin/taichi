// ==================== 商店与交互系统【全接口免JWT·RPC终极适配版 + 双缓冲商店v3】 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    // ========== 全局状态管理 ==========
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    const domCache = {};
    let isRefreshingShop = false;
    let isDragging = false;

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

    // ========== 工具：有效卡牌判定 ==========
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    function getFirstAvailableHandSlot(hand) {
        for (let i = 0; i < hand.length; i++) {
            if (!isValidCard(hand[i])) return i;
        }
        return -1;
    }

    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }

    // ✅ 双缓冲v3：获取当前应显示的商店卡牌数组
    function getShopDisplayCards(player) {
        const shop = player.shopCards;
        if (shop && shop.buffer && Array.isArray(shop.buffer)) {
            const active = shop.active ?? 0;
            const sub = shop.subIndex ?? 0;
            const group = shop.buffer[active];
            if (Array.isArray(group) && group.length >= 6) {
                const start = sub === 0 ? 0 : 3;
                return group.slice(start, start + 3).filter(isValidCard);
            }
        }
        return Array.isArray(shop) ? shop.filter(isValidCard) : [];
    }

    // ========== 统一操作权限判定 ==========
    function canOperate() {
        const gameState = getGameState();
        return !!(
            gameState && 
            gameState.phase === 'prepare' && 
            !isRefreshingShop && 
            !gameState.players?.[getCurrentUserId()]?.isBot
        );
    }

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

    const FUNCTION_NAME_MAP = {
        REFRESH_SHOP: 'refresh-shop',
        BUY_CARD: 'buy-card',
        SWAP_BOARD: 'swap-board',
        SELL_CARD: 'sell-card',
        PLACE_CARD: 'place-card',
        BOARD_TO_HAND: 'board-to-hand',
        BUY_EXP: 'buy-exp'
    };

    async function invokeFunction(functionName, body = {}, options = {}) {
        const { needAuth = false, timeout = 10000 } = options;
        const supabaseClient = getSupabaseClient();

        try {
            if (!functionName) throw new Error('函数名不能为空');
            if (!supabaseClient) throw new Error('Supabase客户端未初始化');
            
            const headers = {};
            headers.Authorization = '';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const { data, error } = await supabaseClient.functions.invoke(
                functionName,
                { body, headers, signal: controller.signal }
            );

            clearTimeout(timeoutId);

            if (error) {
                console.error(`函数[${functionName}]调用失败：`, error);
                throw new Error(error.message || '操作执行失败');
            }

            if (data && !data.success) {
                throw new Error(data.error || '操作执行失败');
            }

            return { success: true, data };
        } catch (err) {
            console.error(`函数[${functionName}]调用异常：`, err);
            return { success: false, error: err.message };
        }
    }

    function getValidAccessToken() {
        return null;
    }

    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const fields = ['gold', 'exp', 'shopLevel', 'health', 'shopCards', 'isBot', 'isEliminated', 'isReady', 'hand', 'board'];
        fields.forEach(key => {
            if (updatedPlayer[key] !== undefined) target[key] = updatedPlayer[key];
        });
    }

    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (updatedPlayer.gold !== undefined) {
            const el = document.getElementById('my-gold');
            if (el) el.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.health !== undefined) {
            const el = document.getElementById('my-health');
            if (el) el.textContent = updatedPlayer.health;
            const topEl = document.getElementById('my-health-top');
            if (topEl) topEl.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopLevel !== undefined) {
            const el = document.getElementById('shop-level');
            if (el) el.textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }

        if (updatedPlayer.shopCards !== undefined) {
            if (!isDragging) renderShop();
        }
        if (updatedPlayer.hand !== undefined) {
            if (!isDragging) renderHand();
        }
        if (updatedPlayer.board !== undefined) {
            if (!isDragging) {
                renderMyBoard();
                renderEnemyBoard();
            }
        }
    }

    // ✅ 仅保留手牌已满提示的 toast 函数
    function toast(message, isError = false, duration = 2000) {
        if (!message || (!message.includes('手牌已满') && !message.includes('手牌已满，无法交换'))) {
            return;
        }
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
    function getSupabaseClient() {
        return window.supabase;
    }

    // ========== UI 渲染 ==========
    function renderMyBoard() {
        if (isDragging) return;
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
            const boardEl = document.getElementById('enemy-board');
            if (boardEl) boardEl.setAttribute('data-player-id', oppId);
        }
    }

    function renderHand() {
        if (isDragging) return;
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
            if (isValidCard(card)) {
                const el = createCardElement(card, 'hand');
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = getValidHandCount(my.hand);
    }

    // ✅ 修复：移除冗余的价格标签追加逻辑，避免裁剪和冲突
    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = domCache.shopContainer || document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';

        const shop = my.shopCards;
        if (!shop || !shop.buffer) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group) || group.length < 6) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        const start = sub === 0 ? 0 : 3;
        let hasCards = false;
        const fragment = document.createDocumentFragment();

        for (let i = start; i < start + 3; i++) {
            const card = group[i];
            if (isValidCard(card)) {
                hasCards = true;
                const el = createCardElement(card, 'shop');
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el));
                fragment.appendChild(el);
            }
        }

        if (!hasCards) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    function refreshAllUI() {
        if (window.YYCardInspector?.cleanupAllRemnants) {
            window.YYCardInspector.cleanupAllRemnants();
        }
        if (!isDragging) {
            renderMyBoard();
            renderHand();
        }
        renderEnemyBoard();
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
        const canOp = canOperate();
        const shouldDisable = !canOp || isMaxLevel;

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
            let dataIndex = isSelf ? i : (i < 3 ? i + 3 : i - 3);
            slot.setAttribute('data-board-index', dataIndex);
            if (isValidCard(c)) {
                const el = createCardElement(c, isSelf ? 'board' : 'enemy', isSelf);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
                } else {
                    el.setAttribute('data-board-index', dataIndex);
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            fragment.appendChild(slot);
        }
        cont.appendChild(fragment);
    }

    // ✅ 核心修复：重构卡牌创建逻辑，按场景控制价格显示，补充价格标签核心样式
    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        d.setAttribute('data-card-type', cardType);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        // 棋盘上只显示纯数字，商店/手牌保留图标
        const atkDisplay = isBoard ? `${card.atk}` : `⚔️${card.atk}`;
        const hpDisplay = isBoard ? `${card.hp}` : `🛡️${card.hp}`;
        
        // 仅商店卡牌渲染价格标签，手牌/棋盘/敌方卡牌不渲染，避免样式冲突
        const priceHtml = cardType === 'shop' 
            ? `<div class="card-price">💰${price}</div>` 
            : '';
        
        d.innerHTML = `
            <div class="card-icon"><img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats"><span class="card-atk">${atkDisplay}</span><span class="card-hp">${hpDisplay}</span></div>
            ${priceHtml}
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 拖拽逻辑 ==========
    function onDragStart(e, type, card, index, element) {
        if (!canOperate()) { return; }
        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);
        isDragging = true;

        const clientX = e.clientX;
        const clientY = e.clientY;
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed; z-index: 99999;
            left: ${clientX - element.offsetWidth / 2}px;
            top: ${clientY - element.offsetHeight / 2}px;
            width: ${element.offsetWidth}px; height: ${element.offsetHeight}px;
            opacity: 0.85; transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none; transition: none;
            will-change: left, top;
        `;
        document.body.appendChild(clone);
        element.style.visibility = 'hidden';

        dragState = {
            active: true, type, card, index, sourceElement: element, cloneElement: clone,
            startX: clientX, startY: clientY, currentX: clientX, currentY: clientY
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
        const { type, sourceElement, cloneElement, currentX, currentY } = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);

        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        isDragging = false;

        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) {
            dragState.active = false;
            return;
        }
        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            executeDropAction(dragState.type, dragState.index, dragState.card, dropResult);
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

    // ========== 业务操作 ==========
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!isValidCard(card)) return;
        const oldTarget = my.board[boardIdx];

        if (isValidCard(oldTarget) && getValidHandCount(my.hand) >= 15) {
            toast('手牌已满，无法交换', true);
            return;
        }

        my.board[boardIdx] = card;
        my.hand[handIdx] = oldTarget || null;
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.PLACE_CARD, { roomId, userId, handIndex: handIdx, boardIndex: boardIdx });
        if (!result.success) {
            my.hand = oldHand;
            my.board = oldBoard;
            renderMyBoard();
            renderHand();
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 商店→棋盘购买（确保复制全部字段）
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) return;

        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldGold = my.gold;
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];

        if (isValidCard(targetCard) && getValidHandCount(my.hand) >= 15) {
            toast('手牌已满，无法交换', true);
            return;
        }

        const realIndex = shopIdx;

        my.gold -= price;
        // ✅ 创建新卡实例，显式携带 card_id 和 faction，同时展开原卡所有字段
        const newCard = {
            ...card,
            instanceId: Date.now() + '-' + Math.random(),
            cardId: card.cardId || card.card_id || '',
            card_id: card.card_id || card.cardId || '',
            faction: card.faction || ''
        };
        my.board[boardIdx] = newCard;
        if (isValidCard(targetCard)) {
            const emptyIdx = getFirstAvailableHandSlot(my.hand);
            if (emptyIdx !== -1) my.hand[emptyIdx] = targetCard;
        }

        const shop = my.shopCards;
        const active = shop.active ?? 0;
        const group = shop.buffer[active];
        group[realIndex] = null;

        renderMyBoard();
        renderHand();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId,
            shopIndex: realIndex,
            targetBoardIndex: boardIdx
        });

        if (!result.success) {
            my.gold = oldGold;
            my.board = oldBoard;
            my.hand = oldHand;
            my.shopCards = oldShopRaw;
            renderMyBoard();
            renderHand();
            renderShop();
            return;
        }

        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 商店→手牌购买（确保复制全部字段）
    async function handleShopToHand(card, shopIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) return;
        if (getValidHandCount(my.hand) >= 15) {
            toast('手牌已满', true);
            return;
        }

        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldGold = my.gold;
        const oldHand = [...my.hand];

        const realIndex = shopIdx;

        my.gold -= price;
        // ✅ 创建新卡实例，显式携带 card_id 和 faction
        const newCard = {
            ...card,
            instanceId: Date.now() + '-' + Math.random(),
            cardId: card.cardId || card.card_id || '',
            card_id: card.card_id || card.cardId || '',
            faction: card.faction || ''
        };
        const emptyIdx = getFirstAvailableHandSlot(my.hand);
        if (emptyIdx !== -1) my.hand[emptyIdx] = newCard;
        else my.hand.push(newCard);

        const shop = my.shopCards;
        const active = shop.active ?? 0;
        const group = shop.buffer[active];
        group[realIndex] = null;

        renderHand();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId,
            shopIndex: realIndex
        });

        if (!result.success) {
            my.gold = oldGold;
            my.shopCards = oldShopRaw;
            my.hand = oldHand;
            renderHand();
            renderShop();
            return;
        }

        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 棋盘交换
    async function handleBoardSwap(idxA, idxB) {
        if (!canOperate() || idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        renderMyBoard();

        const result = await invokeFunction(FUNCTION_NAME_MAP.SWAP_BOARD, { roomId, userId, indexA: idxA, indexB: idxB });
        if (!result.success) {
            my.board = oldBoard;
            renderMyBoard();
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 棋盘→手牌
    async function handleBoardToHand(boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const card = my.board[boardIdx];
        if (!isValidCard(card)) return;
        if (getValidHandCount(my.hand) >= 15) {
            toast('手牌已满', true);
            return;
        }

        const oldBoard = [...my.board];
        const oldHand = [...my.hand];
        my.board[boardIdx] = null;
        const emptyIdx = getFirstAvailableHandSlot(my.hand);
        if (emptyIdx !== -1) my.hand[emptyIdx] = card;
        else my.hand.push(card);
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.BOARD_TO_HAND, { roomId, userId, boardIndex: boardIdx });
        if (!result.success) {
            my.board = oldBoard;
            my.hand = oldHand;
            renderMyBoard();
            renderHand();
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 出售
    async function handleSell(type, index) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        let card = type === 'hand' ? my.hand[index] : my.board[index];
        if (!isValidCard(card)) return;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;

        const oldGold = my.gold;
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];

        if (type === 'hand') my.hand[index] = null;
        else my.board[index] = null;
        my.gold += price;
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, { roomId, userId, type, index });
        if (!result.success) {
            my.gold = oldGold;
            my.hand = oldHand;
            my.board = oldBoard;
            renderMyBoard();
            renderHand();
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 购买经验
    async function buyExpAction() {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) return;
        if (my.gold < 1) return;

        const oldGold = my.gold;
        my.gold -= 1;

        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_EXP, { roomId, userId });
        if (!result.success) {
            my.gold = oldGold;
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // 刷新商店
    async function refreshShopAction() {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;
        if (my.gold < 1) return;

        isRefreshingShop = true;
        updateBuyExpButtonState();
        const forceUnlockTimer = setTimeout(() => { isRefreshingShop = false; updateBuyExpButtonState(); }, 12000);
        const shopContainer = domCache.shopContainer || document.getElementById('shop-container');
        let loadingHint = null;
        if (shopContainer && !shopContainer.querySelector('.refresh-loading-hint')) {
            loadingHint = document.createElement('div');
            loadingHint.className = 'refresh-loading-hint';
            loadingHint.textContent = '⟳ 刷新中...';
            loadingHint.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.75); color:#ffd966; border-radius:8px; padding:8px 16px; font-size:14px; z-index:100; pointer-events:none;';
            shopContainer.style.position = 'relative';
            shopContainer.appendChild(loadingHint);
        }

        const result = await invokeFunction(FUNCTION_NAME_MAP.REFRESH_SHOP, { roomId, userId });
        clearTimeout(forceUnlockTimer);
        isRefreshingShop = false;
        updateBuyExpButtonState();
        if (loadingHint?.parentNode) loadingHint.remove();

        if (!result.success) return;
        const latestGameState = getGameState();
        const latestMy = latestGameState?.players[userId];
        if (!latestMy) return;

        let finalUpdatedData = {};
        if (result.data.updatedPlayer) {
            finalUpdatedData = result.data.updatedPlayer;
        } else {
            finalUpdatedData = { shopCards: result.data.shopCards || latestMy.shopCards, gold: result.data.gold !== undefined ? result.data.gold : latestMy.gold };
        }
        mergeUpdatedPlayer(latestMy, finalUpdatedData);
        updateUIAfterSuccess(finalUpdatedData);
    }

    // ========== 基础UI绑定 ==========
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
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
        updateBuyExpButtonState();
    }

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // ✅ 核心修复：重写价格标签CSS，高优先级、背景全透明、固定位置、确保不被覆盖
    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; will-change: transform; position: relative; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; transform: translateZ(0); }
            .shop-area.drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { pointer-events: none !important; opacity: 0.6; }
            .card-slot, .card { contain: layout style paint; }
            
            /* ✅ 价格标签核心样式：高优先级、背景全透明、固定位置、永远显示 */
            .card[data-card-type="shop"] .card-price {
                display: block !important;
                position: absolute !important;
                bottom: 4px !important;
                left: 0 !important;
                right: 0 !important;
                text-align: center !important;
                font-weight: bold !important;
                font-size: 0.75rem !important;
                z-index: 99 !important;
                /* 背景全透明，无任何边框阴影 */
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                /* 文字强制白色+多层阴影，确保任何背景下都能看清 */
                color: #ffffff !important;
                text-shadow: 0 0 2px #000, 0 0 4px #000, 0 0 6px #000, 0 0 8px #000 !important;
                padding: 0 !important;
                margin: 0 !important;
                pointer-events: none !important;
                line-height: 1 !important;
            }

            /* 非商店卡牌，价格标签直接隐藏，避免样式冲突 */
            .card:not([data-card-type="shop"]) .card-price {
                display: none !important;
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
        console.log('✅ 全接口免JWT·RPC适配版 + 双缓冲商店v3 初始化完成 (价格透明背景修复版)');
    }

    return { init, refreshAllUI, updateTimerDisplay, setPhase, toast };
})();
