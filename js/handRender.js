// ==================== 手牌渲染模块（独立） ====================
window.YYCardHandRender = (function() {
    const utils = window.YYCardUtils;

    // 复用工具函数（避免依赖 YYCardRender）
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }
    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }

    // 从 YYCardRender 获取创建卡牌元素的函数（纯视觉，无效果图标）
    function createCardElement(card, cardType) {
        // 直接使用 YYCardRender 暴露的方法，保证卡面完全一致
        if (window.YYCardRender && window.YYCardRender.createCardElement) {
            return window.YYCardRender.createCardElement(card, cardType, false);
        }
        // 兜底（理论上不会走到这里）
        const d = document.createElement('div');
        d.textContent = card.name || '?';
        return d;
    }

    function isDragging() {
        return (window.YYCardDrag && window.YYCardDrag.isDragging) || window._consumableDragging;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState ? window.YYCardBattle.getGameState() : null;
    }
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    // ----- 手牌布局参数 -----
    const CONTAINER_WIDTH_VW = 98;
    const CARD_WIDTH_VW = 23;
    const PADDING_LEFT_VW = 2;
    const PADDING_RIGHT_VW = 2;

    function renderHand() {
        if (isDragging()) return;
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;

        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const total = getValidHandCount(my.hand);

        container.style.display = 'flex';
        container.style.flexWrap = 'nowrap';
        container.style.alignItems = 'flex-end';
        container.style.paddingLeft = PADDING_LEFT_VW + 'vw';
        container.style.paddingRight = PADDING_RIGHT_VW + 'vw';

        if (total <= 4) {
            my.hand.forEach((card, i) => {
                if (isValidCard(card)) {
                    const el = createCardElement(card, 'hand');
                    el.setAttribute('data-hand-index', i);
                    el.setAttribute('data-card-type', 'hand');
                    el.setAttribute('data-instance-id', card.instanceId || '');

                    el.style.width = CARD_WIDTH_VW + 'vw';
                    el.style.flex = '0 0 ' + CARD_WIDTH_VW + 'vw';
                    el.style.margin = '0';
                    el.style.transform = 'none';
                    el.style.zIndex = '';

                    let marginRightVW = 0;
                    const slotWidth = CONTAINER_WIDTH_VW / total;
                    marginRightVW = slotWidth - CARD_WIDTH_VW;
                    let isLastValidCard = true;
                    for (let j = i + 1; j < my.hand.length; j++) {
                        if (isValidCard(my.hand[j])) {
                            isLastValidCard = false;
                            break;
                        }
                    }
                    if (isLastValidCard) marginRightVW = 0;
                    el.style.marginRight = marginRightVW + 'vw';
                    fragment.appendChild(el);
                }
            });
            container.appendChild(fragment);
            document.getElementById('hand-count').textContent = total;
            return;
        }

        // 多卡弧线布局
        const n = total;
        const availableX = CONTAINER_WIDTH_VW - PADDING_LEFT_VW - PADDING_RIGHT_VW - CARD_WIDTH_VW;
        const stepX = availableX / (n - 1);

        const arcHeightVW = 4.2;
        const maxRotateAngle = 12;

        let visualIdx = 0;
        my.hand.forEach((card, i) => {
            if (isValidCard(card)) {
                const el = createCardElement(card, 'hand');
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.setAttribute('data-instance-id', card.instanceId || '');

                el.style.width = CARD_WIDTH_VW + 'vw';
                el.style.flex = '0 0 ' + CARD_WIDTH_VW + 'vw';
                el.style.position = 'relative';
                el.style.margin = '0';

                const marginRight = visualIdx === n - 1 ? 0 : -(CARD_WIDTH_VW - stepX);
                el.style.marginRight = marginRight + 'vw';

                const t = visualIdx / (n - 1);
                const yOffset = Math.sin(t * Math.PI) * arcHeightVW;
                const angle = -maxRotateAngle + t * (2 * maxRotateAngle);
                el.style.transform = `translateY(-${yOffset}vw) rotate(${angle}deg)`;
                el.style.zIndex = visualIdx + 1;

                fragment.appendChild(el);
                visualIdx++;
            }
        });
        container.appendChild(fragment);
        document.getElementById('hand-count').textContent = total;
    }

    return { renderHand };
})();
