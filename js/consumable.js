// ==================== 消耗牌系统模块 (consumable.js · 完整版 · 纯色面板) ====================
window.YYCardConsumable = (function() {
    const supabase = window.supabase;
    const config = window.YYCardConfig;

    // 依赖注入
    let _getGameState, _getCurrentUserId, _getCurrentRoomId;
    let _renderHand, _renderMyBoard, _renderShop;
    let _toast;
    let _mergeUpdatedPlayer;

    let isSelectionOpen = false;
    let selectedCardId = null;

    // 拖拽状态
    let dragCard = null;
    let dragOriginEl = null;
    let dragOriginRect = null;
    let crosshair = null;
    let dashedLine = null;
    let highlightTarget = null;
    let rafId = null;
    let currentPoint = { x: 0, y: 0 };
    let isDragging = false;

    // ★ 稀有度颜色映射
    function getRarityColor(rarity) {
        switch (rarity) {
            case 'Common':    return '#94a3b8';
            case 'Rare':      return '#22c55e';
            case 'Epic':      return '#8b5cf6';
            case 'Legendary': return '#f59e0b';
            default:          return '#94a3b8';
        }
    }

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

    // ========== 状态检查与图标控制 ==========
    function getPendingCount() {
        const uid = getCurrentUserId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        const pending = my?.pendingConsumables;
        return (pending && Array.isArray(pending)) ? pending.length : 0;
    }

    function isPreparePhase() {
        const gs = getGameState();
        if (gs && gs.phase === 'prepare') return true;
        if (window.YYCardBattle?.getCurrentPhaseInfo) {
            const info = window.YYCardBattle.getCurrentPhaseInfo();
            return info && info.phase === 'prepare';
        }
        return false;
    }

    function updateRewardBadge() {
        const btn = document.getElementById('consumable-reward-btn');
        const badge = document.getElementById('consumable-reward-badge');
        if (!btn || !badge) return;
        const count = getPendingCount();
        badge.textContent = count;
        if (isPreparePhase() && count > 0) {
            btn.style.display = 'flex';
            badge.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    }

    function createRewardIcon() {
        if (document.getElementById('consumable-reward-btn')) return;
        const btn = document.createElement('div');
        btn.id = 'consumable-reward-btn';
        btn.style.cssText = `
            position: fixed; top: 12vh; right: 3vw; z-index: 2000;
            width: 12vw; height: 12vw; background: rgba(255,215,0,0.9);
            border-radius: 50%; display: none; align-items: center; justify-content: center;
            box-shadow: 0 0 2vmin rgba(255,215,0,0.6); cursor: pointer;
        `;
        btn.innerHTML = '<span style="font-size:8vw;">🎁</span>';
        const badge = document.createElement('span');
        badge.id = 'consumable-reward-badge';
        badge.style.cssText = `
            position: absolute; top: -1vw; right: -1vw;
            background: red; color: white; border-radius: 50%;
            width: 5vw; height: 5vw; display: none;
            align-items: center; justify-content: center;
            font-size: 3vw; font-weight: bold;
        `;
        btn.appendChild(badge);
        btn.addEventListener('click', showSelectionPanel);
        document.body.appendChild(btn);
        updateRewardBadge();
    }

    // ========== UI 选择面板 ==========
    function showSelectionPanel() {
        try {
            if (isSelectionOpen) return;
            const uid = getCurrentUserId();
            const gs = getGameState();
            const my = gs?.players?.[uid];
            const pending = my?.pendingConsumables;
            if (!pending || !Array.isArray(pending) || pending.length === 0) {
                _toast?.('没有待选的消耗牌');
                updateRewardBadge();
                return;
            }
            const firstGroup = pending[0]?.group;
            if (!firstGroup || firstGroup.length === 0) {
                _toast?.('奖励数据异常');
                updateRewardBadge();
                return;
            }
            isSelectionOpen = true;
            const overlay = document.createElement('div');
            overlay.id = 'consumable-select-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.6); z-index: 3000;
                display: flex; align-items: center; justify-content: center;
            `;
            const panel = document.createElement('div');
            panel.className = 'shop-area';
            panel.style.cssText = `
                position: relative; width: 90vw; height: 43.5vh; background: rgba(10,18,30,0.9);
                backdrop-filter: blur(8px); border-radius: 3vmin; padding: 2vh 2vw;
                display: flex; flex-direction: column;
            `;
            panel.innerHTML = `
                <div style="text-align:center; color:#f5d76e; font-weight:bold; font-size:1.2rem; margin-bottom:1vh;">
                    ✨ 选择一张消耗牌 ✨
                </div>
                <div id="consumable-cards" class="shop-cards" style="display:flex; justify-content:center; gap:2vw; flex:1;"></div>
                <div style="text-align:center; margin-top:1vh;">
                    <button id="consumable-confirm-btn" class="btn btn-primary" disabled>加入手牌</button>
                </div>
            `;
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            const cardsContainer = panel.querySelector('#consumable-cards');
            firstGroup.forEach(cardData => {
                const cardEl = createConsumableCardElementFromData(cardData);
                cardEl.addEventListener('click', () => selectCardInPanel(cardData.card_id, cardEl));
                cardsContainer.appendChild(cardEl);
            });
            const confirmBtn = panel.querySelector('#consumable-confirm-btn');
            confirmBtn.addEventListener('click', confirmSelection);
        } catch (e) {
            console.error('面板创建失败:', e);
            closeSelectionPanel();
        }
    }

    function createConsumableCardElementFromData(cardData) {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-rarity', cardData.rarity);
        const color = getRarityColor(cardData.rarity);
        card.style.cssText = `
            width: 23.6vw; height: 29.1vw; border-radius: 1.5vmin;
            background: ${color};
            border: 2px solid ${color};
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; cursor: pointer;
            padding: 1vh 2vw;
        `;
        // 只显示描述文字
        const descEl = document.createElement('div');
        descEl.className = 'card-desc';
        descEl.textContent = cardData.name;   // name 里面存的就是 description
        descEl.style.cssText = `
            color: white;
            font-weight: bold;
            font-size: clamp(0.6rem, 1.8vw, 0.8rem);
            text-align: center;
            line-height: 1.3;
            text-shadow: 0 0 4px rgba(0,0,0,0.8);
        `;
        card.appendChild(descEl);
        return card;
    }

    // formatEffectDescFromData 可以保留，但不再用于卡牌渲染
    function formatEffectDescFromData(cardData) {
        const eff = cardData.effect;
        const ctype = cardData.consumable_type;
        if (ctype === 'other') {
            if (eff.effect_type === 'add_gold') return `+${eff.value} 金币`;
            if (eff.effect_type === 'add_exp') return `+${eff.value} 经验`;
            if (eff.effect_type === 'add_chi') return `内力 +${eff.value}`;
            if (eff.effect_type === 'add_shield') return `护盾 +${eff.value}`;
            return '立即生效';
        }
        if (eff.type === 'gain_attack') return `攻击 +${eff.value}`;
        if (eff.type === 'gain_health') return `生命 +${eff.value}`;
        if (eff.type === 'gain_gold') return `金币 +${eff.value}`;
        if (eff.type === 'gain_attack_health') return `攻击 +${eff.attack} 生命 +${eff.health}`;
        return '未知效果';
    }

    function selectCardInPanel(cardId, cardEl) {
        document.querySelectorAll('#consumable-cards .card').forEach(c => c.classList.remove('selected'));
        cardEl.classList.add('selected');
        selectedCardId = cardId;
        const confirmBtn = document.getElementById('consumable-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = false;
    }

    async function confirmSelection() {
        if (!selectedCardId) return;
        const uid = getCurrentUserId();
        const roomId = getCurrentRoomId();
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('未登录');
            const functionUrl = `${config.SUPABASE_URL}/functions/v1/select-consumable`;
            const resp = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ roomId, userId: uid, selectedCardId }),
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '选择失败');
            const gs = getGameState();
            const my = gs.players[uid];
            if (result.updatedPlayer) {
                my.pendingConsumables = result.updatedPlayer.pendingConsumables || [];
                _mergeUpdatedPlayer?.(my, result.updatedPlayer);
            }
            _renderHand?.();
            updateRewardBadge();
            const remainingCount = result.remainingCount || 0;
            closeSelectionPanel();
            if (remainingCount > 0) {
                setTimeout(() => { showSelectionPanel(); }, 300);
            } else {
                _toast?.('所有奖励已领取！');
            }
        } catch (err) {
            _toast?.('选择失败: ' + err.message, true);
        }
    }

    function closeSelectionPanel() {
        const overlay = document.getElementById('consumable-select-overlay');
        if (overlay) overlay.remove();
        isSelectionOpen = false;
        selectedCardId = null;
    }

    // ========== 拖拽核心（RAF驱动，跟手，无残留） ==========
    function enableDragOnHand() {
        const handContainer = document.getElementById('hand-container');
        if (!handContainer) return;
        handContainer.addEventListener('touchstart', onDragStart, { passive: false });
        handContainer.addEventListener('mousedown', onDragStart);
    }

    function onDragStart(e) {
        if (isDragging) return;
        const target = e.target.closest('.card');
        if (!target) return;
        const instanceId = target.getAttribute('data-instance-id');
        if (!instanceId) return;
        const uid = getCurrentUserId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my) return;
        const card = my.hand.find(c => c && c.instanceId === instanceId);
        if (!card || (card.type !== 'consumable' && !card.isConsumable)) return;
        e.preventDefault();
        window._consumableDragging = true;
        dragCard = card;
        dragOriginEl = target;
        dragOriginRect = target.getBoundingClientRect();
        isDragging = true;
        const point = e.touches ? e.touches[0] : e;
        currentPoint.x = point.clientX;
        currentPoint.y = point.clientY;
        crosshair = document.createElement('div');
        crosshair.style.cssText = `
            position: fixed; z-index: 1100; pointer-events: none;
            width: 30px; height: 30px; transform: translate(-50%, -50%);
            border: 2px solid #f5d76e; border-radius: 50%;
            box-shadow: 0 0 8px #f5d76e;
            background: radial-gradient(circle, rgba(245,215,110,0.3) 0%, transparent 70%);
            left: ${currentPoint.x}px; top: ${currentPoint.y}px;
        `;
        document.body.appendChild(crosshair);
        const originX = dragOriginRect.left + dragOriginRect.width / 2;
        const originY = dragOriginRect.top + dragOriginRect.height / 2;
        dashedLine = document.createElement('div');
        dashedLine.style.cssText = `
            position: fixed; z-index: 1099; pointer-events: none;
            border-top: 2px dashed #f5d76e;
            transform-origin: left center;
            left: ${originX}px; top: ${originY}px;
        `;
        document.body.appendChild(dashedLine);
        updateDraggingVisuals();
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const point = e.touches ? e.touches[0] : e;
        currentPoint.x = point.clientX;
        currentPoint.y = point.clientY;
    }

    function updateDraggingVisuals() {
        if (!isDragging) return;
        if (crosshair) {
            crosshair.style.left = currentPoint.x + 'px';
            crosshair.style.top = currentPoint.y + 'px';
        }
        if (dashedLine && dragOriginRect) {
            const originX = dragOriginRect.left + dragOriginRect.width / 2;
            const originY = dragOriginRect.top + dragOriginRect.height / 2;
            const dx = currentPoint.x - originX;
            const dy = currentPoint.y - originY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            dashedLine.style.width = length + 'px';
            dashedLine.style.left = originX + 'px';
            dashedLine.style.top = originY + 'px';
            dashedLine.style.transform = `rotate(${angle}deg)`;
        }
        if (highlightTarget) {
            highlightTarget.classList.remove('consumable-allowed');
            highlightTarget = null;
        }
        if (dragCard && dragCard.target_scope !== 'all') {
            const el = getTargetUnderPoint(currentPoint);
            if (el) {
                el.classList.add('consumable-allowed');
                highlightTarget = el;
            }
        } else if (dragCard && dragCard.target_scope === 'all') {
            const boardEl = document.getElementById('my-board');
            if (boardEl) {
                const rect = boardEl.getBoundingClientRect();
                if (currentPoint.x >= rect.left && currentPoint.x <= rect.right &&
                    currentPoint.y >= rect.top && currentPoint.y <= rect.bottom) {
                    boardEl.classList.add('consumable-allowed');
                    highlightTarget = boardEl;
                }
            }
        }
        rafId = requestAnimationFrame(updateDraggingVisuals);
    }

    function getTargetUnderPoint(point) {
        const elements = document.elementsFromPoint(point.x, point.y);
        for (const el of elements) {
            if (el.classList.contains('card') && !el.classList.contains('empty-slot') && !el.closest('#consumable-cards')) {
                const slot = el.closest('.card-slot');
                if (!slot) continue;
                const boardIndex = slot.getAttribute('data-board-index');
                const uid = getCurrentUserId();
                const gs = getGameState();
                const my = gs?.players?.[uid];
                if (boardIndex !== null && my?.board) {
                    const card = my.board[parseInt(boardIndex)];
                    if (card && !card.isConsumable) return el;
                }
            }
        }
        return null;
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('touchcancel', onDragEnd);
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        isDragging = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        const point = e.changedTouches ? e.changedTouches[0] : e;
        currentPoint.x = point.clientX;
        currentPoint.y = point.clientY;
        const card = dragCard;
        if (card) {
            if (card.target_scope === 'all') {
                const boardEl = document.getElementById('my-board');
                let isOverBoard = false;
                if (boardEl) {
                    const rect = boardEl.getBoundingClientRect();
                    isOverBoard = currentPoint.x >= rect.left && currentPoint.x <= rect.right &&
                                   currentPoint.y >= rect.top && currentPoint.y <= rect.bottom;
                }
                if (isOverBoard) useConsumableAll(card);
            } else {
                const targetEl = getTargetUnderPoint(currentPoint);
                if (targetEl) useConsumableOnTarget(card, targetEl);
            }
        }
        cleanupDrag();
    }

    function cleanupDrag() {
        if (crosshair) { crosshair.remove(); crosshair = null; }
        if (dashedLine) { dashedLine.remove(); dashedLine = null; }
        if (highlightTarget) { highlightTarget.classList.remove('consumable-allowed'); highlightTarget = null; }
        dragCard = null;
        dragOriginEl = null;
        dragOriginRect = null;
        window._consumableDragging = false;
    }

    async function useConsumableOnTarget(consumableCard, targetEl) {
        const uid = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my) return;
        const slot = targetEl.closest('.card-slot');
        if (!slot || !slot.hasAttribute('data-board-index')) return;
        const idx = parseInt(slot.getAttribute('data-board-index'));
        const targetCard = my.board[idx];
        if (!targetCard) return;

        // 乐观更新（对直接属性）
        const eff = consumableCard.effect;
        if (eff.effect_type === 'add_chi') {
            targetCard.chi = (targetCard.chi || 0) + (eff.value || 0);
        } else if (eff.effect_type === 'add_shield') {
            targetCard.shield = (targetCard.shield || 0) + (eff.value || 0);
        }
        _renderMyBoard?.();

        const handIdx = my.hand.findIndex(c => c && c.instanceId === consumableCard.instanceId);
        if (handIdx !== -1) my.hand.splice(handIdx, 1);
        _renderHand();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('未登录');
            const functionUrl = `${config.SUPABASE_URL}/functions/v1/use-consumable`;
            const resp = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    roomId,
                    userId: uid,
                    consumableInstanceId: consumableCard.instanceId,
                    targetInstanceId: targetCard.instanceId,
                    targetLocation: 'board'
                }),
            });
            const data = await resp.json();
            if (!data?.success) throw new Error(data.error || '使用失败');
            if (data.updatedPlayer) {
                _mergeUpdatedPlayer?.(my, data.updatedPlayer);
            }
            _renderMyBoard?.();
            _renderHand?.();
            _renderShop?.();
            _toast?.('消耗牌生效！');
        } catch (err) {
            my.hand.push(consumableCard);
            if (window.YYCardBattle?.forceRefreshState) {
                await window.YYCardBattle.forceRefreshState();
            }
            _toast?.('使用失败: ' + err.message, true);
        }
    }

    async function useConsumableAll(consumableCard) {
        const uid = getCurrentUserId();
        const roomId = getCurrentRoomId();
        const gs = getGameState();
        const my = gs?.players?.[uid];
        if (!my) return;
        const handIdx = my.hand.findIndex(c => c && c.instanceId === consumableCard.instanceId);
        if (handIdx !== -1) my.hand.splice(handIdx, 1);
        _renderHand();
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('未登录');
            const functionUrl = `${config.SUPABASE_URL}/functions/v1/use-consumable-all`;
            const resp = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    roomId,
                    userId: uid,
                    consumableInstanceId: consumableCard.instanceId,
                }),
            });
            const data = await resp.json();
            if (!data?.success) throw new Error(data.error || '使用失败');
            if (data.updatedPlayer) {
                _mergeUpdatedPlayer?.(my, data.updatedPlayer);
                _renderMyBoard?.();
                _renderHand?.();
                _renderShop?.();
                _toast?.('全体消耗牌已生效！');
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
        createRewardIcon();
        enableDragOnHand();
        if (!document.getElementById('consumable-styles')) {
            const style = document.createElement('style');
            style.id = 'consumable-styles';
            style.textContent = `
                .consumable-allowed {
                    box-shadow: 0 0 0 3px #00ff00 !important;
                    transition: box-shadow 0.05s;
                }
            `;
            document.head.appendChild(style);
        }
        const originalTick = window.YYCardBattle?.tick;
        if (originalTick) {
            const wrappedTick = async function() {
                await originalTick.apply(window.YYCardBattle, arguments);
                updateRewardBadge();
                if (!isPreparePhase() && isSelectionOpen) {
                    closeSelectionPanel();
                }
            };
            window.YYCardBattle.tick = wrappedTick;
        }
        console.log('✅ consumable.js 已初始化（纯色面板版）');
    }

    return {
        init,
        showSelectionPanel,
        updateRewardBadge
    };
})();
