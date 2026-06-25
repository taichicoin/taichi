// ==================== 拖拽模块：负责卡牌拖拽交互与目标识别 ====================
window.YYCardDrag = (function() {
    // ========== 依赖注入缓存 ==========
    let deps = {};

    // ========== 拖拽状态 ==========
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

    let _isDragging = false;  // 内部状态，通过 getter 暴露

    // ========== 工具函数（局部） ==========
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

    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    // 获取当前游戏状态（依赖注入的函数）
    function getGameState() {
        return deps.getGameState();
    }
    function getCurrentUserId() {
        return deps.getCurrentUserId();
    }
    function canOperate() {
        return deps.canOperate();
    }
    function isCardInMerge(card) {
        return deps.isCardInMerge ? deps.isCardInMerge(card) : false;
    }
    function toast(msg, isErr, dur) {
        return deps.toast(msg, isErr, dur);
    }

    // ========== 音频 ==========
    function playGrabSound() {
        try { deps.emit('grab'); } catch(e) {}
    }
    function playUseSound() {
        try {
            const audio = new Audio('/assets/mp3/use.mp3');
            audio.volume = 0.8;
            audio.play().catch(function(){});
        } catch (e) {}
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
        _isDragging = false;
    }

    // ========== 拖拽开始 ==========
    function onDragStart(e, type, card, index, element) {
        // 消耗牌不走这里的拖拽（由 consumable.js 处理）
        if (card && (card.type === 'consumable' || card.isConsumable)) return;

        if (!canOperate()) return;
        if (isCardInMerge(card)) {
            toast('该卡牌正在参与合成，无法操作', true);
            return;
        }

        if (_isDragging) {
            cancelCurrentDrag();
        }

        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);
        _isDragging = true;

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
            active: true, type, card, index,
            sourceElement: element, cloneElement: clone,
            startX: clientX, startY: clientY,
            currentX: clientX, currentY: clientY,
            pointerId: e.pointerId
        };

        // loot 牌拖拽播放 use 音效，否则 grab
        if (card && card.type === 'loot') {
            playUseSound();
        } else {
            playGrabSound();
        }

        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    // ========== 拖拽移动（节流） ==========
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

        // 商店区域高亮
        const shopContainer = document.getElementById('shop-container');
        if (shopContainer) {
            const shopArea = shopContainer.closest('.shop-area') || shopContainer.closest('.shop') || shopContainer;
            const rect = shopArea.getBoundingClientRect();
            const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                               clientY >= rect.top && clientY <= rect.bottom;
            shopArea.classList.toggle('drop-target', isOverShop);
        }
    }, 16);

    // ========== 拖拽结束 ==========
    function onDragEnd(e) {
        if (!dragState.active || e.pointerId !== dragState.pointerId) return;
        e.preventDefault();
        const { type, sourceElement, cloneElement, currentX, currentY, index } = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        _isDragging = false;

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

    // ========== 识别放置目标 ==========
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            if (el.closest('.shop-area')) return { zone: 'shop' };

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

    // ========== 执行拖放动作（调用注入的业务函数） ==========
    async function executeDropAction(type, index, dropResult) {
        // 手牌
        if (type === 'hand') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const card = gameState?.players[userId]?.hand[index];
            if (!card) return;

            // loot 牌
            if (card.type === 'loot') {
                if (dropResult.zone === 'board') {
                    if (dropResult.hasCharacter) {
                        await deps.useLootOnCharacter(index, dropResult.index);
                    } else {
                        await deps.handleHandToBoard(index, dropResult.index);
                    }
                } else if (dropResult.zone === 'shop') {
                    await deps.handleSell('hand', index);
                } else {
                    toast('亡魂碎片只能放到棋盘上或出售', true);
                }
                return;
            }

            // 武器/道具
            if (card.type === 'weapon' || card.type === 'item') {
                if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                    await deps.equipFromHand(index, dropResult.index);
                } else if (dropResult.zone === 'shop') {
                    await deps.handleSell('hand', index);
                } else {
                    toast('武器/道具只能装备到角色身上，或拖到商店出售', true);
                }
                return;
            }
        }

        // 商店
        if (type === 'shop') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const shop = gameState?.players[userId]?.shopCards;
            const active = shop?.active ?? 0;
            const card = shop?.buffer?.[active]?.[index];
            if (card && (card.type === 'weapon' || card.type === 'item')) {
                if (dropResult.zone === 'board' && dropResult.hasCharacter) {
                    await deps.equipFromShop(index, dropResult.index);
                } else if (dropResult.zone === 'hand') {
                    await deps.handleShopToHand(card, index);
                } else {
                    toast('武器/道具可拖到手牌购买或直接装备到角色', true);
                }
                return;
            }
        }

        // 常规拖拽（非装备/物品）
        if (type === 'hand') {
            if (dropResult.zone === 'board') await deps.handleHandToBoard(index, dropResult.index);
            else if (dropResult.zone === 'shop') await deps.handleSell('hand', index);
        } else if (type === 'board') {
            if (dropResult.zone === 'board') await deps.handleBoardSwap(index, dropResult.index);
            else if (dropResult.zone === 'hand') await deps.handleBoardToHand(index);
            else if (dropResult.zone === 'shop') await deps.handleSell('board', index);
        } else if (type === 'shop') {
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const shop = gameState?.players[userId]?.shopCards;
            const active = shop?.active ?? 0;
            const card = shop?.buffer?.[active]?.[index];
            if (dropResult.zone === 'board') await deps.handleShopToBoard(card, index, dropResult.index);
            else if (dropResult.zone === 'hand') await deps.handleShopToHand(card, index);
        }
    }

    // ========== 事件绑定：给所有可拖拽卡牌绑定 pointerdown ==========
    function bindCards() {
        // 为避免重复绑定，可先解绑，但使用新监听器替换更简单
        // 我们移除旧事件再绑定（移除所有 pointerdown 再重新绑定，可能影响其他功能，所以改用标记）
        // 稳妥做法：使用事件委托或克隆元素时重新绑定，这里简单方案是每次都重新绑定
        const cards = document.querySelectorAll('.card[data-card-type="hand"], .card[data-card-type="shop"], .card[data-card-type="board"]');
        cards.forEach(el => {
            // 移除之前绑定的 drag 事件（如果绑定了特定函数，需要用同一个函数引用才能移除，所以这里直接设置新事件）
            // 解决办法：使用一个标记，或者使用 addEventListener 的 once 模式不合适。
            // 我们将绑定逻辑提取到一个具名函数，然后移除再添加。
            // 简单处理：先移除所有 'pointerdown' 监听器（可能会影响其他，但卡牌上只有拖拽事件）
            el.removeEventListener('pointerdown', handlePointerDown);
            el.addEventListener('pointerdown', handlePointerDown);
        });
    }

    function handlePointerDown(e) {
        // 从元素属性获取拖拽信息
        const el = e.currentTarget;
        const cardType = el.getAttribute('data-card-type');
        const indexStr = el.getAttribute('data-hand-index') || el.getAttribute('data-shop-index') || el.getAttribute('data-board-index');
        if (indexStr === null) return;
        const index = parseInt(indexStr);

        let card = null;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (cardType === 'hand') {
            card = my.hand[index];
        } else if (cardType === 'shop') {
            const shop = my.shopCards;
            const active = shop?.active ?? 0;
            const group = shop?.buffer?.[active];
            card = group ? group[index] : null;
        } else if (cardType === 'board') {
            card = my.board[index];
        }

        if (!card) return;
        // 消耗品不处理
        if (card.type === 'consumable' || card.isConsumable) return;

        onDragStart(e, cardType, card, index, el);
    }

    // ========== 初始化：注入依赖 ==========
    function init(dependencies) {
        deps = {
            getGameState: dependencies.getGameState,
            getCurrentUserId: dependencies.getCurrentUserId,
            getCurrentRoomId: dependencies.getCurrentRoomId,
            canOperate: dependencies.canOperate,
            isCardInMerge: dependencies.isCardInMerge || (() => false),
            toast: dependencies.toast,
            emit: dependencies.emit || (() => {}),

            // 业务函数
            handleSell: dependencies.handleSell,
            handleHandToBoard: dependencies.handleHandToBoard,
            handleBoardSwap: dependencies.handleBoardSwap,
            handleBoardToHand: dependencies.handleBoardToHand,
            handleShopToBoard: dependencies.handleShopToBoard,
            handleShopToHand: dependencies.handleShopToHand,
            equipFromHand: dependencies.equipFromHand,
            equipFromShop: dependencies.equipFromShop,
            useLootOnCharacter: dependencies.useLootOnCharacter
        };

        // 初始绑定（页面可能已渲染）
        bindCards();
    }

    // 公开 API
    return {
        init,
        bindCards,
        cancelCurrentDrag,
        get isDragging() {
            return _isDragging;
        }
    };
})();
