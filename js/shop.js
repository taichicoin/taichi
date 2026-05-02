// ==================== 商店与交互系统（全接口免JWT·RPC终极适配版 + 双缓冲商店v3 + 武器/道具装备系统） ====================
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

            if (error) throw new Error(error.message || '操作执行失败');
            if (data && !data.success) throw new Error(data.error || '操作执行失败');

            return { success: true, data };
        } catch (err) {
            console.error(`函数[${functionName}]调用异常：`, err);
            return { success: false, error: err.message };
        }
    }

    function getValidAccessToken() { return null; }

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

        if (updatedPlayer.shopCards !== undefined) { if (!isDragging) renderShop(); }
        if (updatedPlayer.hand !== undefined) { if (!isDragging) renderHand(); }
        if (updatedPlayer.board !== undefined) {
            if (!isDragging) {
                renderMyBoard();
            }
        }
    }

    function toast(message, isError = false, duration = 2000) {
        // 扩展提示范围，包括装备相关提示
        const keywords = ['手牌已满', '无法交换', '只能装备', '已装备', '道具', '武器', '卸下'];
        if (!message || !keywords.some(k => message.includes(k))) return;
        
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

    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        d.setAttribute('data-card-type', cardType);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        const atkDisplay = isBoard ? `${card.atk}` : `⚔️${card.atk}`;
        const hpDisplay = isBoard ? `${card.hp}` : `🛡️${card.hp}`;
        
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
            overflow: visible !important;
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

    // 修改：增加 hasCharacter 判断
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    const gameState = getGameState();
                    const userId = getCurrentUserId();
                    const boardCard = gameState?.players?.[userId]?.board?.[parseInt(slotIndex)];
                    const hasCharacter = boardCard && boardCard.type !== 'weapon' && boardCard.type !== 'item';
                    return { zone: 'board', index: parseInt(slotIndex), hasCharacter: !!hasCharacter };
                }
            }
            if (el.id === 'hand-container' || el.closest('#hand-container')) return { zone: 'hand' };
            if (el.id === 'shop-container' || el.closest('#shop-container')) return { zone: 'shop' };
            el = el.parentElement;
        }
        return null;
    }

    // 修改：增加装备分支
    async function executeDropAction(type, index, card, dropResult) {
        // 手牌武器/道具 → 只能装备到有角色的格子
        if (type === 'hand' && (card.type === 'weapon' || card.type === 'item')) {
            if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                await handleEquipFromHand(index, dropResult.index);
            } else {
                toast('只能装备到有角色的格子上', true);
            }
            return;
        }

        // 商店武器/道具 → 拖到棋盘角色身上触发购买并装备
        if (type === 'shop' && (card.type === 'weapon' || card.type === 'item')) {
            if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                await handleEquipFromShop(card, index, dropResult.index);
            } else {
                // 商店武器/道具拖到其他区域：购买到手牌（原有逻辑）
                if (dropResult.zone === 'hand') {
                    await handleShopToHand(card, index);
                } else {
                    toast('只能装备到角色上，或拖到手牌购买', true);
                }
            }
            return;
        }

        // 原有逻辑：角色卡、手牌常规移动
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

    // ========== 装备/卸下核心函数 ==========
    
    // 从手牌装备武器/道具到棋盘角色
    async function handleEquipFromHand(handIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const card = my.hand[handIdx];
        if (!card) return;
        const targetCard = my.board[boardIdx];
        if (!targetCard || targetCard.type === 'weapon' || targetCard.type === 'item') {
            toast('只能装备到角色身上', true);
            return;
        }

        // 检查槽位可用性
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

        // 乐观更新
        const oldHand = [...my.hand];
        const oldBoard = JSON.parse(JSON.stringify(my.board));
        my.hand[handIdx] = null;
        targetCard[slotKey] = equipData;
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.EQUIP_ITEM, {
            roomId, userId,
            handIndex: handIdx,
            boardIndex: boardIdx,
            slotKey,
            equipData
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

    // 从商店直接购买并装备武器/道具到棋盘角色
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

        // 乐观更新
        const oldGold = my.gold;
        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldBoard = JSON.parse(JSON.stringify(my.board));

        my.gold -= price;
        targetCard[slotKey] = equipData;
        const shop = my.shopCards;
        const active = shop.active ?? 0;
        const group = shop.buffer[active];
        group[shopIdx] = null;

        renderMyBoard();
        renderShop();

        const result = await invokeFunction(FUNCTION_NAME_MAP.EQUIP_ITEM, {
            roomId, userId,
            shopIndex: shopIdx,
            boardIndex: boardIdx,
            slotKey,
            equipData,
            price
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

    // 卸下装备到手牌（由 inspector 或自身调用）
    async function handleUnequip(boardIdx, slotKey) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        const targetCard = my.board[boardIdx];
        if (!targetCard) return;
        const equip = targetCard[slotKey];
        if (!equip) return;

        const emptyIdx = getFirstAvailableHandSlot(my.hand);
        if (emptyIdx === -1) {
            toast('手牌已满，无法卸下', true);
            return;
        }

        // 乐观更新
        const oldHand = [...my.hand];
        const oldBoard = JSON.parse(JSON.stringify(my.board));
        targetCard[slotKey] = null;
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
            faction: '',
            skill: ''
        };
        renderMyBoard();
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.UNEQUIP_ITEM, {
            roomId, userId,
            boardIndex: boardIdx,
            slotKey
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

    // 检查角色是否有装备
    function hasEquipment(card) {
        return card && (card.weapon || card.item1 || card.item2);
    }

    // 卸下角色所有装备到手牌（内部使用，自动处理手牌上限）
    async function unequipAll(boardIdx) {
        const my = getGameState()?.players[getCurrentUserId()];
        if (!my) return false;
        const card = my.board[boardIdx];
        if (!card) return false;
        
        const slots = ['weapon', 'item1', 'item2'].filter(s => card[s] != null);
        if (slots.length === 0) return true;

        // 检查手牌空间
        const emptySlots = 15 - getValidHandCount(my.hand);
        if (emptySlots < slots.length) {
            toast(`手牌空间不足，无法卸下所有装备（需要${slots.length}个空位）`, true);
            return false;
        }

        // 依次卸下
        for (const slot of slots) {
            await handleUnequip(boardIdx, slot);
        }
        return true;
    }

    // ========== 修改原有业务：出售/移动时自动卸下装备 ==========

    // 棋盘→手牌（覆盖原函数，增加装备检测）
    const originalBoardToHand = handleBoardToHand;
    handleBoardToHand = async function(boardIdx) {
        const card = getGameState()?.players[getCurrentUserId()]?.board[boardIdx];
        if (card && hasEquipment(card)) {
            const canUnequip = await unequipAll(boardIdx);
            if (!canUnequip) return; // 手牌不足无法卸下，取消操作
        }
        return originalBoardToHand(boardIdx);
    };

    // 出售（覆盖原函数，增加装备检测）
    const originalSell = handleSell;
    handleSell = async function(type, index) {
        if (type === 'board') {
            const card = getGameState()?.players[getCurrentUserId()]?.board[index];
            if (card && hasEquipment(card)) {
                const canUnequip = await unequipAll(index);
                if (!canUnequip) return; // 卸下失败取消出售
            }
        }
        return originalSell(type, index);
    };

    // 商店→棋盘购买（如果是武器/道具则禁止，防止直接放到格子上）
    const originalShopToBoard = handleShopToBoard;
    handleShopToBoard = async function(card, shopIdx, boardIdx) {
        // 武器/道具不能直接放到棋盘上作为角色卡
        if (card.type === 'weapon' || card.type === 'item') {
            toast('武器/道具只能装备到角色身上，请拖到角色格子上', true);
            return;
        }
        return originalShopToBoard(card, shopIdx, boardIdx);
    };

    // 手牌→棋盘（禁止武器/道具直接放到棋盘上）
    const originalHandToBoard = handleHandToBoard;
    handleHandToBoard = async function(handIdx, boardIdx) {
        const card = getGameState()?.players[getCurrentUserId()]?.hand[handIdx];
        if (card && (card.type === 'weapon' || card.type === 'item')) {
            toast('武器/道具只能装备到角色身上，不能直接放到棋盘', true);
            return;
        }
        return originalHandToBoard(handIdx, boardIdx);
    };

    // ========== 基础UI绑定（不变） ==========
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
                position: relative; 
                overflow: visible !important;
                contain: none !important;
            }
            .card-drag-clone { 
                pointer-events: none !important; 
                will-change: left, top; 
                transform: translateZ(0); 
                overflow: visible !important;
            }
            .shop-area.drop-target { 
                box-shadow: 0 0 0 4px #ff4444 !important; 
                transition: box-shadow 0.1s; 
            }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { 
                pointer-events: none !important; 
                opacity: 0.6; 
            }
            .card-slot { 
                contain: layout style paint; 
                overflow: visible !important;
            }
            
            .card[data-card-type="shop"] .card-price {
                display: block !important;
                position: absolute !important;
                bottom: -18px !important;
                left: 0 !important;
                right: 0 !important;
                text-align: center !important;
                font-weight: bold !important;
                font-size: 0.8rem !important;
                z-index: 999 !important;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                color: #ffffff !important;
                text-shadow: 0 0 2px #000, 0 0 4px #000, 0 0 6px #000, 0 0 8px #000 !important;
                padding: 0 !important;
                margin: 0 !important;
                pointer-events: none !important;
                line-height: 1 !important;
            }

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
        console.log('✅ 商店系统 (含装备/卸下) 初始化完成');
    }

    // 暴露卸下接口供 inspector 调用
    return { 
        init, refreshAllUI, updateTimerDisplay, setPhase, toast,
        handleUnequip // 关键：让卡牌查看系统能卸下装备
    };
})();
