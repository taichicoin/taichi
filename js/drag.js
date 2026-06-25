// ==================== 纯拖拽交互模块 (drag.js) ====================
window.YYCardDrag = (function() {
    // 拖拽状态机
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
        currentY: 0,
        pointerId: null
    };

    // ========== 底层辅助 ==========
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

    // ========== 强制取消当前拖拽 ==========
    function cancelCurrentDrag() {
        if (!dragState.active) return;

        if (dragState.cloneElement && dragState.cloneElement.parentNode) {
            dragState.cloneElement.remove();
        }
        if (dragState.sourceElement) {
            dragState.sourceElement.style.visibility = '';
        }
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        dragState.active = false;
        dragState.pointerId = null;
        isDragging = false;
    }

    // ========== 拖拽开始 ==========
    function onDragStart(e, type, card, index, element, canOperateFn, onDropCallback) {
        if (card && (card.type === 'consumable' || card.isConsumable)) return;
        if (!canOperateFn || !canOperateFn()) return;

        if (window.mergeService && window.mergeService.isCardInMerge && window.mergeService.isCardInMerge(card)) {
            return;
        }

        if (isDragging) {
            cancelCurrentDrag();
        }

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
            startX: clientX, startY: clientY, currentX: clientX, currentY: clientY,
            pointerId: e.pointerId
        };

        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', (ev) => onDragEnd(ev, onDropCallback));
        document.addEventListener('pointercancel', (ev) => onDragEnd(ev, onDropCallback));
    }

    // ========== 拖拽移动 ==========
    const throttledDragMove = throttle(function(e) {
        if (!dragState.active || e.pointerId !== dragState.pointerId) return;
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

    // ========== 拖拽结束与位置解析 ==========
    function onDragEnd(e, onDropCallback) {
        if (!dragState.active || e.pointerId !== dragState.pointerId) return;
        e.preventDefault();
        
        const { type, sourceElement, cloneElement, currentX, currentY, index } = dragState;
        
        cloneElement.remove();
        
        // 提前清理高亮和监听
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        isDragging = false;

        const targetElement = document.elementFromPoint(currentX, currentY);
        let dropResult = null;
        if (targetElement) {
            dropResult = getDropTarget(targetElement);
        }

        // 核心：立刻执行业务逻辑（注意，源卡牌此时还保持隐藏状态）
        if (dropResult && onDropCallback) {
            onDropCallback(type, index, dropResult);
        }

        // ★【终极必杀：绝不先恢复，等业务落子完成，重绘结束或失败后，再安全恢复】
        // 延迟 0ms 推入下一个执行周期，此时如果触发了重绘，sourceElement 旧节点已经被 innerHTML 彻底销毁。
        // 如果重绘成功，旧节点销毁 -> 跳过恢复 (无残影)。
        // 如果重绘失败，旧节点还在 -> 安全恢复 (无消失)。
        setTimeout(() => {
            if (sourceElement && document.contains(sourceElement)) {
                sourceElement.style.visibility = '';
            }
        }, 0);

        dragState.active = false;
    }

    // ========== 命中检测 ==========
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            if (el.closest('.shop-area')) return { zone: 'shop' };

            if (el.classList.contains('card-slot')) {
                const board = el.closest('.board');
                if (board?.id === 'my-board') {
                    const slotIndex = el.getAttribute('data-slot-index');
                    if (slotIndex !== null) {
                        const gameState = window.YYCardBattle?.getGameState?.();
                        const userId = window.YYCardAuth?.currentUser?.id || null;
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

    return {
        get isDragging() { return isDragging; },
        get dragState() { return dragState; },
        onDragStart,
        onDragEnd,
        getDropTarget,
        cancelCurrentDrag
    };
})();
