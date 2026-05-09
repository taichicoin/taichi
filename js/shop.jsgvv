// ==================== 商店与交互系统（武器自动替换乐观更新修复 + 合成触发） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let toastTimer = null;
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
        BUY_EXP: 'buy-exp'
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
                body: JSON.stringify(body)
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

    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const fields = ['gold', 'exp', 'shopLevel', 'health', 'shopCards', 'isBot', 'isEliminated', 'isReady', 'hand', 'board'];
        fields.forEach(key => {
            if (updatedPlayer[key] !== undefined) {
                if (key === 'board' && target.board && updatedPlayer.board) {
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

        if (!isDragging) {
            if (updatedPlayer.shopCards !== undefined) renderShop();
            if (updatedPlayer.hand !== undefined) renderHand();
            if (updatedPlayer.board !== undefined) renderMyBoard();
        }

        // ✅ 合成触发
        if (window.mergeService) {
            window.mergeService.updateMergeGlow();
            window.mergeService.envokeMerge();
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
    function renderMyBoard() {
        if (isDragging) return;
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        document.getElementById('my-board').setAttribute('data-player-id', userId);
    }

    function renderHand() {
        if (isDragging) return;
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
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
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('shop-container');
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
                document.getElementById('my-health').textContent = my.health;
                document.getElementById('my-gold').textContent = my.gold;
                document.getElementById('shop-level').textContent = my.shopLevel;
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            document.getElementById('round-num').textContent = gameState.round;
            updateBuyExpButtonState();
        }

        // ✅ 合成检测
        if (window.mergeService) {
            window.mergeService.updateMergeGlow();
            window.mergeService.envokeMerge();
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

    // ========== 装备系统 ==========
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
        return { ok: true, targetCard };
    }

    // ★ 从手牌装备（武器自动替换，道具不可，乐观更新修正）
    async function equipFromHand(handIdx, boardIdx) {
        if (!canOperate()) return false;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const my = gameState?.players[userId];
        if (!my) return false;

        const equipCard = my.hand[handIdx];
        if (!equipCard || (equipCard.type !== 'weapon' && equipCard.type !== 'item')) {
            toast('手牌中不是武器或道具', true);
            return false;
        }

        const targetCheck = canEquipTo(boardIdx);
        if (!targetCheck.ok) {
            toast(targetCheck.reason, true);
            return false;
        }
        const targetCard = targetCheck.targetCard;

        // 道具不能自动替换
        if (equipCard.type === 'item' && targetCard.item1 && targetCard.item2) {
            toast('该角色已装备2个道具，请手动卸下后再装', true);
            return false;
        }

        // 确定槽位
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

        // 保存最原始的状态，用于任何失败时回滚
        const oldHand = JSON.parse(JSON.stringify(my.hand));
        const oldBoard = JSON.parse(JSON.stringify(my.board));

        // --- 开始乐观更新 ---
        // 1. 如果有旧武器，先卸下到手牌空位
        if (equipCard.type === 'weapon' && targetCard.weapon) {
            const oldWeapon = targetCard.weapon;
            const emptyIdx = getFirstAvailableHandSlot(my.hand);
            if (emptyIdx === -1) {
                toast('手牌已满，无法卸下旧武器', true);
                return false;
            }
            targetCard.weapon = null;
            my.hand[emptyIdx] = {
                card_id: oldWeapon.card_id,
                cardId: oldWeapon.card_id,
                name: oldWeapon.name,
                type: oldWeapon.type,
                rarity: oldWeapon.rarity || 'Common',
                base_atk: oldWeapon.atk || 0,
                base_hp: oldWeapon.hp || 0,
                atk: oldWeapon.atk || 0,
                hp: oldWeapon.hp || 0,
                image: oldWeapon.image || '',
                faction: ''
            };
        }

        // 2. 将新武器/道具从手牌移除，装到目标卡上
        let currentHandIdx = -1;
        for (let i = 0; i < my.hand.length; i++) {
            const c = my.hand[i];
            if (c && (c.card_id === equipCard.card_id) && c.name === equipCard.name && c.type === equipCard.type) {
                currentHandIdx = i;
                break;
            }
        }
        if (currentHandIdx === -1) { // 容错：如果找不到，回滚并报错
            my.hand = oldHand;
            my.board = oldBoard;
            toast('装备数据异常，请刷新', true);
            return false;
        }
        my.hand[currentHandIdx] = null;
        targetCard[slotKey] = equipData;
        // 立即刷新UI
        renderMyBoard();
        renderHand();

        // --- 调用后端 ---
        // 如果有旧武器需要卸下，先调用卸下接口
        if (equipCard.type === 'weapon' && oldBoard[boardIdx]?.weapon) {
            const unequipRes = await callUnequipFunction({
                roomId, userId,
                boardIndex: boardIdx,
                slotKey: 'weapon'
            });
            if (!unequipRes.success) {
                // 回滚全部
                my.hand = oldHand;
                my.board = oldBoard;
                renderMyBoard();
                renderHand();
                toast('替换武器失败: ' + (unequipRes.error || '未知错误'), true);
                return false;
            }
        }

        // 调用装备接口
        const result = await callEquipFunction({
            roomId, userId,
            handIndex: currentHandIdx,
            boardIndex: boardIdx,
            slotKey,
            equipData
        });

        if (!result.success) {
            my.hand = oldHand;
            my.board = oldBoard;
            renderMyBoard();
            renderHand();
            toast('装备失败: ' + (result.error || '未知错误'), true);
            return false;
        }

        if (result.updatedPlayer) {
            mergeUpdatedPlayer(my, result.updatedPlayer);
            updateUIAfterSuccess(result.updatedPlayer);
        }
        toast(`${equipCard.name} 已装备`);
        return true;
    }

    // ★ 从商店购买并装备（武器自动替换，道具不可，乐观更新修正）
    async function equipFromShop(shopIdx, boardIdx) {
        if (!canOperate()) return false;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const my = gameState?.players[userId];
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

        const price = (config.ECONOMY?.CARD_PRICE?.[shopCard.rarity]?.buy) || 1;
        if (my.gold < price) {
            toast('金币不足', true);
            return false;
        }

        // 道具不能自动替换
        if (shopCard.type === 'item' && targetCard.item1 && targetCard.item2) {
            toast('该角色已装备2个道具，请手动卸下后再装', true);
            return false;
        }

        const slotKey = shopCard.type === 'weapon' ? 'weapon' : (!targetCard.item1 ? 'item1' : 'item2');
        const equipData = {
            card_id: shopCard.card_id || shopCard.cardId,
            name: shopCard.name,
            type: shopCard.type,
            atk: shopCard.base_atk ?? shopCard.atk ?? 0,
            hp: shopCard.base_hp ?? shopCard.hp ?? 0,
            image: shopCard.image,
            rarity: shopCard.rarity || 'Common'
        };

        // 保存最原始状态
        const oldGold = my.gold;
        const oldShopRaw = JSON.parse(JSON.stringify(my.shopCards));
        const oldBoard = JSON.parse(JSON.stringify(my.board));
        const oldHand = JSON.parse(JSON.stringify(my.hand));

        // --- 乐观更新 ---
        // 1. 如果角色有旧武器，卸下到手牌
        if (shopCard.type === 'weapon' && targetCard.weapon) {
            const oldWeapon = targetCard.weapon;
            const emptyIdx = getFirstAvailableHandSlot(my.hand);
            if (emptyIdx === -1) {
                toast('手牌已满，无法卸下旧武器', true);
                return false;
            }
            targetCard.weapon = null;
            my.hand[emptyIdx] = {
                card_id: oldWeapon.card_id,
                cardId: oldWeapon.card_id,
                name: oldWeapon.name,
                type: oldWeapon.type,
                rarity: oldWeapon.rarity || 'Common',
                base_atk: oldWeapon.atk || 0,
                base_hp: oldWeapon.hp || 0,
                atk: oldWeapon.atk || 0,
                hp: oldWeapon.hp || 0,
                image: oldWeapon.image || '',
                faction: ''
            };
        }

        // 2. 扣金币，从商店移除卡牌，装备新武器/道具
        my.gold -= price;
        targetCard[slotKey] = equipData;
        group[shopIdx] = null;
        renderMyBoard();
        renderShop();

        // --- 调用后端 ---
        // 如果有旧武器需要卸下
        if (shopCard.type === 'weapon' && oldBoard[boardIdx]?.weapon) {
            const unequipRes = await callUnequipFunction({
                roomId, userId,
                boardIndex: boardIdx,
                slotKey: 'weapon'
            });
            if (!unequipRes.success) {
                my.gold = oldGold;
                my.board = oldBoard;
                my.hand = oldHand;
                my.shopCards = oldShopRaw;
                renderMyBoard();
                renderShop();
                toast('替换武器失败: ' + (unequipRes.error || '未知错误'), true);
                return false;
            }
        }

        // 调用装备接口
        const result = await callEquipFunction({
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
            my.hand = oldHand;
            my.shopCards = oldShopRaw;
            renderMyBoard();
            renderShop();
            toast('购买装备失败: ' + (result.error || '未知错误'), true);
            return false;
        }

        if (result.updatedPlayer) {
            mergeUpdatedPlayer(my, result.updatedPlayer);
            updateUIAfterSuccess(result.updatedPlayer);
        }
        toast(`${shopCard.name} 已购买并装备`);
        return true;
    }

    async function handleUnequip(boardIdx, slotKey) {
        if (!canOperate()) return false;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return false;

        const card = my.board[boardIdx];
        if (!card) return false;
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
            faction: ''
        };

        renderMyBoard();
        renderHand();

        const result = await callUnequipFunction({
            roomId, userId,
            boardIndex: boardIdx,
            slotKey
        });

        if (!result.success) {
            my.board = oldBoard;
            my.hand = oldHand;
            renderMyBoard();
            renderHand();
            toast('卸下失败', true);
            return false;
        }
        if (result.updatedPlayer) {
            mergeUpdatedPlayer(my, result.updatedPlayer);
            updateUIAfterSuccess(result.updatedPlayer);
        }
        toast(`${equip.name} 已卸下`);
        return true;
    }

    // ========== 拖拽逻辑 ==========
    function onDragStart(e, type, card, index, element) {
        if (!canOperate()) return;
        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);
        isDragging = true;

        const clientX = e.clientX;
        const clientY = e.clientY;
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        const rect = element.getBoundingClientRect();
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.boxSizing = 'border-box';
        clone.style.minHeight = rect.height + 'px';
        clone.style.cssText += `
            position: fixed; z-index: 99999;
            left: ${clientX - rect.width / 2}px;
            top: ${clientY - rect.height / 2}px;
            opacity: 0.85; transform: scale(1);
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

        const shopContainer = document.getElementById('shop-container');
        if (shopContainer) {
            const shopArea = shopContainer.closest('.shop-area') || shopContainer.closest('.shop') || shopContainer;
            const rect = shopArea.getBoundingClientRect();
            const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                               clientY >= rect.top && clientY <= rect.bottom;
            shopArea.classList.toggle('drop-target', isOverShop);
        }
    }, 16);

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();
        const { type, sourceElement, cloneElement, currentX, currentY, index } = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
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
            executeDropAction(type, index, dropResult);
        }
        dragState.active = false;
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

    async function executeDropAction(type, index, dropResult) {
        if (type === 'hand') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const card = gameState?.players[userId]?.hand[index];
            if (card && (card.type === 'weapon' || card.type === 'item')) {
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

    // ========== 业务操作 ==========
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) return;
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

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) return;
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

        if (isValidCard(targetCard) && getValidHandCount(my.hand) >= 15) {
            toast('手牌已满，无法交换', true);
            return;
        }

        const realIndex = shopIdx;

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

    // 移动角色卡到手牌（装备卸下到手牌）
    async function handleBoardToHand(boardIdx) {
        if (!canOperate()) return;
        const gameState = getGameState();
        const my = gameState?.players[getCurrentUserId()];
        if (!my) return;

        const card = my.board[boardIdx];
        if (!isValidCard(card)) return;

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
                faction: ''
            };
            card[eq.slot] = null;
            handIdx = getFirstAvailableHandSlot(my.hand);
        }
        my.board[boardIdx] = null;
        my.hand[handIdx] = card;
        renderMyBoard();
        renderHand();

        for (const eq of equipment) {
            const res = await callUnequipFunction({
                roomId, userId,
                boardIndex: boardIdx,
                slotKey: eq.slot
            });
            if (!res.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                renderMyBoard();
                renderHand();
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
            renderMyBoard();
            renderHand();
            toast('移动失败，请重试', true);
            return;
        }
        if (moveResult.data.updatedPlayer) {
            mergeUpdatedPlayer(my, moveResult.data.updatedPlayer);
            updateUIAfterSuccess(moveResult.data.updatedPlayer);
        }
    }

    // 出售
    async function handleSell(type, index) {
        if (!canOperate()) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        if (type === 'board') {
            const card = my.board[index];
            if (!isValidCard(card)) return;

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
                    faction: ''
                };
                card[eq.slot] = null;
                handIdx = getFirstAvailableHandSlot(my.hand);
            }
            my.board[index] = null;
            my.gold += sellPrice;
            renderMyBoard();
            renderHand();

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
                    renderMyBoard();
                    renderHand();
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
                renderMyBoard();
                renderHand();
                toast('出售失败，请重试', true);
                return;
            }
            if (sellResult.data.updatedPlayer) {
                mergeUpdatedPlayer(my, sellResult.data.updatedPlayer);
                updateUIAfterSuccess(sellResult.data.updatedPlayer);
            }
            return;
        }

        let card = my.hand[index];
        if (!isValidCard(card)) return;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
        const oldGold = my.gold;
        const oldHand = [...my.hand];

        my.hand[index] = null;
        my.gold += price;
        renderHand();

        const result = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, { roomId, userId, type: 'hand', index });
        if (!result.success) {
            my.gold = oldGold;
            my.hand = oldHand;
            renderHand();
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
        const forceUnlockTimer = setTimeout(() => {
            if (isRefreshingShop) { isRefreshingShop = false; updateBuyExpButtonState(); }
        }, 12000);

        const result = await invokeFunction(FUNCTION_NAME_MAP.REFRESH_SHOP, { roomId, userId });
        clearTimeout(forceUnlockTimer);
        isRefreshingShop = false;
        updateBuyExpButtonState();

        if (!result.success) return;
        const latestGameState = getGameState();
        const latestMy = latestGameState?.players[userId];
        if (!latestMy) return;

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
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
        updateBuyExpButtonState();
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
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

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    function init() {
        injectStyles();
        bindUIEvents();
        refreshAllUI();
        console.log('✅ 商店系统 (武器替换乐观更新修复 + 合成触发) 已启动');
    }

    return {
        init,
        refreshAllUI,
        handleUnequip,
        toast,
        setPhase,
        updateTimerDisplay
    };
})();
