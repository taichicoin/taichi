// ==================== 商店与交互系统（纯业务逻辑版） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let toastTimer = null;
    const domCache = {};
    let isBusy = false;
    let lastGoldChangeTime = 0;

    let forcePrepareMode = false;

    // ★ 操作锁，防止轮询在乐观操作期间覆盖本地状态
    let operationLock = false;

    const _listeners = {};
    function _emit(event, detail) {
        if (_listeners[event]) {
            _listeners[event].forEach(fn => { try { fn(detail); } catch (e) {} });
        }
    }

    function isCardInMerge(card) {
        if (!card) return false;
        return !!(window.mergeService && window.mergeService.isCardInMerge && window.mergeService.isCardInMerge(card));
    }

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
        if (forcePrepareMode) return true;
        const gameState = getGameState();
        return !!(
            gameState && 
            gameState.phase === 'prepare' && 
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
        BUY_CARD: 'buy-card',
        SWAP_BOARD: 'swap-board',
        SELL_CARD: 'sell-card',
        PLACE_CARD: 'place-card',
        BOARD_TO_HAND: 'board-to-hand',
    };

    async function invokeFunction(functionName, body = {}, options = {}) {
        const { timeout = 10000 } = options;
        const supabaseClient = getSupabaseClient();
        if (!functionName) throw new Error('函数名不能为空');
        if (!supabaseClient) throw new Error('Supabase客户端未初始化');
        const headers = { Authorization: '' };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabaseClient.functions.invoke(
                functionName,
                { body, headers, signal: controller.signal }
            );
            clearTimeout(timeoutId);
            if (error) throw new Error(error.message);
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(timeoutId);
            console.error(`函数[${functionName}]调用异常：`, err);
            return { success: false, error: err.message };
        }
    }

    async function callEquipFunction(body) {
        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('未登录');
            const url = `${supabaseClient.supabaseUrl}/functions/v1/equip-item`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    roomId: body.roomId,
                    userId: body.userId,
                    boardIndex: body.boardIndex,
                    slotKey: body.slotKey,
                    handIndex: body.handIndex ?? null,
                    shopIndex: body.shopIndex ?? null
                })
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '请求失败');
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function callUnequipFunction(body) {
        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('未登录');
            const url = `${supabaseClient.supabaseUrl}/functions/v1/unequip-item`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify(body)
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '请求失败');
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ★ loot 使用 Edge 调用
    async function callUseLootFunction(body) {
        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('未登录');
            const url = `${supabaseClient.supabaseUrl}/functions/v1/use-loot`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify(body)
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '请求失败');
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const fields = ['gold', 'exp', 'shopLevel', 'health', 'shopCards', 'isBot', 'isEliminated', 'isReady', 'hand', 'board'];
        fields.forEach(key => {
            if (updatedPlayer[key] !== undefined) {
                if (key === 'shopCards' && target.shopCards && updatedPlayer.shopCards) {
                    if (updatedPlayer.shopCards.buffer) {
                        target.shopCards.buffer = updatedPlayer.shopCards.buffer;
                    }
                } else if (key === 'board' && target.board && updatedPlayer.board) {
                    for (let i = 0; i < Math.max(target.board.length, updatedPlayer.board.length); i++) {
                        const oldCard = target.board[i];
                        const newCard = updatedPlayer.board[i];
                        if (newCard !== undefined) {
                            if (oldCard && newCard && typeof newCard === 'object') {
                                if (!('weapon' in newCard)) newCard.weapon = oldCard.weapon ?? null;
                                if (!('item1' in newCard)) newCard.item1 = oldCard.item1 ?? null;
                                if (!('item2' in newCard)) newCard.item2 = oldCard.item2 ?? null;
                            }
                            target.board[i] = newCard;
                        }
                    }
                } else {
                    target[key] = updatedPlayer[key];
                }
            }
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

        // 直接调用外部渲染模块更新界面
        if (!window._consumableDragging) {
            if (updatedPlayer.shopCards !== undefined) window.YYCardRender.renderShop();
            if (updatedPlayer.hand !== undefined) window.YYCardRender.renderHand();
            if (updatedPlayer.board !== undefined) window.YYCardRender.renderMyBoard();
        }

        if (window.mergeService) {
            window.mergeService.updateMergeGlow();
            window.mergeService.envokeMerge();
        }
    }

    // ★ UI 状态更新函数（保留给 refresh.js 调用）
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
                btn.textContent = isMaxLevel ? ' 已满级' : ` 升级 (${expNeeded}💰)`;
                btn.disabled = shouldDisable || (expNeeded > my.gold);
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
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

    function touchGold() {
        lastGoldChangeTime = Date.now();
    }

    // ========== 装备/卸下 ==========
    function canEquipTo(boardIdx) {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return { ok: false, reason: '游戏状态异常' };
        const targetCard = my.board[boardIdx];
        if (!targetCard || !isValidCard(targetCard)) {
            return { ok: false, reason: '目标格子没有角色卡' };
        }
        if (targetCard.type === 'weapon' || targetCard.type === 'item') {
            return { ok: false, reason: '目标不是角色卡' };
        }
        if (isCardInMerge(targetCard)) {
            return { ok: false, reason: '该卡牌正在参与合成，无法装备' };
        }
        return { ok: true, targetCard };
    }

    // ★ 已加锁
    async function equipFromHand(handIdx, boardIdx) {
        if (!canOperate() || operationLock) return false;
        operationLock = true;
        try {
            const my = getGameState()?.players[getCurrentUserId()];
            if (!my) return false;

            const equipCard = my.hand[handIdx];
            if (!equipCard || (equipCard.type !== 'weapon' && equipCard.type !== 'item')) {
                toast('手牌中不是武器或道具', true);
                return false;
            }

            if (isCardInMerge(equipCard)) {
                toast('该卡牌正在参与合成，无法使用', true);
                return false;
            }

            const targetCheck = canEquipTo(boardIdx);
            if (!targetCheck.ok) {
                toast(targetCheck.reason, true);
                return false;
            }
            const targetCard = targetCheck.targetCard;
            const slotKey = equipCard.type === 'weapon' ? 'weapon' : (!targetCard.item1 ? 'item1' : 'item2');

            const oldHand = [...my.hand];
            my.hand[handIdx] = null;
            window.YYCardRender.renderHand();

            _emit('equip');

            const result = await callEquipFunction({
                roomId: getCurrentRoomId(),
                userId: getCurrentUserId(),
                boardIndex: boardIdx,
                slotKey: slotKey,
                handIndex: handIdx
            });

            if (!result.success) {
                my.hand = oldHand;
                window.YYCardRender.renderHand();
                toast('装备失败: ' + (result.error || '未知错误'), true);
                return false;
            }

            if (result.updatedPlayer) {
                mergeUpdatedPlayer(my, result.updatedPlayer);
                updateUIAfterSuccess(result.updatedPlayer);
            }
            toast(`${equipCard.name} 已装备`);
            return true;
        } finally {
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function equipFromShop(shopIdx, boardIdx) {
        if (!canOperate() || operationLock) return false;
        operationLock = true;
        try {
            const my = getGameState()?.players[getCurrentUserId()];
            if (!my) return false;

            const shop = my.shopCards;
            if (!shop?.buffer) return false;
            const active = shop.active ?? 0;
            const group = shop.buffer[active];
            if (!group || !group[shopIdx]) {
                toast('商店卡牌不存在', true);
                return false;
            }
            const shopCard = group[shopIdx];
            if (!shopCard || (shopCard.type !== 'weapon' && shopCard.type !== 'item')) {
                toast('商店中不是武器或道具', true);
                return false;
            }

            const targetCheck = canEquipTo(boardIdx);
            if (!targetCheck.ok) {
                toast(targetCheck.reason, true);
                return false;
            }
            const targetCard = targetCheck.targetCard;
            const slotKey = shopCard.type === 'weapon' ? 'weapon' : (!targetCard.item1 ? 'item1' : 'item2');

            const oldGold = my.gold;
            const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
            const price = (config.ECONOMY?.CARD_PRICE?.[shopCard.rarity]?.buy) || 1;
            if (my.gold < price) { toast('金币不足', true); return false; }
            my.gold -= price;
            touchGold();
            group[shopIdx] = null;
            window.YYCardRender.renderShop();

            _emit('equip');

            const result = await callEquipFunction({
                roomId: getCurrentRoomId(),
                userId: getCurrentUserId(),
                boardIndex: boardIdx,
                slotKey: slotKey,
                shopIndex: shopIdx
            });

            if (!result.success) {
                my.gold = oldGold;
                my.shopCards = oldShopRaw;
                window.YYCardRender.renderShop();
                toast('购买装备失败: ' + (result.error || '未知错误'), true);
                return false;
            }

            if (result.updatedPlayer) {
                mergeUpdatedPlayer(my, result.updatedPlayer);
                updateUIAfterSuccess(result.updatedPlayer);
            }
            toast(`${shopCard.name} 已购买并装备`);
            return true;
        } finally {
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleUnequip(boardIdx, slotKey, skipMergeCheck = false) {
        if (!canOperate() || operationLock) return false;
        operationLock = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            const gameState = getGameState();
            const my = gameState?.players[userId];
            if (!my) return false;

            const card = my.board[boardIdx];
            if (!card) return false;
            if (!skipMergeCheck && isCardInMerge(card)) {
                toast('该卡牌正在参与合成，无法卸下装备', true);
                return false;
            }

            const equip = card[slotKey];
            if (!equip) return false;

            const emptyIdx = getFirstAvailableHandSlot(my.hand);
            if (emptyIdx === -1) {
                toast('手牌已满，无法卸下', true);
                return false;
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
                faction: '',
                star: equip.star || 0
            };

            window.YYCardRender.renderMyBoard();
            window.YYCardRender.renderHand();

            _emit('equip');

            const result = await callUnequipFunction({
                roomId, userId,
                boardIndex: boardIdx,
                slotKey
            });

            if (!result.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();
                toast('卸下失败', true);
                return false;
            }
            if (result.updatedPlayer) {
                mergeUpdatedPlayer(my, result.updatedPlayer);
                updateUIAfterSuccess(result.updatedPlayer);
            }
            toast(`${equip.name} 已卸下`);
            return true;
        } finally {
            operationLock = false;
        }
    }

    // ========== 拖拽执行回调（供 drag.js 调用） ==========
    async function executeDropAction(type, index, dropResult) {
        if (type === 'hand') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const card = gameState?.players[userId]?.hand[index];
            if (!card) return;

            // ★ loot 牌处理
            if (card.type === 'loot') {
                if (dropResult.zone === 'board') {
                    if (dropResult.hasCharacter) {
                        // 拖到角色上 → 使用
                        await useLootOnCharacter(index, dropResult.index);
                    } else {
                        // 拖到空格 → 直接上场（复用角色放置逻辑）
                        await handleHandToBoard(index, dropResult.index);
                    }
                } else if (dropResult.zone === 'shop') {
                    // 出售
                    await handleSell('hand', index);
                } else {
                    toast('亡魂碎片只能放到棋盘上或出售', true);
                }
                return;
            }

            // 武器/道具处理
            if (card.type === 'weapon' || card.type === 'item') {
                if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                    await equipFromHand(index, dropResult.index);
                } else if (dropResult.zone === 'shop') {
                    await handleSell('hand', index);
                } else {
                    toast('武器/道具只能装备到角色身上，或拖到商店出售', true);
                }
                return;
            }
        }

        if (type === 'shop') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const shop = gameState?.players[userId]?.shopCards;
            const active = shop?.active ?? 0;
            const card = shop?.buffer?.[active]?.[index];
            if (card && (card.type === 'weapon' || card.type === 'item')) {
                if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                    await equipFromShop(index, dropResult.index);
                } else if (dropResult.zone === 'hand') {
                    await handleShopToHand(card, index);
                } else {
                    toast('武器/道具可拖到手牌购买或直接装备到角色', true);
                }
                return;
            }
        }

        if (type === 'hand') {
            if (dropResult.zone === 'board') await handleHandToBoard(index, dropResult.index);
            else if (dropResult.zone === 'shop') await handleSell('hand', index);
        } else if (type === 'board') {
            if (dropResult.zone === 'board') await handleBoardSwap(index, dropResult.index);
            else if (dropResult.zone === 'hand') await handleBoardToHand(index);
            else if (dropResult.zone === 'shop') await handleSell('board', index);
        } else if (type === 'shop') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const shop = gameState?.players[userId]?.shopCards;
            const active = shop?.active ?? 0;
            const card = shop?.buffer?.[active]?.[index];
            if (dropResult.zone === 'board') await handleShopToBoard(card, index, dropResult.index);
            else if (dropResult.zone === 'hand') await handleShopToHand(card, index);
        }
    }

    // ★ loot 使用函数（已加锁）
    async function useLootOnCharacter(handIdx, boardIdx) {
        if (!canOperate() || operationLock) return;
        operationLock = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            const gameState = getGameState();
            const my = gameState?.players[userId];
            if (!my) return;

            const lootCard = my.hand[handIdx];
            if (!lootCard || lootCard.type !== 'loot') {
                toast('不是亡魂碎片', true);
                return;
            }

            const targetCard = my.board[boardIdx];
            if (!isValidCard(targetCard) || targetCard.type === 'weapon' || targetCard.type === 'item') {
                toast('只能对角色牌使用', true);
                return;
            }

            if (isCardInMerge(targetCard)) {
                toast('目标卡牌正在参与合成，无法使用', true);
                return;
            }

            const oldHand = [...my.hand];
            const oldBoard = JSON.parse(JSON.stringify(my.board));

            // 乐观更新：删除手牌，增加目标属性
            my.hand[handIdx] = null;
            targetCard.atk = (targetCard.atk || 0) + (lootCard.atk || 0);
            targetCard.hp = (targetCard.hp || 0) + (lootCard.hp || 0);
            if (targetCard.baseAtk !== undefined) targetCard.baseAtk = (targetCard.baseAtk || 0) + (lootCard.atk || 0);
            if (targetCard.baseHp !== undefined) targetCard.baseHp = (targetCard.baseHp || 0) + (lootCard.hp || 0);

            window.YYCardRender.renderHand();
            window.YYCardRender.renderMyBoard();

            const result = await callUseLootFunction({
                roomId, userId,
                boardIndex: boardIdx,
                handIndex: handIdx
            });

            if (!result.success) {
                my.hand = oldHand;
                my.board = oldBoard;
                window.YYCardRender.renderHand();
                window.YYCardRender.renderMyBoard();
                toast('使用失败: ' + (result.error || '未知错误'), true);
            } else {
                if (result.updatedPlayer) {
                    mergeUpdatedPlayer(my, result.updatedPlayer);
                    updateUIAfterSuccess(result.updatedPlayer);
                }
                toast('亡魂碎片已吸收');
            }
        } finally {
            operationLock = false;
        }
    }

    // ========== 业务操作（均加锁） ==========

    // ★ 已加锁
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate() || operationLock) return;
        operationLock = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            if (!roomId || !userId) return;
            const gameState = getGameState();
            const my = gameState?.players[userId];
            if (!my) return;

            const card = my.hand[handIdx];
            if (!isValidCard(card)) return;
            if (isCardInMerge(card)) {
                toast('该卡牌正在参与合成，无法移动', true);
                return;
            }
            if (card.type === 'weapon' || card.type === 'item') {
                toast('武器/道具不能直接放到棋盘，请装备到角色身上', true);
                return;
            }

            const oldHand = [...my.hand];
            const oldBoard = [...my.board];
            const oldTarget = my.board[boardIdx];

            if (isValidCard(oldTarget) && isCardInMerge(oldTarget)) {
                toast('目标位置的卡牌正在参与合成，无法替换', true);
                return;
            }

            if (isValidCard(oldTarget) && getValidHandCount(my.hand) >= 15) {
                toast('手牌已满，无法交换', true);
                return;
            }

            my.board[boardIdx] = card;
            my.hand[handIdx] = oldTarget || null;
            window.YYCardRender.renderMyBoard();
            window.YYCardRender.renderHand();

            if (isValidCard(oldTarget)) {
                if ( (oldTarget.weapon && isValidCard(oldTarget.weapon)) ||
                     (oldTarget.item1  && isValidCard(oldTarget.item1))  ||
                     (oldTarget.item2  && isValidCard(oldTarget.item2)) ) {
                    _emit('equip');
                }
            }

            _emit('pickup');

            const result = await invokeFunction(FUNCTION_NAME_MAP.PLACE_CARD, { roomId, userId, handIndex: handIdx, boardIndex: boardIdx });
            if (!result.success) {
                my.hand = oldHand;
                my.board = oldBoard;
                window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();
                return;
            }
            if (result.data.updatedPlayer) {
                mergeUpdatedPlayer(my, result.data.updatedPlayer);
                updateUIAfterSuccess(result.data.updatedPlayer);
            }
        } finally {
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate() || isBusy || operationLock) return;
        operationLock = true;
        isBusy = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            if (!roomId || !userId) return;
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
            const oldHand = [...my.hand];
            const oldBoard = [...my.board];
            const targetCard = my.board[boardIdx];

            if (isValidCard(targetCard) && isCardInMerge(targetCard)) {
                toast('目标卡牌正在参与合成，无法替换', true);
                return;
            }

            if (isValidCard(targetCard) && getValidHandCount(my.hand) >= 15) {
                toast('手牌已满，无法交换', true);
                return;
            }

            const realIndex = shopIdx;

            my.gold -= price;
            touchGold();
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
            const active = shop.active ?? 0;
            const group = shop.buffer[active];
            group[realIndex] = null;

            window.YYCardRender.renderMyBoard();
            window.YYCardRender.renderHand();
            window.YYCardRender.renderShop();

            _emit('pickup');

            if (isValidCard(targetCard)) {
                if ( (targetCard.weapon && isValidCard(targetCard.weapon)) ||
                     (targetCard.item1  && isValidCard(targetCard.item1))  ||
                     (targetCard.item2  && isValidCard(targetCard.item2)) ) {
                    _emit('equip');
                }
            }

            const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
                roomId, userId,
                shopIndex: realIndex,
                targetBoardIndex: boardIdx,
                active: active
            });

            if (!result.success) {
                my.gold = oldGold;
                my.board = oldBoard;
                my.hand = oldHand;
                my.shopCards = oldShopRaw;
                window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();
                window.YYCardRender.renderShop();
            } else {
                if (result.data.updatedPlayer) {
                    mergeUpdatedPlayer(my, result.data.updatedPlayer);
                    updateUIAfterSuccess(result.data.updatedPlayer);
                }
            }
        } finally {
            isBusy = false;
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleShopToHand(card, shopIdx) {
        if (!canOperate() || isBusy || operationLock) return;
        operationLock = true;
        isBusy = true;
        try {
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
            touchGold();
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

            window.YYCardRender.renderHand();
            window.YYCardRender.renderShop();

            _emit('pickup');

            const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
                roomId, userId,
                shopIndex: realIndex,
                active: active
            });

            if (!result.success) {
                my.gold = oldGold;
                my.shopCards = oldShopRaw;
                my.hand = oldHand;
                window.YYCardRender.renderHand();
                window.YYCardRender.renderShop();
            } else {
                if (result.data.updatedPlayer) {
                    mergeUpdatedPlayer(my, result.data.updatedPlayer);
                    updateUIAfterSuccess(result.data.updatedPlayer);
                }
            }
        } finally {
            isBusy = false;
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleBoardSwap(idxA, idxB) {
        if (!canOperate() || operationLock || idxA === idxB) return;
        operationLock = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            if (!roomId || !userId) return;
            const gameState = getGameState();
            const my = gameState?.players[userId];
            if (!my) return;

            const cardA = my.board[idxA];
            const cardB = my.board[idxB];
            if (isCardInMerge(cardA) || isCardInMerge(cardB)) {
                toast('该卡牌正在参与合成，无法交换', true);
                return;
            }

            const oldBoard = [...my.board];
            [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
            window.YYCardRender.renderMyBoard();

            _emit('pickup');

            const result = await invokeFunction(FUNCTION_NAME_MAP.SWAP_BOARD, { roomId, userId, indexA: idxA, indexB: idxB });
            if (!result.success) {
                my.board = oldBoard;
                window.YYCardRender.renderMyBoard();
                return;
            }
            if (result.data.updatedPlayer) {
                mergeUpdatedPlayer(my, result.data.updatedPlayer);
                updateUIAfterSuccess(result.data.updatedPlayer);
            }
        } finally {
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleBoardToHand(boardIdx) {
        if (!canOperate() || operationLock) return;
        operationLock = true;
        try {
            const gameState = getGameState();
            const my = gameState?.players[getCurrentUserId()];
            if (!my) return;

            const card = my.board[boardIdx];
            if (!isValidCard(card)) return;

            if (isCardInMerge(card)) {
                toast('该卡牌正在参与合成，无法移动', true);
                return;
            }

            const equipment = [];
            if (card.weapon) equipment.push({ slot: 'weapon', equip: card.weapon });
            if (card.item1) equipment.push({ slot: 'item1', equip: card.item1 });
            if (card.item2) equipment.push({ slot: 'item2', equip: card.item2 });

            const neededSlots = equipment.length + 1;
            const emptySlots = 15 - getValidHandCount(my.hand);
            if (emptySlots < neededSlots) {
                toast(`手牌空间不足（需${neededSlots}空位）`, true);
                return;
            }

            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            const oldBoard = JSON.parse(JSON.stringify(my.board));
            const oldHand = JSON.parse(JSON.stringify(my.hand));

            let handIdx = getFirstAvailableHandSlot(my.hand);
            for (const eq of equipment) {
                my.hand[handIdx] = {
                    card_id: eq.equip.card_id,
                    cardId: eq.equip.card_id,
                    name: eq.equip.name,
                    type: eq.equip.type,
                    rarity: eq.equip.rarity || 'Common',
                    base_atk: eq.equip.atk || 0,
                    base_hp: eq.equip.hp || 0,
                    atk: eq.equip.atk || 0,
                    hp: eq.equip.hp || 0,
                    image: eq.equip.image || '',
                    faction: '',
                    star: eq.equip.star || 0
                };
                card[eq.slot] = null;
                handIdx = getFirstAvailableHandSlot(my.hand);

                _emit('equip');
            }
            my.board[boardIdx] = null;
            my.hand[handIdx] = card;
            window.YYCardRender.renderMyBoard();
            window.YYCardRender.renderHand();

            for (const eq of equipment) {
                const res = await callUnequipFunction({
                    roomId, userId,
                    boardIndex: boardIdx,
                    slotKey: eq.slot
                });
                if (!res.success) {
                    my.board = oldBoard;
                    my.hand = oldHand;
                    window.YYCardRender.renderMyBoard();
                    window.YYCardRender.renderHand();
                    toast('卸下装备失败，移动取消', true);
                    return;
                }
            }

            const moveResult = await invokeFunction(FUNCTION_NAME_MAP.BOARD_TO_HAND, {
                roomId, userId,
                boardIndex: boardIdx
            });
            if (!moveResult.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();
                toast('移动失败，请重试', true);
                return;
            }
            if (moveResult.data.updatedPlayer) {
                mergeUpdatedPlayer(my, moveResult.data.updatedPlayer);
                updateUIAfterSuccess(moveResult.data.updatedPlayer);
            }
        } finally {
            operationLock = false;
        }
    }

    // ★ 已加锁
    async function handleSell(type, index) {
        if (!canOperate() || operationLock) return;
        if (isBusy) return;
        operationLock = true;
        isBusy = true;
        try {
            const userId = getCurrentUserId();
            const roomId = getCurrentRoomId();
            const gameState = getGameState();
            const my = gameState?.players[userId];
            if (!my) return;

            let card;
            if (type === 'board') {
                card = my.board[index];
            } else {
                card = my.hand[index];
            }

            // ★ 消耗牌不允许出售
            if (card && (card.type === 'consumable' || card.isConsumable)) {
                toast('消耗牌无法出售，只能使用', true);
                return;
            }

            // ★ loot 牌固定售价 1 金币
            if (card && card.type === 'loot') {
                const sellPrice = 1; // 固定价格
                const oldGold = my.gold;
                const oldHand = [...my.hand];
                const oldBoard = JSON.parse(JSON.stringify(my.board));

                if (type === 'board') {
                    // 棋盘上的 loot 牌（如果之前上场了）也能出售
                    if (!isValidCard(card)) return;
                    my.board[index] = null;
                } else {
                    if (!isValidCard(card)) return;
                    my.hand[index] = null;
                }
                my.gold += sellPrice;
                touchGold();
                if (type === 'board') window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();

                _emit('sell');

                const result = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, { roomId, userId, type, index });
                if (!result.success) {
                    my.gold = oldGold;
                    if (type === 'board') my.board = oldBoard;
                    else my.hand = oldHand;
                    if (type === 'board') window.YYCardRender.renderMyBoard();
                    window.YYCardRender.renderHand();
                    toast('出售失败', true);
                } else {
                    if (result.data.updatedPlayer) {
                        mergeUpdatedPlayer(my, result.data.updatedPlayer);
                        updateUIAfterSuccess(result.data.updatedPlayer);
                    }
                }
                return;
            }

            // 以下为原有出售逻辑（非 loot）
            if (type === 'board') {
                if (!isValidCard(card)) return;
                if (isCardInMerge(card)) {
                    toast('该卡牌正在参与合成，无法出售', true);
                    return;
                }

                const equipment = [];
                if (card.weapon) equipment.push({ slot: 'weapon', equip: card.weapon });
                if (card.item1) equipment.push({ slot: 'item1', equip: card.item1 });
                if (card.item2) equipment.push({ slot: 'item2', equip: card.item2 });

                const neededSlots = equipment.length;
                const emptySlots = 15 - getValidHandCount(my.hand);
                if (neededSlots > emptySlots) {
                    toast(`手牌空间不足，无法出售（需${neededSlots}空位）`, true);
                    return;
                }

                const sellPrice = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
                const oldGold = my.gold;
                const oldHand = JSON.parse(JSON.stringify(my.hand));
                const oldBoard = JSON.parse(JSON.stringify(my.board));

                let handIdx = getFirstAvailableHandSlot(my.hand);
                for (const eq of equipment) {
                    my.hand[handIdx] = {
                        card_id: eq.equip.card_id,
                        cardId: eq.equip.card_id,
                        name: eq.equip.name,
                        type: eq.equip.type,
                        rarity: eq.equip.rarity || 'Common',
                        base_atk: eq.equip.atk || 0,
                        base_hp: eq.equip.hp || 0,
                        atk: eq.equip.atk || 0,
                        hp: eq.equip.hp || 0,
                        image: eq.equip.image || '',
                        faction: '',
                        star: eq.equip.star || 0
                    };
                    card[eq.slot] = null;
                    handIdx = getFirstAvailableHandSlot(my.hand);

                    _emit('equip');
                }
                my.board[index] = null;
                my.gold += sellPrice;
                touchGold();
                window.YYCardRender.renderMyBoard();
                window.YYCardRender.renderHand();

                _emit('sell');

                for (const eq of equipment) {
                    const res = await callUnequipFunction({
                        roomId, userId,
                        boardIndex: index,
                        slotKey: eq.slot
                    });
                    if (!res.success) {
                        my.gold = oldGold;
                        my.hand = oldHand;
                        my.board = oldBoard;
                        window.YYCardRender.renderMyBoard();
                        window.YYCardRender.renderHand();
                        toast('卸下装备失败，出售取消', true);
                        return;
                    }
                }

                const sellResult = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, {
                    roomId, userId,
                    type: 'board',
                    index
                });
                if (!sellResult.success) {
                    my.gold = oldGold;
                    my.hand = oldHand;
                    my.board = oldBoard;
                    window.YYCardRender.renderMyBoard();
                    window.YYCardRender.renderHand();
                    toast('出售失败，请重试', true);
                } else {
                    if (sellResult.data.updatedPlayer) {
                        mergeUpdatedPlayer(my, sellResult.data.updatedPlayer);
                        updateUIAfterSuccess(sellResult.data.updatedPlayer);
                    }
                }
                return;
            }

            // 手牌出售（非 loot）
            if (!isValidCard(card)) return;
            if (isCardInMerge(card)) {
                toast('该卡牌正在参与合成，无法出售', true);
                return;
            }

            const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
            const oldGold = my.gold;
            const oldHand = [...my.hand];

            my.hand[index] = null;
            my.gold += price;
            touchGold();
            window.YYCardRender.renderHand();

            _emit('sell');

            const result = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, { roomId, userId, type: 'hand', index });
            if (!result.success) {
                my.gold = oldGold;
                my.hand = oldHand;
                window.YYCardRender.renderHand();
            } else {
                if (result.data.updatedPlayer) {
                    mergeUpdatedPlayer(my, result.data.updatedPlayer);
                    updateUIAfterSuccess(result.data.updatedPlayer);
                }
            }
        } finally {
            isBusy = false;
            operationLock = false;
        }
    }

    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') { timerEl.textContent = `⏳ ${seconds}`; return; }
            timerEl.textContent = `${seconds}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) battleTimerEl.textContent = (phase === 'battle') ? seconds : '00:00';
    }

    function setPhase(phase) {
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
        updateBuyExpButtonState();
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;

        // ★ 重磅加码：不管外面的 CSS 写了什么边距，这里强制把 .card 的边框全部干掉！
        style.textContent = `
            .card, .card[data-rarity], .card[data-star] {
                border: none !important;
                border-width: 0 !important;
                border-color: transparent !important;
                outline: none !important;
                box-shadow: none !important;
            }
            .card { touch-action: none; user-select: none; -webkit-user-select: none; contain: none; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; transform: translateZ(0); }
            .drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .card[data-card-type="shop"] .card-price {
                display: block !important; position: absolute !important; bottom: -18px; left: 0; right: 0;
                text-align: center; font-weight: bold; font-size: 0.8rem; color: #fff;
                text-shadow: 0 0 4px #000; z-index: 999; background: transparent; border: none;
            }
        `;
        document.head.appendChild(style);
    }

    async function init() {
        injectStyles();
        // 加载卡牌配置 (使用外部模块)
        if (window.YYCardRender && window.YYCardRender.loadCardConfig) {
            await window.YYCardRender.loadCardConfig();
        }
        // 刷新 UI (使用外部模块)
        if (window.YYCardRender && window.YYCardRender.refreshAllUI) {
            window.YYCardRender.refreshAllUI();
        }

        if (window.YYCardShopRefresh) {
            window.YYCardShopRefresh.init({
                canOperate,
                mergeUpdatedPlayer,
                updateUIAfterSuccess,
                renderShop: window.YYCardRender.renderShop,
                renderHand: window.YYCardRender.renderHand,
                renderMyBoard: window.YYCardRender.renderMyBoard,
                updateBuyExpButtonState,
                getGameState,
                getCurrentUserId,
                getCurrentRoomId,
                toast,
            });
        }

        console.log('✅ 商店系统 (核心) 已启动，渲染/交互已剥离');
    }

    return {
        init,
        // 公开业务操作，供外部（拖拽模块）调用
        executeDropAction,
        handleUnequip,
        toast,
        setPhase,
        updateTimerDisplay,
        // 暴露渲染接口，由外部模块代理
        refreshAllUI: window.YYCardRender.refreshAllUI,
        renderMyBoard: window.YYCardRender.renderMyBoard,
        renderHand: window.YYCardRender.renderHand,
        renderShop: window.YYCardRender.renderShop,
        on: (event, fn) => {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },
        get isRefreshing() { return window.YYCardShopRefresh?.isRefreshing || false; },
        get isBusy() { return isBusy; },
        getLastGoldChangeTime: () => lastGoldChangeTime,
        setForcePrepareMode: (val) => { forcePrepareMode = val; },
        getForcePrepareMode: () => forcePrepareMode,
        get operationLock() { return operationLock; },
        set operationLock(val) { operationLock = val; }
    };
})();
