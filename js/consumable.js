// ==================== 消耗牌系统模块 (consumable.js) ====================
window.YYCardConsumable = (function() {
    const supabase = window.supabase;

    // 依赖注入
    let _getGameState, _getCurrentUserId, _getCurrentRoomId;
    let _renderHand, _renderMyBoard, _renderShop;
    let _toast;
    let _mergeUpdatedPlayer;

    // 本地消耗牌模板池（与 consumables 表 card_id 对应）
    const CONSUMABLE_TEMPLATES = [
        { card_id: 'cons_enlight_atk_10', name: '悟道·强攻', consumable_type: 'enlightenment', effect: { type: 'gain_attack', value: 10 }, rarity: 'Common' },
        { card_id: 'cons_enlight_hp_20', name: '悟道·健体', consumable_type: 'enlightenment', effect: { type: 'gain_health', value: 20 }, rarity: 'Common' },
        { card_id: 'cons_enlight_gold_1', name: '悟道·生财', consumable_type: 'enlightenment', effect: { type: 'gain_gold', value: 1 }, rarity: 'Common' },
        { card_id: 'cons_kill_atk_5', name: '残暴', consumable_type: 'on_kill', effect: { type: 'gain_attack', value: 5 }, rarity: 'Rare' },
        { card_id: 'cons_death_gold_2', name: '遗财', consumable_type: 'deathrattle', effect: { type: 'gain_gold', value: 2 }, rarity: 'Rare' },
        { card_id: 'cons_divine_atk_hp_3', name: '神助·共鸣', consumable_type: 'divine_blessing', effect: { type: 'gain_attack_health', attack: 3, health: 3 }, rarity: 'Epic' },
        { card_id: 'cons_gold_5', name: '点石成金', consumable_type: 'other', effect: { effect_type: 'add_gold', value: 5 }, rarity: 'Common' },
        { card_id: 'cons_exp_2', name: '智慧之书', consumable_type: 'other', effect: { effect_type: 'add_exp', value: 2 }, rarity: 'Common' }
    ];

    let isSelectionOpen = false;
    let selectedTemplate = null;

    // 拖拽相关
    let dragData = null;
    let dragClone = null;
    let guideLine = null;
    let highlightTarget = null;

    function setDeps(deps) {
        _getGameState = deps.getGameState;
        _getCurrentUserId = deps.getCurrentUserId;
        _getCurrentRoomId = deps.getCurrentRoomId;
        _renderHand = deps.renderHand;
        _renderMyBoard = deps.renderMyBoard;
        _renderShop = deps.renderShop;
        _toast = deps.toast;
        _mergeUpdatedPlayer = deps.mergeUpdatedPlayer;
    }

    function getGameState() { return _getGameState ? _getGameState() : null; }
    function getCurrentUserId() { return _getCurrentUserId ? _getCurrentUserId() : null; }
    function getCurrentRoomId() { return _getCurrentRoomId ? _getCurrentRoomId() : null; }

    // ========== UI 选择面板 ==========
    function showSelectionPanel() {
        try {
            if (isSelectionOpen) return;
            isSelectionOpen = true;

            // 创建覆盖层，z-index 必须超过 #battle-view (1000)
            const overlay = document.createElement('div');
            overlay.id = 'consumable-select-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.6); z-index: 2000;
                display: flex; align-items: center; justify-content: center;
            `;

            // 内部面板（模拟商店区域大小）
            const panel = document.createElement('div');
            panel.className = 'shop-area';
            panel.style.cssText = `
                position: relative; width: 90vw; height: 43.5vh; background: rgba(10,18,30,0.9);
                backdrop-filter: blur(8px); border-radius: 3vmin; padding: 2vh 2vw;
                display: flex; flex-direction: column;
            `;
            panel.innerHTML = `
                <div style="text-align:center; color:#f5d76e; font-weight:bold; font-size:1.2rem; margin-bottom:1vh;">
                    ✨ 升级奖励：选择一张消耗牌 ✨
                </div>
                <div id="consumable-cards" class="shop-cards" style="display:flex; justify-content:center; gap:2vw; flex:1;"></div>
                <div style="text-align:center; margin-top:1vh;">
                    <button id="consumable-confirm-btn" class="btn btn-primary" disabled>加入手牌</button>
                </div>
            `;
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            // 随机选3张
            const shuffled = [...CONSUMABLE_TEMPLATES].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, 3);

            const cardsContainer = panel.querySelector('#consumable-cards');
            selected.forEach(tpl => {
                const cardEl = createConsumableCardElement(tpl);
                cardEl.addEventListener('click', () => selectTemplate(tpl, cardEl));
                cardsContainer.appendChild(cardEl);
            });

            const confirmBtn = panel.querySelector('#consumable-confirm-btn');
            confirmBtn.addEventListener('click', confirmSelection);
        } catch (e) {
            console.error('消耗牌面板创建失败:', e);
            closeSelectionPanel();
        }
    }

    function createConsumableCardElement(tpl) {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-rarity', tpl.rarity);
        card.style.cssText = `
            width: 23.6vw; height: 29.1vw; border-radius: 1.5vmin;
            background: rgba(20,26,42,0.8); display: flex; flex-direction: column;
            align-items: center; justify-content: center; cursor: pointer;
        `;
        const nameEl = document.createElement('div');
        nameEl.className = 'card-name';
        nameEl.textContent = tpl.name;
        nameEl.style.cssText = 'position: static; background: transparent; color: white; font-weight: bold; font-size: clamp(0.7rem,2vw,0.9rem);';
        card.appendChild(nameEl);

        const desc = document.createElement('div');
        desc.style.cssText = 'color:#ccc; font-size: clamp(0.5rem,1.5vw,0.7rem); text-align:center; margin-top:1vh;';
        desc.textContent = formatEffectDesc(tpl);
        card.appendChild(desc);

        return card;
    }

    function formatEffectDesc(tpl) {
        const eff = tpl.effect;
        if (tpl.consumable_type === 'other') {
            if (eff.effect_type === 'add_gold') return `+${eff.value} 金币`;
            if (eff.effect_type === 'add_exp') return `+${eff.value} 经验`;
            return '立即生效';
        }
        if (eff.type === 'gain_attack') return `攻击 +${eff.value}`;
        if (eff.type === 'gain_health') return `生命 +${eff.value}`;
        if (eff.type === 'gain_gold') return `金币 +${eff.value}`;
        if (eff.type === 'gain_attack_health') return `攻击 +${eff.attack} 生命 +${eff.health}`;
        return '未知效果';
    }

    function selectTemplate(tpl, cardEl) {
        document.querySelectorAll('#consumable-cards .card').forEach(c => c.classList.remove('selected'));
        cardEl.classList.add('selected');
        selectedTemplate = tpl;
        const confirmBtn = document.getElementById('consumable-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = false;
    }

    function confirmSelection() {
        if (!selectedTemplate) return;
        closeSelectionPanel();

        const consumableCard = createConsumableCard(selectedTemplate);
        const uid = getCurrentUserId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my || !my.hand) return;

        my.hand.push(consumableCard);
        _renderHand();
        _toast?.(`获得消耗牌: ${selectedTemplate.name}`);
        selectedTemplate = null;
    }

    function closeSelectionPanel() {
        const overlay = document.getElementById('consumable-select-overlay');
        if (overlay) overlay.remove();
        isSelectionOpen = false;
    }

    function createConsumableCard(tpl) {
        return {
            instanceId: 'cons-' + crypto.randomUUID(),
            card_id: tpl.card_id,
            cardId: tpl.card_id,
            name: tpl.name,
            type: 'consumable',
            rarity: tpl.rarity,
            consumable_type: tpl.consumable_type,
            effect: { ...tpl.effect },
            image: '',
            atk: null,
            hp: null,
            baseAtk: null,
            baseHp: null,
            star: 0,
            price: 0,
            equipment: { weapon: null, items: [null, null] },
            shield: 0,
            chi: 0,
            isConsumable: true
        };
    }

    // ========== 拖拽使用逻辑 ==========
    function enableDragOnHand() {
        const handContainer = document.getElementById('hand-container');
        if (!handContainer) return;
        handContainer.addEventListener('touchstart', onDragStart, { passive: false });
        handContainer.addEventListener('mousedown', onDragStart);
    }

    function onDragStart(e) {
        const target = e.target.closest('.card');
        if (!target) return;
        const cardIndex = Array.from(target.parentNode.children).indexOf(target);
        const uid = getCurrentUserId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my) return;
        const card = my.hand[cardIndex];
        if (!card || !card.isConsumable) return;

        e.preventDefault();
        startDragging(card, target, e.touches ? e.touches[0] : e);
    }

    function startDragging(card, originalElement, point) {
        dragData = { card, originalElement, startX: point.clientX, startY: point.clientY };

        dragClone = originalElement.cloneNode(true);
        dragClone.style.cssText = `
            position: fixed; z-index: 1000; pointer-events: none;
            width: ${originalElement.offsetWidth}px; height: ${originalElement.offsetHeight}px;
            opacity: 0.8; transform: scale(1.05);
            border: 2px solid #f5d76e; box-shadow: 0 0 2vmin #f5d76e;
        `;
        document.body.appendChild(dragClone);
        updateClonePosition(point);

        guideLine = document.createElement('div');
        guideLine.style.cssText = `
            position: fixed; z-index: 999; pointer-events: none;
            height: 2px; background: #f5d76e; transform-origin: left center;
        `;
        document.body.appendChild(guideLine);

        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragData) return;
        e.preventDefault();
        const point = e.touches ? e.touches[0] : e;
        updateClonePosition(point);
        updateGuideLine(point);
        highlightNearestTarget(point);
    }

    function updateClonePosition(point) {
        if (!dragClone) return;
        dragClone.style.left = (point.clientX - dragClone.offsetWidth/2) + 'px';
        dragClone.style.top = (point.clientY - dragClone.offsetHeight/2) + 'px';
    }

    function updateGuideLine(point) {
        if (!guideLine || !dragData) return;
        const startRect = dragData.originalElement.getBoundingClientRect();
        const startX = startRect.left + startRect.width/2;
        const startY = startRect.top + startRect.height/2;
        const endX = point.clientX;
        const endY = point.clientY;
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        guideLine.style.width = length + 'px';
        guideLine.style.left = startX + 'px';
        guideLine.style.top = startY + 'px';
        guideLine.style.transform = `rotate(${angle}deg)`;
    }

    function highlightNearestTarget(point) {
        if (highlightTarget) {
            highlightTarget.classList.remove('drop-target');
            highlightTarget = null;
        }
        const target = getTargetUnderPoint(point);
        if (target) {
            target.classList.add('drop-target');
            highlightTarget = target;
        }
    }

    function getTargetUnderPoint(point) {
        const elements = document.elementsFromPoint(point.clientX, point.clientY);
        for (const el of elements) {
            if (el.classList.contains('card') && !el.classList.contains('empty-slot') && !el.closest('#consumable-cards')) {
                const slot = el.closest('.card-slot');
                if (!slot) continue;
                const boardIndex = slot.getAttribute('data-board-index');
                const handIndex = slot.getAttribute('data-slot-index');
                const uid = getCurrentUserId();
                const gs = getGameState();
                const my = gs?.players?.[uid];
                if (boardIndex !== null && my?.board) {
                    const card = my.board[parseInt(boardIndex)];
                    if (card && !card.isConsumable) return el;
                } else if (handIndex !== null && my?.hand) {
                    const card = my.hand[parseInt(handIndex)];
                    if (card && !card.isConsumable) return el;
                }
            }
        }
        return null;
    }

    function onDragEnd(e) {
        if (!dragData) return;
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);

        const point = e.changedTouches ? e.changedTouches[0] : e;
        const targetEl = getTargetUnderPoint(point);
        if (targetEl) {
            useConsumableOnTarget(dragData.card, targetEl);
        }
        cleanupDrag();
    }

    function cleanupDrag() {
        if (dragClone) { dragClone.remove(); dragClone = null; }
        if (guideLine) { guideLine.remove(); guideLine = null; }
        if (highlightTarget) { highlightTarget.classList.remove('drop-target'); highlightTarget = null; }
        dragData = null;
    }

    async function useConsumableOnTarget(consumableCard, targetEl) {
        const uid = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my) return;

        const slot = targetEl.closest('.card-slot');
        let targetCard, targetLoc;
        if (slot.hasAttribute('data-board-index')) {
            const idx = parseInt(slot.getAttribute('data-board-index'));
            targetCard = my.board[idx];
            targetLoc = 'board';
        } else {
            const idx = parseInt(slot.getAttribute('data-slot-index'));
            targetCard = my.hand[idx];
            targetLoc = 'hand';
        }
        if (!targetCard) return;

        const handIdx = my.hand.findIndex(c => c.instanceId === consumableCard.instanceId);
        if (handIdx !== -1) my.hand.splice(handIdx, 1);
        _renderHand();

        try {
            const { data, error } = await supabase.rpc('use_consumable', {
                p_room_id: roomId,
                p_user_id: uid,
                p_consumable_instance_id: consumableCard.instanceId,
                p_target_instance_id: targetCard.instanceId,
                p_target_location: targetLoc
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data.error || '使用失败');

            if (data.updatedPlayer) {
                _mergeUpdatedPlayer?.(my, data.updatedPlayer);
                _renderMyBoard?.();
                _renderHand?.();
                _renderShop?.();
                _toast?.('消耗牌生效！');
            }
        } catch (err) {
            my.hand.push(consumableCard);
            _renderHand();
            _toast?.('使用失败: ' + err.message, true);
        }
    }

    // ========== 初始化 ==========
    function init(deps) {
        setDeps(deps);
        enableDragOnHand();
        console.log('✅ consumable.js 已初始化');
    }

    return {
        init,
        showSelectionPanel
    };
})();
