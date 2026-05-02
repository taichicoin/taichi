// ==================== 商店与交互系统（装备系统修复版） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
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
        BUY_EXP: 'buy-exp',
        EQUIP_ITEM: 'equip-item',
        UNEQUIP_ITEM: 'unequip-item'
    };

    async function invokeFunction(functionName, body = {}, options = {}) {
        const { timeout = 10000 } = options;
        const supabaseClient = getSupabaseClient();

        if (!functionName) throw new Error('函数名不能为空');
        if (!supabaseClient) throw new Error('Supabase客户端未初始化');
        
        const headers = { Authorization: '' };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const { data, error } = await supabaseClient.functions.invoke(
            functionName,
            { body, headers, signal: controller.signal }
        );

        clearTimeout(timeoutId);
        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.error || '操作失败');
        return { success: true, data };
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
            document.getElementById('my-gold').textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.health !== undefined) {
            document.getElementById('my-health').textContent = updatedPlayer.health;
            const topEl = document.getElementById('my-health-top');
            if (topEl) topEl.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopLevel !== undefined) {
            document.getElementById('shop-level').textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }

        if (!isDragging) {
            if (updatedPlayer.shopCards !== undefined) renderShop();
            if (updatedPlayer.hand !== undefined) renderHand();
            if (updatedPlayer.board !== undefined) renderMyBoard();
        }
    }

    function toast(message, isError = false, duration = 2000) {
        if (!message) return;
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

    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }
    function getSupabaseClient() { return window.supabase; }

    // ========== 渲染 ==========
    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
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

    function renderMyBoard() {
        if (isDragging) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        document.getElementById('my-board').setAttribute('data-player-id', userId);
    }

    function renderHand() {
        if (isDragging) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;
        const container = document.getElementById('hand-container');
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
        document.getElementById('hand-count').textContent = getValidHandCount(my.hand);
    }

    function renderShop() {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';

        const shop = my.shopCards;
        if (!shop?.buffer) {
            container.innerHTML = '<div style="color:#aaa;">商店暂无卡牌</div>';
            return;
        }

        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group) || group.length < 6) {
            container.innerHTML = '<div style="color:#aaa;">商店暂无卡牌</div>';
            return;
        }

        const start = sub === 0 ? 0 : 3;
        const fragment = document.createDocumentFragment();
        let hasCards = false;
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
            container.innerHTML = '<div style="color:#aaa;">商店暂无卡牌</div>';
        } else {
            container.innerHTML = '';
            container.appendChild(fragment);
        }
    }

    function refreshAllUI() {
        if (window.YYCardInspector?.cleanupAllRemnants) {
            window.YYCardInspector.cleanupAllRemnants();
        }
        if (!isDragging) {
            renderMyBoard();
            renderHand();
        }
        renderShop();

        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (my) {
            document.getElementById('my-health').textContent = my.health;
            document.getElementById('my-gold').textContent = my.gold;
            document.getElementById('shop-level').textContent = my.shopLevel;
            const topHealth = document.getElementById('my-health-top');
            if (topHealth) topHealth.textContent = my.health;
        }
        document.getElementById('round-num').textContent = gameState?.round || 1;
        updateBuyExpButtonState();
    }

    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        d.setAttribute('data-card-type', cardType);
        const imgPath = card.image || card.icon || '/assets/default-avatar.png';
        
        const atk = isBoard ? card.atk : `⚔️${card.atk}`;
        const hp = isBoard ? card.hp : `🛡️${card.hp}`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const priceHtml = cardType === 'shop' ? `<div class="card-price">💰${price}</div>` : '';
        
        d.innerHTML = `
            <div class="card-icon"><img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats"><span class="card-atk">${atk}</span><span class="card-hp">${hp}</span></div>
            ${priceHtml}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 装备系统辅助 ==========
    function hasEquipment(card) {
        return card && (card.weapon || card.item1 || card.item2);
    }

    function countEquipment(card) {
        let count = 0;
        if (card?.weapon) count++;
        if (card?.item1) count++;
        if (card?.item2) count++;
        return count;
    }

    // 卸下单个装备
    async function handleUnequip(boardIdx, slotKey) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const card = my.board[boardIdx];
        if (!card) return;
        const equip = card[slotKey];
        if (!equip) return;

        const emptyIdx = getFirstAvailableHandSlot(my.hand);
        if (emptyIdx === -1) {
            toast('手牌已满，无法卸下', true);
            return;
        }

        const oldBoard = JSON.parse(JSON.stringify(my.board));
        const oldHand = [...my.hand];

        card[slotKey] = null;
        my.hand[emptyIdx] = {
            card_id: equip.card_id,
            cardId: equip.card_id,
            name: equip.name,
            type: equip.type,
            rarity: equip.rarity || 'Common',
            base_atk: equip.atk || 0,
            base_hp: equip.hp || 0,
            atk: equip.atk || 0,
            hp: equip.hp || 0,
            image: equip.image || '',
            faction: ''
        };

        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.UNEQUIP_ITEM, {
            roomId, userId, boardIndex: boardIdx, slotKey
        });

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

    // 卸下全部装备，返回是否成功
    async function unequipAllIfNeeded(boardIdx) {
        const my = getGameState()?.players[getCurrentUserId()];
        if (!my) return false;
        const card = my.board[boardIdx];
        if (!card) return true;
        const slotsToRemove = [];
        if (card.weapon) slotsToRemove.push('weapon');
        if (card.item1) slotsToRemove.push('item1');
        if (card.item2) slotsToRemove.push('item2');
        if (slotsToRemove.length === 0) return true;

        const emptySlots = 15 - getValidHandCount(my.hand);
        if (emptySlots < slotsToRemove.length) {
            toast(`手牌空间不足，需要${slotsToRemove.length}个空位`, true);
            return false;
        }

        for (const slot of slotsToRemove) {
            await handleUnequip(boardIdx, slot);
        }
        return true;
    }

    // 从手牌装备
    async function handleEquipFromHand(handIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const equipCard = my.hand[handIdx];
        if (!equipCard) return;
        const targetCard = my.board[boardIdx];
        if (!targetCard || targetCard.type === 'weapon' || targetCard.type === 'item') {
            toast('只能装备到角色身上', true);
            return;
        }

        if (equipCard.type === 'weapon' && targetCard.weapon) {
            toast('该角色已装备武器', true);
            return;
        }
        if (equipCard.type === 'item' && targetCard.item1 && targetCard.item2) {
            toast('该角色已装备2个道具', true);
            return;
        }

        const slotKey = equipCard.type === 'weapon' ? 'weapon' : (!targetCard.item1 ? 'item1' : 'item2');
        const equipData = {
            card_id: equipCard.card_id || equipCard.cardId,
            name: equipCard.name,
            type: equipCard.type,
            atk: equipCard.base_atk ?? equipCard.atk ?? 0,
            hp: equipCard.base_hp ?? equipCard.hp ?? 0,
            image: equipCard.image,
            rarity: equipCard.rarity || 'Common'
        };

        const oldHand = [...my.hand];
        const oldBoard = JSON.parse(JSON.stringify(my.board));

        my.hand[handIdx] = null;
        targetCard[slotKey] = equipData;
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.EQUIP_ITEM, {
            roomId, userId, handIndex: handIdx, boardIndex: boardIdx, slotKey, equipData
        });

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

    // 从商店直接购买并装备
    async function handleEquipFromShop(card, shopIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const targetCard = my.board[boardIdx];
        if (!targetCard || targetCard.type === 'weapon' || targetCard.type === 'item') {
            toast('只能装备到角色身上', true);
            return;
        }

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) return;

        if (card.type === 'weapon' && targetCard.weapon) {
            toast('该角色已装备武器', true);
            return;
        }
        if (card.type === 'item' && targetCard.item1 && targetCard.item2) {
            toast('该角色已装备2个道具', true);
            return;
        }

        const slotKey = card.type === 'weapon' ? 'weapon' : (!targetCard.item1 ? 'item1' : 'item2');
        const equipData = {
            card_id: card.card_id || card.cardId,
            name: card.name,
            type: card.type,
            atk: card.base_atk ?? card.atk ?? 0,
            hp: card.base_hp ?? card.hp ?? 0,
            image: card.image,
            rarity: card.rarity || 'Common'
        };

        const oldGold = my.gold;
        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldBoard = JSON.parse(JSON.stringify(my.board));

        my.gold -= price;
        targetCard[slotKey] = equipData;
        const shop = my.shopCards;
        const group = shop.buffer[shop.active ?? 0];
        group[shopIdx] = null;

        renderMyBoard();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.EQUIP_ITEM, {
            roomId, userId, shopIndex: shopIdx, boardIndex: boardIdx, slotKey, equipData, price
        });

        if (!result.success) {
            my.gold = oldGold;
            my.board = oldBoard;
            my.shopCards = oldShopRaw;
            renderMyBoard();
            renderShop();
            return;
        }
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    // ========== 拖拽逻辑 ==========
    function onDragStart(e, type, card, index, element) {
        if (!canOperate()) return;
        e.preventDefault();
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
            opacity: 0.85; transform: scale(1.05);
            pointer-events: none; transition: none;
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
        const clone = dragState.cloneElement;
        clone.style.left = (e.clientX - clone.offsetWidth / 2) + 'px';
        clone.style.top = (e.clientY - clone.offsetHeight / 2) + 'px';
    }, 16);

    function onDragEnd(e) {
        if (!dragState.active) return;
        const { type, sourceElement, cloneElement, currentX, currentY, card, index } = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        isDragging = false;

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
                const board = el.closest('.board');
                if (board?.id === 'my-board') {
                    const slotIndex = el.getAttribute('data-slot-index');
                    if (slotIndex !== null) {
                        const gameState = getGameState();
                        const userId = getCurrentUserId();
                        const boardCard = gameState?.players?.[userId]?.board?.[parseInt(slotIndex)];
                        const hasCharacter = boardCard && boardCard.type !== 'weapon' && boardCard.type !== 'item';
                        return { zone: 'board', index: parseInt(slotIndex), hasCharacter: !!hasCharacter };
                    }
                }
            }
            if (el.id === 'hand-container' || el.closest('#hand-container')) return { zone: 'hand' };
            if (el.id === 'shop-container' || el.closest('#shop-container')) return { zone: 'shop' };
            el = el.parentElement;
        }
        return null;
    }

    async function executeDropAction(type, index, card, dropResult) {
        // 手牌中的武器/道具
        if (type === 'hand' && (card.type === 'weapon' || card.type === 'item')) {
            if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                await handleEquipFromHand(index, dropResult.index);
            } else {
                toast('武器/道具只能装备到角色身上', true);
            }
            return;
        }

        // 商店中的武器/道具
        if (type === 'shop' && (card.type === 'weapon' || card.type === 'item')) {
            if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                await handleEquipFromShop(card, index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleShopToHand(card, index);
            } else {
                toast('武器/道具可拖到手牌购买或直接装备到角色', true);
            }
            return;
        }

        // 普通角色卡流程
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

    // ========== 业务函数（增加装备检测） ==========
    // 手牌→棋盘（禁止武器/道具直接上阵）
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const card = my.hand[handIdx];
        if (!isValidCard(card)) return;
        if (card.type === 'weapon' || card.type === 'item') {
            toast('武器/道具不能直接放到棋盘，请装备到角色身上', true);
            return;
        }

        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
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

    // 棋盘→手牌（自动卸下装备）
    async function handleBoardToHand(boardIdx) {
        if (!canOperate()) return;
        const gameState = getGameState();
        const my = gameState?.players[getCurrentUserId()];
        if (!my) return;

        if (!await unequipAllIfNeeded(boardIdx)) return; // 卸下失败则取消

        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
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

    // 出售（自动卸下装备）
    async function handleSell(type, index) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        if (type === 'board') {
            if (!await unequipAllIfNeeded(index)) return;
        }

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

    // 商店→棋盘（禁止武器/道具直接购买放到棋盘上）
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        if (card.type === 'weapon' || card.type === 'item') {
            toast('武器/道具只能装备到角色身上，请拖到角色格子上', true);
            return;
        }

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) return;

        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldGold = my.gold;
        const oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];

        if (isValidCard(targetCard) && getValidHandCount(my.hand) >= 15) {
            toast('手牌已满', true);
            return;
        }

        my.gold -= price;
        const newCard = {
            ...card,
            instanceId: Date.now() + '-' + Math.random(),
            cardId: card.cardId || card.card_id || '',
            card_id: card.card_id || card.cardId || '',
            faction: card.faction || '',
            weapon: null,
            item1: null,
            item2: null
        };
        my.board[boardIdx] = newCard;
        if (isValidCard(targetCard)) {
            const emptyIdx = getFirstAvailableHandSlot(my.hand);
            if (emptyIdx !== -1) my.hand[emptyIdx] = targetCard;
        }

        const shop = my.shopCards;
        const group = shop.buffer[shop.active ?? 0];
        group[shopIdx] = null;

        renderMyBoard();
        renderHand();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx
        });

        if (!result.success) {
            my.gold = oldGold;
            my.board = oldBoard;
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

    async function handleShopToHand(card, shopIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
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

        my.gold -= price;
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
        const group = shop.buffer[shop.active ?? 0];
        group[shopIdx] = null;

        renderHand();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId, shopIndex: shopIdx
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

    async function handleBoardSwap(idxA, idxB) {
        if (!canOperate() || idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
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

    async function buyExpAction() {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
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

    async function refreshShopAction() {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;
        if (my.gold < 1) return;

        isRefreshingShop = true;
        updateBuyExpButtonState();
        const forceUnlockTimer = setTimeout(() => { isRefreshingShop = false; updateBuyExpButtonState(); }, 12000);

        const result = await invokeFunction(FUNCTION_NAME_MAP.REFRESH_SHOP, { roomId, userId });
        clearTimeout(forceUnlockTimer);
        isRefreshingShop = false;
        updateBuyExpButtonState();

        if (!result.success) return;
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
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
            }
        });
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; contain: none; }
            .card[data-card-type="shop"] .card-price {
                display: block !important; position: absolute !important; bottom: -18px; left: 0; right: 0;
                text-align: center; font-weight: bold; font-size: 0.8rem; color: #fff;
                text-shadow: 0 0 4px #000; z-index: 999; background: transparent; border: none;
            }
        `;
        document.head.appendChild(style);
    }

    let initialized = false;
    function init() {
        if (initialized) return;
        initialized = true;
        injectStyles();
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
        refreshAllUI();
        console.log('✅ 商店系统 (含装备/卸下) 已启动');
    }

    return {
        init,
        refreshAllUI,
        handleUnequip, // 供 inspector 调用
        toast,
        setPhase: (phase) => {},
        updateTimerDisplay: (seconds, phase) => {}
    };
})();
