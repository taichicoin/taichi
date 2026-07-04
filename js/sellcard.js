// ==================== 独立卖卡模块 (sellcard.js) ====================
// 完全独立，不依赖 YYCardShop，自己处理音效、UI 更新、状态锁
window.YYCardSellCard = (function() {
    const config = window.YYCardConfig;

    // 内部防并发锁
    let busy = false;

    // ---------- 基础工具 ----------
    function getGameState() {
        return window.YYCardBattle?.getGameState?.();
    }
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }

    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    function isCardInMerge(card) {
        if (!card) return false;
        return !!(window.mergeService && window.mergeService.isCardInMerge && window.mergeService.isCardInMerge(card));
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

    // 简单 toast（如果商店 toast 存在则复用）
    function toast(message, isError = false, duration = 2000) {
        if (window.YYCardShop?.toast) {
            window.YYCardShop.toast(message, isError, duration);
            return;
        }
        // 兜底 toast
        const old = document.getElementById('sell-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'sell-toast';
        el.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isError ? 'rgba(200,50,50,0.9)' : 'rgba(30,40,60,0.95)'};
            color:white; font-size:14px; padding:10px 20px; border-radius:30px;
            z-index:100001; border:1px solid ${isError ? '#ff7b7b' : '#f5d76e'};
            box-shadow:0 4px 12px rgba(0,0,0,0.3); font-weight:bold;
            pointer-events:none; white-space:nowrap;
        `;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), duration);
    }

    // 音效辅助
    function playSound(name) {
        if (window.YYCardSounds?.play) {
            window.YYCardSounds.play(name);
        }
    }

    // Supabase 调用
    async function invokeFunction(functionName, body = {}, timeout = 10000) {
        const supabase = window.supabase;
        if (!supabase) return { success: false, error: 'Supabase未初始化' };
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body,
                headers: { Authorization: '' },
                signal: controller.signal
            });
            clearTimeout(tid);
            if (error) throw new Error(error.message);
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(tid);
            return { success: false, error: err.message };
        }
    }

    async function callUnequipFunction(body) {
        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('未登录');
            const url = `${supabase.supabaseUrl}/functions/v1/unequip-item`;
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

    // 简单的本地状态合并
    function mergeLocal(my, up) {
        if (!up) return;
        const fields = ['gold', 'exp', 'shopLevel', 'health'];
        fields.forEach(k => {
            if (up[k] !== undefined) my[k] = up[k];
        });
        if (up.hand) my.hand = up.hand;
        if (up.board) my.board = up.board;
        if (up.shopCards) my.shopCards = up.shopCards;
    }

    // UI 刷新
    function refreshUI(updatedPlayer) {
        const my = getGameState()?.players?.[getCurrentUserId()];
        if (!my) return;
        if (updatedPlayer) mergeLocal(my, updatedPlayer);
        // 更新关键数字
        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = my.gold;
        const healthEl = document.getElementById('my-health');
        if (healthEl) healthEl.textContent = my.health;
        const topEl = document.getElementById('my-health-top');
        if (topEl) topEl.textContent = my.health;
        const lvEl = document.getElementById('shop-level');
        if (lvEl) lvEl.textContent = my.shopLevel;
        // 刷新渲染
        if (window.YYCardRender) {
            window.YYCardRender.renderMyBoard();
            window.YYCardRender.renderHand();
            window.YYCardRender.renderShop();
            window.YYCardRender.updateBuyExpButtonState();
        }
        // 合成检查
        if (window.mergeService) {
            window.mergeService.updateMergeGlow?.();
            window.mergeService.envokeMerge?.();
        }
    }

    // ---------- 核心卖卡逻辑 ----------
    async function sellCard(type, index) {
        // 协同商店锁（如果存在）
        if (window.YYCardShop?.operationLock) return;
        if (busy) return;
        busy = true;
        if (window.YYCardShop) window.YYCardShop.operationLock = true;

        const gameState = getGameState();
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!gameState || !userId || !roomId) {
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        const my = gameState.players?.[userId];
        if (!my) {
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        let card;
        if (type === 'board') {
            card = my.board[index];
        } else {
            card = my.hand[index];
        }

        // 消耗牌禁止出售
        if (card && (card.type === 'consumable' || card.isConsumable)) {
            toast('消耗牌无法出售，只能使用', true);
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        // ==== 亡魂碎片固定售价 1 金币 =====
        if (card && card.type === 'loot') {
            const sellPrice = 1;
            const oldGold = my.gold;
            const oldHand = [...my.hand];
            const oldBoard = JSON.parse(JSON.stringify(my.board));

            if (type === 'board') {
                if (!isValidCard(card)) {
                    busy = false;
                    if (window.YYCardShop) window.YYCardShop.operationLock = false;
                    return;
                }
                my.board[index] = null;
            } else {
                if (!isValidCard(card)) {
                    busy = false;
                    if (window.YYCardShop) window.YYCardShop.operationLock = false;
                    return;
                }
                my.hand[index] = null;
            }
            my.gold += sellPrice;
            refreshUI();
            playSound('sell');

            const result = await invokeFunction('sell-card', { roomId, userId, type, index });
            if (!result.success) {
                my.gold = oldGold;
                if (type === 'board') my.board = oldBoard;
                else my.hand = oldHand;
                refreshUI();
                toast('出售失败', true);
            } else {
                if (result.data.updatedPlayer) {
                    mergeLocal(my, result.data.updatedPlayer);
                    refreshUI(result.data.updatedPlayer);
                }
            }
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        // ===== 常规出售（棋盘） =====
        if (type === 'board') {
            if (!isValidCard(card)) {
                busy = false;
                if (window.YYCardShop) window.YYCardShop.operationLock = false;
                return;
            }
            if (isCardInMerge(card)) {
                toast('该卡牌正在参与合成，无法出售', true);
                busy = false;
                if (window.YYCardShop) window.YYCardShop.operationLock = false;
                return;
            }

            // 收集装备
            const equipment = [];
            if (card.weapon && isValidCard(card.weapon)) equipment.push({ slot: 'weapon', equip: card.weapon });
            if (card.item1 && isValidCard(card.item1)) equipment.push({ slot: 'item1', equip: card.item1 });
            if (card.item2 && isValidCard(card.item2)) equipment.push({ slot: 'item2', equip: card.item2 });

            const neededSlots = equipment.length;
            const emptySlots = 15 - getValidHandCount(my.hand);
            if (neededSlots > emptySlots) {
                toast(`手牌空间不足，无法出售（需${neededSlots}空位）`, true);
                busy = false;
                if (window.YYCardShop) window.YYCardShop.operationLock = false;
                return;
            }

            const sellPrice = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
            const oldGold = my.gold;
            const oldHand = JSON.parse(JSON.stringify(my.hand));
            const oldBoard = JSON.parse(JSON.stringify(my.board));

            // 先把装备移到手牌
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
                playSound('equip'); // 卸下装备音效
            }
            my.board[index] = null;
            my.gold += sellPrice;
            refreshUI();
            playSound('sell');

            // 先卸下装备（后端）
            for (const eq of equipment) {
                const res = await callUnequipFunction({
                    roomId, userId,
                    boardIndex: index,
                    slotKey: eq.slot
                });
                if (!res.success) {
                    // 回滚
                    my.gold = oldGold;
                    my.hand = oldHand;
                    my.board = oldBoard;
                    refreshUI();
                    toast('卸下装备失败，出售取消', true);
                    busy = false;
                    if (window.YYCardShop) window.YYCardShop.operationLock = false;
                    return;
                }
            }

            // 出售卡片
            const sellResult = await invokeFunction('sell-card', { roomId, userId, type: 'board', index });
            if (!sellResult.success) {
                my.gold = oldGold;
                my.hand = oldHand;
                my.board = oldBoard;
                refreshUI();
                toast('出售失败，请重试', true);
            } else {
                if (sellResult.data.updatedPlayer) {
                    mergeLocal(my, sellResult.data.updatedPlayer);
                    refreshUI(sellResult.data.updatedPlayer);
                }
            }
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        // ===== 手牌出售 =====
        if (!isValidCard(card)) {
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }
        if (isCardInMerge(card)) {
            toast('该卡牌正在参与合成，无法出售', true);
            busy = false;
            if (window.YYCardShop) window.YYCardShop.operationLock = false;
            return;
        }

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
        const oldGold = my.gold;
        const oldHand = [...my.hand];

        my.hand[index] = null;
        my.gold += price;
        refreshUI();
        playSound('sell');

        const result = await invokeFunction('sell-card', { roomId, userId, type: 'hand', index });
        if (!result.success) {
            my.gold = oldGold;
            my.hand = oldHand;
            refreshUI();
        } else {
            if (result.data.updatedPlayer) {
                mergeLocal(my, result.data.updatedPlayer);
                refreshUI(result.data.updatedPlayer);
            }
        }
        busy = false;
        if (window.YYCardShop) window.YYCardShop.operationLock = false;
    }

    // 暴露卖卡方法
    return { sellCard };
})();
