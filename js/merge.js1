// ==================== 自动合成模块 (instanceId 修复 + type 兜底) ====================
window.mergeService = (function() {
    const getGameState = () => window.YYCardBattle?.getGameState();
    const getCurrentUserId = () => window.YYCardAuth?.currentUser?.id || null;
    const getCurrentRoomId = () => window.YYCardBattle?.getCurrentRoomId() || window._currentRoomId;

    let isMerging = false;
    let mergingCards = [];
    let mergeLock = false;

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

    function getVisibleShopCards(my) {
        const shop = my.shopCards;
        if (!shop?.buffer) return [];
        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group)) return [];
        const start = sub * 3;
        if (start >= group.length) return [];
        return group.slice(start, start + 3).filter(isValidCard);
    }

    async function unequipSlot(boardIdx, slotKey) {
        if (window.YYCardShop && typeof window.YYCardShop.handleUnequip === 'function') {
            return await window.YYCardShop.handleUnequip(boardIdx, slotKey, true);
        }
        return false;
    }

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
            const shopWeapons = getVisibleShopCards(my).filter(c =>
                c && c.type === 'weapon' && c.card_id === targetId && (c.star || 0) === 0
            );
            const equippedWeapons = [];
            (my.board || []).forEach(c => {
                if (c && c.weapon && c.weapon.card_id === targetId && (c.weapon.star || 0) === 0) {
                    equippedWeapons.push(c.weapon);
                }
            });
            const total = handWeapons.length + shopWeapons.length + equippedWeapons.length;
            return total >= 3;
        } else {
            const allChars = [];
            (my.board || []).forEach(c => {
                if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) allChars.push(c);
            });
            (my.hand || []).forEach(c => {
                if (c && isValidCard(c) && c.type !== 'weapon' && c.type !== 'item' && (c.star || 0) === 0) allChars.push(c);
            });
            const shopChars = getVisibleShopCards(my).filter(c =>
                c && c.type !== 'weapon' && c.type !== 'item' && c.card_id === targetId && (c.star || 0) === 0
            );
            allChars.push(...shopChars);
            const sameGroup = allChars.filter(c => c.card_id === targetId);
            return sameGroup.length >= 3;
        }
    }

    function findMergePlan(my) {
        // ========== 角色合成 ==========
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
                const boardTargets = mergeTargets.filter(t => t.location === 'board').sort((a, b) => a.index - b.index);
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
                const targetCard = targetLocation === 'board' ? my.board[targetIndex] : null;
                const newCard = {
                    ...mergeTargets[0].card,
                    type: mergeTargets[0].card.type || 'character',  // ★ 确保 type 字段存在
                    instanceId: Date.now() + '-' + Math.random(),
                    star: newStar,
                    atk: newAtk,
                    hp: newHp,
                    base_atk: newAtk,
                    base_hp: newHp,
                    weapon: targetCard ? (targetCard.weapon || null) : null,
                    item1: targetCard ? (targetCard.item1 || null) : null,
                    item2: targetCard ? (targetCard.item2 || null) : null
                };
                return { type: 'character', mergeTargets, targetLocation, targetIndex, newCard };
            }
        }

        // ========== 武器合成 ==========
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

            if (group.equipped.length === 1 && group.hand.length >= 2) {
                const equippedInfo = group.equipped[0];
                const handInfos = group.hand.slice(0, 2);
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
                    rarity: oldWeapon.rarity,
                    chi: (oldWeapon.rarity === 'Epic' || oldWeapon.rarity === 'Legendary') ? 1 : 0
                };
                return { type: 'weapon', equippedInfo, handInfos, newWeapon, boardCard };
            }

            if (group.equipped.length === 0 && group.hand.length >= 3) {
                const handInfos = group.hand.slice(0, 3);
                const templateCard = handInfos[0].card;
                const newStar = 1;
                const newAtk = handInfos.reduce((sum, hi) => sum + (hi.card.base_atk || hi.card.atk || 0), 0);
                const newHp = handInfos.reduce((sum, hi) => sum + (hi.card.base_hp || hi.card.hp || 0), 0);
                const newWeapon = {
                    card_id: templateCard.card_id || templateCard.cardId,
                    name: templateCard.name,
                    type: 'weapon',
                    atk: newAtk,
                    hp: newHp,
                    star: newStar,
                    image: templateCard.image,
                    rarity: templateCard.rarity,
                    chi: (templateCard.rarity === 'Epic' || templateCard.rarity === 'Legendary') ? 1 : 0
                };
                return { type: 'weapon_hand', handInfos, newWeapon };
            }
        }
        return null;
    }

    function getCardElement(location, index) {
        if (location === 'board') {
            const slot = document.querySelector(`#my-board .card-slot[data-slot-index="${index}"]`);
            return slot ? slot.querySelector('.card:not(.empty-slot)') : null;
        } else if (location === 'hand') {
            const container = document.getElementById('hand-container');
            if (!container) return null;
            const cards = container.querySelectorAll('.card[data-hand-index]');
            for (const card of cards) {
                if (parseInt(card.getAttribute('data-hand-index')) === index) return card;
            }
            return null;
        }
        return null;
    }

    function getRarityColors(rarity) {
        switch(rarity) {
            case 'Legendary': return { glow: '#ff0000', inner: 'rgba(255,0,0,0.25)', particle: '#ff3333' };
            case 'Epic':      return { glow: '#ff8800', inner: 'rgba(255,136,0,0.25)', particle: '#ff8800' };
            case 'Rare':      return { glow: '#0080ff', inner: 'rgba(0,128,255,0.25)', particle: '#0088ff' };
            default:          return { glow: '#00ff00', inner: 'rgba(0,255,0,0.25)', particle: '#00ff00' };
        }
    }

    function playFlyAnimation(sourceElements, targetElement, rarity = 'Common', duration = 600) {
        return new Promise(resolve => {
            if (sourceElements.length === 0) return resolve();
            const colors = getRarityColors(rarity);
            let targetRect;
            if (targetElement) {
                targetRect = targetElement.getBoundingClientRect();
            } else {
                targetRect = { left: window.innerWidth/2, top: window.innerHeight/2, width: 0, height: 0 };
            }
            const targetX = targetRect.left + targetRect.width/2 - 18;
            const targetY = targetRect.top + targetRect.height/2 - 18;

            const particles = [];
            sourceElements.forEach(srcEl => {
                const rect = srcEl.getBoundingClientRect();
                const particle = document.createElement('div');
                particle.style.cssText = `
                    position: fixed; width: 36px; height: 36px; border-radius: 50%;
                    background: radial-gradient(circle, ${colors.particle}, ${colors.particle}88);
                    box-shadow: 0 0 45px ${colors.glow};
                    z-index: 100001;
                    left: ${rect.left + rect.width/2 - 18}px;
                    top: ${rect.top + rect.height/2 - 18}px;
                    pointer-events: none;
                    transition: all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1);
                `;
                document.body.appendChild(particle);
                particles.push(particle);
                srcEl.style.transition = 'opacity 0.2s';
                srcEl.style.opacity = '0';
            });

            requestAnimationFrame(() => {
                particles.forEach(p => {
                    p.style.left = targetX + 'px';
                    p.style.top = targetY + 'px';
                    p.style.transform = 'scale(0.15)';
                    p.style.opacity = '0.5';
                });
            });

            if (targetElement) {
                targetElement.style.transition = 'box-shadow 0.3s';
                targetElement.style.boxShadow = `0 0 60px 20px ${colors.particle}`;
                setTimeout(() => { targetElement.style.boxShadow = ''; }, 400);
            }

            setTimeout(() => {
                particles.forEach(p => p.remove());
                resolve();
            }, duration + 50);
        });
    }

    async function executeMergePlan(plan, my) {
        mergeLock = true;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();

        try {
            if (plan.type === 'character') {
                const { mergeTargets, targetLocation, targetIndex, newCard } = plan;
                const rarity = newCard.rarity || 'Common';
                const sourceEls = mergeTargets.map(t => getCardElement(t.location, t.index)).filter(Boolean);
                let targetEl = null;
                if (targetLocation === 'board') {
                    const slot = document.querySelector(`#my-board .card-slot[data-slot-index="${targetIndex}"]`);
                    targetEl = slot ? (slot.querySelector('.card:not(.empty-slot)') || slot) : null;
                } else {
                    targetEl = document.getElementById('hand-container');
                }

                for (const t of mergeTargets) {
                    if (t.location === 'board' && t.index !== targetIndex) {
                        await unequipAllFromCard(t.index, t.card);
                    }
                }

                await playFlyAnimation(sourceEls, targetEl, rarity, 600);

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
                const rarity = newWeapon.rarity || 'Common';
                const handEls = handInfos.map(hi => getCardElement('hand', hi.index)).filter(Boolean);
                const boardEl = getCardElement('board', equippedInfo.boardIndex);
                await playFlyAnimation(handEls, boardEl, rarity, 600);

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

            } else if (plan.type === 'weapon_hand') {
                const { handInfos, newWeapon } = plan;
                const rarity = newWeapon.rarity || 'Common';
                const handEls = handInfos.map(hi => getCardElement('hand', hi.index)).filter(Boolean);

                await playFlyAnimation(handEls, document.getElementById('hand-container'), rarity, 600);

                const oldHand = JSON.parse(JSON.stringify(my.hand));
                const sortedIndices = handInfos.map(hi => hi.index).sort((a, b) => b - a);
                sortedIndices.forEach(idx => { my.hand[idx] = null; });
                const emptyIdx = my.hand.findIndex(c => !isValidCard(c));
                if (emptyIdx !== -1) {
                    my.hand[emptyIdx] = newWeapon;
                } else {
                    my.hand.push(newWeapon);
                }

                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

                const result = await invokeMergeFunction({
                    roomId, userId,
                    weaponMergeHand: {
                        handIndices: handInfos.map(hi => hi.index),
                        newWeapon
                    }
                });

                if (!result.success) {
                    my.hand = oldHand;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                } else if (result.updatedPlayer) {
                    ['gold','exp','shopLevel','health','shopCards','hand','board'].forEach(f => {
                        if (result.updatedPlayer[f] !== undefined) my[f] = result.updatedPlayer[f];
                    });
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
            }
        } finally {
            mergeLock = false;
        }
    }

    async function envokeMerge() {
        if (isMerging || mergeLock) return;

        const gameState = getGameState();
        if (!gameState) return;

        const isPrepare = gameState.phase === 'prepare';
        const forcePrepare = window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode();
        if (!isPrepare && !forcePrepare) return;

        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;
        const plan = findMergePlan(my);
        if (!plan) return;

        if (plan.type === 'character') {
            mergingCards = plan.mergeTargets.map(t => t.card.instanceId);
        } else if (plan.type === 'weapon') {
            mergingCards = plan.handInfos.map(hi => hi.card.instanceId);
            const boardCard = my.board[plan.equippedInfo.boardIndex];
            if (boardCard) mergingCards.push(boardCard.instanceId);
        } else if (plan.type === 'weapon_hand') {
            mergingCards = plan.handInfos.map(hi => hi.card.instanceId);
        }

        isMerging = true;
        updateMergeGlow();

        setTimeout(async () => {
            await executeMergePlan(plan, my);
            isMerging = false;
            mergingCards = [];
            updateMergeGlow();
            envokeMerge();
        }, 1500);
    }

    function updateMergeGlow() {
        const selectors = [
            '.card[data-card-type="board"]',
            '.card[data-card-type="hand"]',
            '.card[data-card-type="shop"]'
        ];

        document.querySelectorAll(selectors.join(',')).forEach(el => {
            const cardType = el.getAttribute('data-card-type');
            let card;
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const my = gameState?.players[userId];
            if (!my) return;

            if (cardType === 'board') {
                const idx = parseInt(el.getAttribute('data-board-index'));
                card = my.board?.[idx];
            } else if (cardType === 'hand') {
                const idx = parseInt(el.getAttribute('data-hand-index'));
                card = my.hand?.[idx];
            } else if (cardType === 'shop') {
                const idx = parseInt(el.getAttribute('data-shop-index'));
                card = my.shopCards?.buffer?.[my.shopCards.active ?? 0]?.[idx];
            }

            if (card && canMerge(card)) {
                const colors = getRarityColors(card.rarity || 'Common');
                el.style.boxShadow = `0 0 20px 5px ${colors.glow}`;
                el.style.position = 'relative';
                const oldOverlay = el.querySelector('.merge-glow-overlay');
                if (oldOverlay) oldOverlay.remove();
                const overlay = document.createElement('div');
                overlay.className = 'merge-glow-overlay';
                overlay.style.cssText = `
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background-color: ${colors.inner};
                    pointer-events: none; z-index: 1;
                `;
                el.appendChild(overlay);
            } else {
                el.style.boxShadow = '';
                const overlay = el.querySelector('.merge-glow-overlay');
                if (overlay) overlay.remove();
            }
        });
    }

    (function init() {
        if (window.YYCardShop) {
            const originalRefresh = window.YYCardShop.refreshAllUI;
            window.YYCardShop.refreshAllUI = function() {
                originalRefresh.apply(this, arguments);
                requestAnimationFrame(() => updateMergeGlow());
            };
        }
    })();

    return {
        canMerge,
        envokeMerge,
        updateMergeGlow,
        isMerging: () => isMerging,
        isMergeLocked: () => mergeLock,
        isCardInMerge: (card) => {
            return card && mergingCards.includes(card.instanceId);
        }
    };
})();
