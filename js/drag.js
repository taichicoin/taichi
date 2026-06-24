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

    // ★★★ 播放 loot/消耗牌 专用音效 ★★★
    function playUseSound() {
        try {
            const audio = new Audio('/assets/mp3/use.mp3');
            audio.volume = 0.8;
            audio.play().catch(function() {});
        } catch (e) {}
    }

    // ========== 强制取消当前拖拽 ==========
    function cancelCurrentDrag() {
        if (!dragState.active) return;

        // 移除克隆体
        if (dragState.cloneElement && dragState.cloneElement.parentNode) {
            dragState.cloneElement.remove();
        }

        // 恢复源卡牌可见性
        if (dragState.sourceElement) {
            dragState.sourceElement.style.visibility = '';
        }

        // 移除高亮
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

        // 移除事件监听
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 重置状态
        dragState.active = false;
        dragState.pointerId = null;
        isDragging = false;
    }

    // ========== 拖拽开始 ==========
    function onDragStart(e, type, card, index, element, canOperateFn, onDropCallback) {
        // 消耗牌不能拖拽
        if (card && (card.type === 'consumable' || card.isConsumable)) return;

        // 检查当前能否操作
        if (!canOperateFn || !canOperateFn()) return;

        // 检查合成状态
        if (window.mergeService && window.mergeService.isCardInMerge && window.mergeService.isCardInMerge(card)) {
            // 可以通过传入 toast 回调，这里留空让外部调用接口传参
            return;
        }

        // ★ 如果已有拖拽进行中，先强制取消它
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

        // ★ loot 牌拖拽播放音效
        if (card && card.type === 'loot') {
            playUseSound();
        }

        // 绑定全局移动和结束事件
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

        // 悬停商店高亮判定
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
        
        // 清理克隆体和UI状态
        cloneElement.remove();
        sourceElement.style.visibility = '';
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        isDragging = false;

        // 获取鼠标下的目标元素
        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) {
            dragState.active = false;
            return;
        }

        // 解析掉落的区域和位置
        const dropResult = getDropTarget(targetElement);
        
        // ★ 核心出口：将抓取到的数据抛回给业务层（shop.js 等）去处理
        if (dropResult && onDropCallback) {
            onDropCallback(type, index, dropResult);
        }

        dragState.active = false;
    }

    // ========== 命中检测（纯物理解析） ==========
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

    // ========== 对外暴露接口 ==========
    return {
        // 状态
        get isDragging() { return isDragging; },
        get dragState() { return dragState; },
        
        // 核心动作
        onDragStart,
        onDragEnd,
        getDropTarget,
        cancelCurrentDrag,
        playUseSound
    };
})();
