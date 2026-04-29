// ========== 修复1：废除双轨阶段判定，统一以battle的gameState为准，彻底解决不同步乱拦截 ==========
let toastTimer = null;
let cachedAccessToken = null;
let tokenCacheTimer = null;
const domCache = {};
let isRefreshingShop = false;

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

// ========== 修复2：统一操作权限判定，所有操作只走这一个判断，彻底解决乱拦截 ==========
function canOperate() {
    const gameState = getGameState();
    // 只有准备阶段、不在刷新中、不是机器人，才能操作
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

const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

// ========== 修复3：统一接口请求工具，彻底解决「网页解析失败」报错 ==========
async function requestApi(url, body = {}) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('未登录，无操作权限');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 核心修复：拦截非JSON响应，避免解析HTML报错
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            console.error('接口返回非JSON内容：', errorText);
            throw new Error('服务器接口异常，请检查函数部署状态');
        }

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '操作执行失败');
        }

        return { success: true, data };
    } catch (err) {
        // 友好错误提示
        let errorMsg = '网络错误，操作失败';
        if (err.name === 'AbortError') errorMsg = '请求超时，请重试';
        else if (err.message) errorMsg = err.message;
        return { success: false, error: errorMsg };
    }
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
        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = updatedPlayer.gold;
    }
    if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
        updateBuyExpButtonState();
    }
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
    if (updatedPlayer.shopCards !== undefined || updatedPlayer.hand !== undefined || updatedPlayer.board !== undefined) {
        refreshAllUI();
    }
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
    if (!supabaseClient) return null;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    cachedAccessToken = session?.access_token;
    clearTimeout(tokenCacheTimer);
    tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
    return cachedAccessToken;
}

// ========== 棋盘渲染逻辑（保留原有，无业务修改） ==========
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
        container.innerHTML = '<div style="color:#aaa;padding:10px;">商店暂无卡牌</div>';
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
    if (window.YYCardInspector?.cleanupAllRemnants) {
        window.YYCardInspector.cleanupAllRemnants();
    }

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
        
        let dataIndex;
        if (isSelf) {
            dataIndex = i;
        } else {
            dataIndex = i < 3 ? i + 3 : i - 3;
        }
        slot.setAttribute('data-board-index', dataIndex);
        
        if (c) {
            const el = createCardElement(c);
            if (isSelf) {
                el.setAttribute('data-board-index', i);
                el.setAttribute('data-card-type', 'board');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
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

// ========== 修复4：拖拽拦截逻辑简化，只走统一权限判断，彻底解决乱提示 ==========
function onDragStart(e, type, card, index, element) {
    // 统一权限判断，不会再乱拦截
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
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

    // 修复拖拽半透明影子
    element.style.visibility = 'hidden';

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
    // 恢复原卡牌可见性
    sourceElement.style.visibility = '';
    
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

// ==================== 业务操作修复：全部使用统一requestApi，简化逻辑，修复回滚问题 ====================
async function handleHandToBoard(handIdx, boardIdx) {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
        return;
    }
    const userId = getCurrentUserId();
    const roomId = getCurrentRoomId();
    if (!roomId || !userId) { toast('房间信息缺失', true); return; }

    const gameState = getGameState();
    const my = gameState?.players[userId];
    if (!my) return;

    // 本地预更新
    const oldHand = [...my.hand];
    const oldBoard = [...my.board];
    const card = my.hand[handIdx];
    if (!card) { toast('卡牌不存在', true); return; }
    const oldTarget = my.board[boardIdx];

    my.board[boardIdx] = card;
    my.hand[handIdx] = oldTarget || null;
    refreshAllUI();

    // 调用接口
    const result = await requestApi(PLACE_CARD_FUNCTION_URL, {
        roomId, userId, handIndex: handIdx, boardIndex: boardIdx
    });

    if (!result.success) {
        // 失败回滚
        my.hand = oldHand;
        my.board = oldBoard;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    // 成功更新
    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast(result.data.exchanged ? '交换成功' : '放置成功');
}

async function handleShopToBoard(card, shopIdx, boardIdx) {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
        return;
    }
    const userId = getCurrentUserId();
    const roomId = getCurrentRoomId();
    if (!roomId || !userId) { toast('房间信息缺失', true); return; }

    const gameState = getGameState();
    const my = gameState?.players[userId];
    if (!my) return;

    const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
    if (my.gold < price) { toast('金币不足', true); return; }

    // 本地预更新
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

    // 调用接口
    const result = await requestApi(BUY_CARD_FUNCTION_URL, {
        roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx
    });

    if (!result.success) {
        my.gold = oldGold;
        my.shopCards = oldShopCards;
        my.hand = oldHand;
        my.board = oldBoard;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast(result.data.exchanged ? '购买并交换成功' : '购买成功');
}

async function handleShopToHand(card, shopIdx) {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
        return;
    }
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

    const result = await requestApi(BUY_CARD_FUNCTION_URL, {
        roomId, userId, shopIndex: shopIdx
    });

    if (!result.success) {
        my.gold = oldGold;
        my.shopCards = oldShopCards;
        my.hand = oldHand;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast('购买成功');
}

async function handleBoardSwap(idxA, idxB) {
    if (!canOperate() || idxA === idxB) return;
    const userId = getCurrentUserId();
    const roomId = getCurrentRoomId();
    if (!roomId || !userId) { toast('房间信息缺失', true); return; }

    const gameState = getGameState();
    const my = gameState?.players[userId];
    if (!my) return;

    const oldBoard = [...my.board];
    [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
    refreshAllUI();

    const result = await requestApi(SWAP_BOARD_FUNCTION_URL, {
        roomId, userId, indexA: idxA, indexB: idxB
    });

    if (!result.success) {
        my.board = oldBoard;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast('交换成功');
}

async function handleBoardToHand(boardIdx) {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
        return;
    }
    const userId = getCurrentUserId();
    const roomId = getCurrentRoomId();
    if (!roomId || !userId) { toast('房间信息缺失', true); return; }

    const gameState = getGameState();
    const my = gameState?.players[userId];
    if (!my) return;

    const card = my.board[boardIdx];
    if (!card) { toast('该位置无卡牌', true); return; }
    const handCount = my.hand.filter(c => c !== null).length;
    const maxHand = config.HAND_MAX_COUNT || 15;
    if (handCount >= maxHand) { toast('手牌已满', true); return; }
    const emptyIdx = my.hand.findIndex(c => c === null);
    if (emptyIdx === -1) { toast('手牌已满', true); return; }

    const oldBoard = [...my.board];
    const oldHand = [...my.hand];
    my.board[boardIdx] = null;
    my.hand[emptyIdx] = card;
    refreshAllUI();

    const result = await requestApi(BOARD_TO_HAND_FUNCTION_URL, {
        roomId, userId, boardIndex: boardIdx
    });

    if (!result.success) {
        my.board = oldBoard;
        my.hand = oldHand;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast('已移回手牌');
}

async function handleSell(type, index) {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
        return;
    }
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

    const result = await requestApi(SELL_CARD_FUNCTION_URL, {
        roomId, userId, type, index
    });

    if (!result.success) {
        my.gold = oldGold;
        my.hand = oldHand;
        my.board = oldBoard;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast('出售成功');
}

async function buyExpAction() {
    if (!canOperate()) {
        toast('当前阶段不能操作', true);
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

    const result = await requestApi(BUY_EXP_FUNCTION_URL, {
        roomId, userId
    });

    if (!result.success) {
        my.gold = oldGold;
        refreshAllUI();
        toast(result.error, true);
        return;
    }

    if (result.data.updatedPlayer) {
        mergeUpdatedPlayer(my, result.data.updatedPlayer);
        updateUIAfterSuccess(result.data.updatedPlayer);
    }
    toast('升级成功');
}

// ========== 修复5：刷新商店锁死问题，加强制超时解锁，彻底解决永久禁用 ==========
async function refreshShopAction() {
    if (!canOperate()) {
        toast('只能在准备阶段刷新', true);
        return;
    }

    const userId = getCurrentUserId();
    const roomId = getCurrentRoomId();
    if (!roomId || !userId) {
        toast('房间信息缺失', true);
        return;
    }
    const gameState = getGameState();
    const my = gameState?.players[userId];
    if (!my) return;
    if (my.gold < 1) {
        toast('金币不足', true);
        return;
    }

    // 加锁+强制解锁兜底
    isRefreshingShop = true;
    updateBuyExpButtonState();
    const forceUnlockTimer = setTimeout(() => {
        isRefreshingShop = false;
        updateBuyExpButtonState();
    }, 12000);

    // 加载提示
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

    // 调用接口
    const result = await requestApi(REFRESH_SHOP_FUNCTION_URL, {
        roomId, userId
    });

    // 清理
    clearTimeout(forceUnlockTimer);
    isRefreshingShop = false;
    updateBuyExpButtonState();
    if (loadingHint && loadingHint.parentNode) loadingHint.remove();

    if (!result.success) {
        toast(result.error, true);
        return;
    }

    const latestGameState = getGameState();
    const latestMy = latestGameState?.players[userId];
    if (!latestMy) {
        toast('玩家状态异常', true);
        return;
    }

    let finalUpdatedData = {};
    if (result.data.updatedPlayer) {
        finalUpdatedData = result.data.updatedPlayer;
    } else {
        finalUpdatedData = {
            shopCards: result.data.shopCards || latestMy.shopCards,
            gold: result.data.gold !== undefined ? result.data.gold : latestMy.gold
        };
    }

    mergeUpdatedPlayer(latestMy, finalUpdatedData);
    updateUIAfterSuccess(finalUpdatedData);
    toast('刷新成功');
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

// ========== 修复6：阶段同步，和battle.js完全对齐，不会乱开禁用 ==========
function setPhase(phase) {
    // 只同步buffering模式，不再维护独立的currentPhase
    if (phase === 'buffering') {
        document.body.classList.add('buffering-mode');
    } else {
        document.body.classList.remove('buffering-mode');
    }
    // 阶段变化时刷新按钮状态
    updateBuyExpButtonState();
}

function bindUIEvents() {
    document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
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
    console.log('✅ shop.js 修复版初始化完成');
}

return {
    init,
    refreshAllUI,
    updateTimerDisplay,
    setPhase,
    toast
};
