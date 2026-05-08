// ==================== 自动合成模块 (仅零星，一星及以上不参与，带绿光延迟) ====================
window.mergeService = (function() {
    // 依赖的全局对象
    const getGameState = () => window.YYCardBattle?.getGameState();
    const getCurrentUserId = () => window.YYCardAuth?.currentUser?.id || null;
    const getCurrentRoomId = () => window.YYCardBattle?.getCurrentRoomId() || window._currentRoomId;

    let isMerging = false; // 合成锁，防止重复触发

    // 调用后端合成接口
    async function invokeMergeFunction(body) {
        try {
            const supabaseClient = window.supabase;
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('未登录');
            const url = `${supabaseClient.supabaseUrl}/functions/v1/merge-cards`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify(body)
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '合并失败');
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    // 卸下一个槽位的装备
    async function unequipSlot(boardIdx, slotKey) {
        if (window.YYCardShop && typeof window.YYCardShop.handleUnequip === 'function') {
            return await window.YYCardShop.handleUnequip(boardIdx, slotKey);
        }
        return false;
    }

    // 卸下卡牌所有装备，返回是否成功
    async function unequipAllFromCard(boardIdx, card) {
        if (!card) return true;
        const slots = [];
        if (card.weapon) slots.push('weapon');
        if (card.item1) slots.push('item1');
        if (card.item2) slots.push('item2');
        if (slots.length === 0) return true;

        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        const emptyCount = 15 - (my.hand?.filter(isValidCard).length || 0);
        if (emptyCount < slots.length) return false;

        for (const slot of slots) {
            const ok = await unequipSlot(boardIdx, slot);
            if (!ok) return false;
        }
        return true;
    }

    // ★ 只有零星卡牌才可合成
    function canMerge(card) {
        if (!card || card.type === 'item') return false;
        if ((card.star || 0) !== 0) return false;

        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return false;

        const targetId = card.card_id || card.cardId;

        if (card.type === 'weapon') {
            const handWeapons = (my.hand || []).filter(c => 
                c && isValidCard(c) && c.type === 'weapon' && 
                c.card_id === targetId && (c.star || 0) === 0
            );
            const equippedWeapons = [];
            (my.board || []).forEach(c => {
                if (c && c.weapon && c.weapon.card_id === targetId && (c.weapon.star || 0) === 0) {
                    equippedWeapons.push(c.weapon);
                }
            });
            const total = handWeapons.length + equippedWeapons.length;
            return total >= 3 && equippedWeapons.length === 1;
        } else {
            const allChars = [];
            (my.board || []).forEach(c => { 
                if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) allChars.push(c); 
            });
            (my.hand || []).forEach(c => { 
                if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) allChars.push(c); 
            });
            const sameGroup = allChars.filter(c => c.card_id === targetId);
            return sameGroup.length >= 3;
        }
    }

    // 查找第一组可合成的计划
    function findMergePlan(my) {
        // 角色合成
        const characterGroups = {};
        const allChars = [];
        (my.board || []).forEach((c, idx) => {
            if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) {
                allChars.push({ card: c, location: 'board', index: idx });
            }
        });
        (my.hand || []).forEach((c, idx) => {
            if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) {
                allChars.push({ card: c, location: 'hand', index: idx });
            }
        });
        allChars.forEach(({ card, location, index }) => {
            const key = (card.card_id || card.cardId) + '_0';
            if (!characterGroups[key]) characterGroups[key] = [];
            characterGroups[key].push({ card, location, index });
        });
        for (const key in characterGroups) {
            const group = characterGroups[key];
            if (group.length >= 3) {
                const mergeTargets = group.slice(0, 3);
                const boardTargets = mergeTargets.filter(t => t.location === 'board').sort((a,b) => a.index - b.index);
                let targetLocation, targetIndex;
                if (boardTargets.length > 0) {
                    targetLocation = 'board';
                    targetIndex = boardTargets[0].index;
                } else {
                    targetLocation = 'hand';
                    targetIndex = Math.min(...mergeTargets.map(t => t.index));
                }
                const newStar = 1;
                const newAtk = mergeTargets.reduce((sum, t) => sum + (t.card.base_atk || t.card.atk || 0), 0);
                const newHp = mergeTargets.reduce((sum, t) => sum + (t.card.base_hp || t.card.hp || 0), 0);
                const newCard = {
                    ...mergeTargets[0].card,
                    instanceId: Date.now() + '-' + Math.random(),
                    star: newStar,
                    atk: newAtk,
                    hp: newHp,
                    base_atk: newAtk,
                    base_hp: newHp,
                    weapon: null,
                    item1: null,
                    item2: null
                };
                return {
                    type: 'character',
                    mergeTargets,
                    targetLocation,
                    targetIndex,
                    newCard
                };
            }
        }

        // 武器合成
        const weaponGroups = {};
        (my.hand || []).forEach((c, idx) => {
            if (c && isValidCard(c) && c.type === 'weapon' && (c.star || 0) === 0) {
                const key = (c.card_id || c.cardId) + '_0';
                if (!weaponGroups[key]) weaponGroups[key] = { hand: [], equipped: [] };
                weaponGroups[key].hand.push({ card: c, index: idx });
            }
        });
        (my.board || []).forEach((c, idx) => {
            if (c && c.weapon && (c.weapon.star || 0) === 0) {
                const w = c.weapon;
                const key = (w.card_id) + '_0';
                if (!weaponGroups[key]) weaponGroups[key] = { hand: [], equipped: [] };
                weaponGroups[key].equipped.push({ weapon: w, boardIndex: idx });
            }
        });
        for (const key in weaponGroups) {
            const group = weaponGroups[key];
            if (group.equipped.length !== 1) continue;
            const neededHand = 3 - group.equipped.length;
            if (group.hand.length < neededHand) continue;

            const equippedInfo = group.equipped[0];
            const handInfos = group.hand.slice(0, neededHand);
            const boardCard = my.board[equippedInfo.boardIndex];
            if (!boardCard) continue;

            const oldWeapon = equippedInfo.weapon;
            const newStar = 1;
            const newAtk = oldWeapon.atk + handInfos.reduce((sum, hi) => sum + (hi.card.base_atk || hi.card.atk || 0), 0);
            const newHp = oldWeapon.hp + handInfos.reduce((sum, hi) => sum + (hi.card.base_hp || hi.card.hp || 0), 0);
            const newWeapon = {
                card_id: oldWeapon.card_id,
                name: oldWeapon.name,
                type: 'weapon',
                atk: newAtk,
                hp: newHp,
                star: newStar,
                image: oldWeapon.image,
                rarity: oldWeapon.rarity
            };
            return {
                type: 'weapon',
                equippedInfo,
                handInfos,
                newWeapon,
                boardCard
            };
        }
        return null;
    }

    // 执行合成计划
    async function executeMergePlan(plan, my) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();

        if (plan.type === 'character') {
            const { mergeTargets, targetLocation, targetIndex, newCard } = plan;

            // 卸下棋盘源卡的装备
            for (const t of mergeTargets) {
                if (t.location === 'board') {
                    const ok = await unequipAllFromCard(t.index, t.card);
                    if (!ok) return; // 装备卸下失败，放弃合成
                }
            }

            const oldBoard = JSON.parse(JSON.stringify(my.board));
            const oldHand = JSON.parse(JSON.stringify(my.hand));
            mergeTargets.forEach(t => {
                if (t.location === 'board') my.board[t.index] = null;
                else my.hand[t.index] = null;
            });
            if (targetLocation === 'board') my.board[targetIndex] = newCard;
            else my.hand[targetIndex] = newCard;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

            const result = await invokeMergeFunction({
                roomId, userId,
                sources: mergeTargets.map(t => ({ location: t.location, index: t.index })),
                target: { location: targetLocation, index: targetIndex },
                newCard
            });

            if (!result.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            } else if (result.updatedPlayer) {
                ['gold','exp','shopLevel','health','shopCards','hand','board'].forEach(f => {
                    if (result.updatedPlayer[f] !== undefined) my[f] = result.updatedPlayer[f];
                });
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        } else if (plan.type === 'weapon') {
            const { equippedInfo, handInfos, newWeapon, boardCard } = plan;

            const oldBoard = JSON.parse(JSON.stringify(my.board));
            const oldHand = JSON.parse(JSON.stringify(my.hand));

            handInfos.forEach(hi => { my.hand[hi.index] = null; });
            const oldWeapon = boardCard.weapon;
            const atkDiff = newWeapon.atk - oldWeapon.atk;
            const hpDiff = newWeapon.hp - oldWeapon.hp;
            boardCard.weapon = newWeapon;
            boardCard.atk = (boardCard.atk || 0) + atkDiff;
            boardCard.hp = (boardCard.hp || 0) + hpDiff;

            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

            const result = await invokeMergeFunction({
                roomId, userId,
                weaponMerge: {
                    boardIndex: equippedInfo.boardIndex,
                    handIndices: handInfos.map(hi => hi.index),
                    newWeapon
                }
            });

            if (!result.success) {
                my.board = oldBoard;
                my.hand = oldHand;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            } else if (result.updatedPlayer) {
                ['gold','exp','shopLevel','health','shopCards','hand','board'].forEach(f => {
                    if (result.updatedPlayer[f] !== undefined) my[f] = result.updatedPlayer[f];
                });
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }
    }

    // 带绿光延迟的合成入口
    async function envokeMerge() {
        if (isMerging) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        const plan = findMergePlan(my);
        if (!plan) return;

        isMerging = true;
        updateMergeGlow(); // 立即显示绿光

        setTimeout(async () => {
            await executeMergePlan(plan, my);
            isMerging = false;
            updateMergeGlow(); // 合成后更新发光状态
            // 可能又有新的组合，递归检查
            envokeMerge();
        }, 1000);
    }

    function updateMergeGlow() {
        document.querySelectorAll('.card[data-card-type="board"], .card[data-card-type="hand"]').forEach(el => {
            const cardType = el.getAttribute('data-card-type');
            let card;
            if (cardType === 'board') {
                const idx = parseInt(el.getAttribute('data-board-index'));
                const gameState = getGameState();
                const userId = getCurrentUserId();
                card = gameState?.players[userId]?.board?.[idx];
            } else if (cardType === 'hand') {
                const idx = parseInt(el.getAttribute('data-hand-index'));
                const gameState = getGameState();
                const userId = getCurrentUserId();
                card = gameState?.players[userId]?.hand?.[idx];
            }
            if (card && canMerge(card)) {
                el.style.boxShadow = '0 0 15px 4px #0f0';
            } else {
                el.style.boxShadow = '';
            }
        });
    }

    // 接管 refreshAllUI 以自动更新发光
    (function init() {
        if (window.YYCardShop) {
            const original = window.YYCardShop.refreshAllUI;
            window.YYCardShop.refreshAllUI = function() {
                original.apply(this, arguments);
                updateMergeGlow();
            };
        }
    })();

    return {
        canMerge,
        envokeMerge,
        updateMergeGlow
    };
})();
