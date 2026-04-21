// ==================== 商店与交互系统（乐观更新 + 无弹回） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    const domCache = {};

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

    // ========== 合并后端返回的玩家数据（仅数值字段，不覆盖棋盘手牌） ==========
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        if (updatedPlayer.gold !== undefined) target.gold = updatedPlayer.gold;
        if (updatedPlayer.exp !== undefined) target.exp = updatedPlayer.exp;
        if (updatedPlayer.shopLevel !== undefined) target.shopLevel = updatedPlayer.shopLevel;
        if (updatedPlayer.health !== undefined) target.health = updatedPlayer.health;
        if (updatedPlayer.shopCards !== undefined) target.shopCards = updatedPlayer.shopCards;
        // 不合并 board 和 hand，避免覆盖乐观更新的结果
        if (updatedPlayer.isBot !== undefined) target.isBot = updatedPlayer.isBot;
        if (updatedPlayer.isEliminated !== undefined) target.isEliminated = updatedPlayer.isEliminated;
        if (updatedPlayer.isReady !== undefined) target.isReady = updatedPlayer.isReady;
    }

    // ========== 成功后只更新数值显示和商店卡牌，不重绘棋盘手牌 ==========
    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        // 更新金币显示
        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        // 更新经验显示（升级按钮状态会重新计算）
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }
        // 更新商店等级显示
        if (updatedPlayer.shopLevel !== undefined) {
            const levelEl = document.getElementById('shop-level');
            if (levelEl) levelEl.textContent = updatedPlayer.shopLevel;
        }
        // 更新血量显示
        if (updatedPlayer.health !== undefined) {
            const healthEl = document.getElementById('my-health');
            if (healthEl) healthEl.textContent = updatedPlayer.health;
            const healthTop = document.getElementById('my-health-top');
            if (healthTop) healthTop.textContent = updatedPlayer.health;
        }
        // 更新商店卡牌（如果有变化）
        if (updatedPlayer.shopCards !== undefined) {
            renderShop();
        }
        // 注意：不重新渲染手牌和棋盘，因为乐观更新已经做了
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
        if (window.YYCardBattle?.getCurrentRoomId) {
            return window.YYCardBattle.getCurrentRoomId();
        }
        return window._currentRoomId || null;
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

    // 渲染函数
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
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
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

    // 拖拽核心
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

    // ==================== 乐观更新业务操作 ====================

    async function handleHandToBoard(handIdx, boardIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!card) { toast('卡牌不存在', true); return; }
        const oldTarget = my.board[boardIdx];

        my.board[boardIdx] = card;
        my.hand[handIdx] = oldTarget || null;
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(PLACE_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, handIndex: handIdx, boardIndex: boardIdx }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.hand = oldHand;
                my.board = oldBoard;
                refreshAllUI();
                toast(data.error || '放置失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast(data.exchanged ? '交换成功' : '放置成功');
        } catch (err) {
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
            toast('网络错误', true);
        }
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];

        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.board[boardIdx] = { ...card, instanceId: tempInstanceId };
        if (targetCard) {
            const emptyHandIdx = my.hand.findIndex(c => c === null);
            if (emptyHandIdx !== -1) my.hand[emptyHandIdx] = targetCard;
        }
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.gold = oldGold;
                my.shopCards = oldShopCards;
                my.hand = oldHand;
                my.board = oldBoard;
                refreshAllUI();
                toast(data.error || '购买失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast(data.exchanged ? '购买并交换成功' : '购买成功');
        } catch (err) {
            my.gold = oldGold;
            my.shopCards = oldShopCards;
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
            toast('网络错误', true);
        }
    }

    async function handleShopToHand(card, shopIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];
        const emptyIdx = my.hand.findIndex(c => c === null);
        if (emptyIdx === -1) { toast('手牌已满', true); return; }

        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.hand[emptyIdx] = { ...card, instanceId: tempInstanceId };
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, shopIndex: shopIdx }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.gold = oldGold;
                my.shopCards = oldShopCards;
                my.hand = oldHand;
                refreshAllUI();
                toast(data.error || '购买失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('购买成功');
        } catch (err) {
            my.gold = oldGold;
            my.shopCards = oldShopCards;
            my.hand = oldHand;
            refreshAllUI();
            toast('网络错误', true);
        }
    }

    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(SWAP_BOARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, indexA: idxA, indexB: idxB }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.board = oldBoard;
                refreshAllUI();
                toast(data.error || '交换失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('交换成功');
        } catch (err) {
            my.board = oldBoard;
            refreshAllUI();
            toast('网络错误', true);
        }
    }

    async function handleBoardToHand(boardIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

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
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(BOARD_TO_HAND_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, boardIndex: boardIdx }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                refreshAllUI();
                toast(data.error || '移回失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('已移回手牌');
        } catch (err) {
            my.board = oldBoard;
            my.hand = oldHand;
            refreshAllUI();
            toast('网络错误', true);
        }
    }

    async function handleSell(type, index) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        let card = null;
        if (type === 'hand') card = my.hand[index];
        else card = my.board[index];
        if (!card) { toast('卡牌不存在', true); return; }
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;

        const oldGold = my.gold;
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];

        if (type === 'hand') my.hand[index] = null;
        else my.board[index] = null;
        my.gold += price;
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(SELL_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId, type, index }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.gold = oldGold;
                my.hand = oldHand;
                my.board = oldBoard;
                refreshAllUI();
                toast(data.error || '出售失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('出售成功');
        } catch (err) {
            my.gold = oldGold;
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
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

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) { toast('已满级', true); return; }
        if (my.gold < 1) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        my.gold -= 1;
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(BUY_EXP_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.gold = oldGold;
                refreshAllUI();
                toast(data.error || '升级失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('升级成功');
        } catch (err) {
            my.gold = oldGold;
            refreshAllUI();
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
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const my = gameState?.players[userId];
        if (!my) return;
        if (my.gold < 1) { toast('金币不足', true); return; }

        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        my.gold -= 1;
        my.shopCards = [];
        refreshAllUI();

        try {
            const accessToken = await getAccessToken();
            const response = await fetch(REFRESH_SHOP_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId, userId }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                my.gold = oldGold;
                my.shopCards = oldShopCards;
                refreshAllUI();
                toast(data.error || '刷新失败', true);
                return;
            }
            if (data.updatedPlayer) {
                mergeUpdatedPlayer(my, data.updatedPlayer);
                updateUIAfterSuccess(data.updatedPlayer);
            }
            toast('刷新成功');
        } catch (err) {
            my.gold = oldGold;
            my.shopCards = oldShopCards;
            refreshAllUI();
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
