// ==================== 效果装饰模块（护盾+道具外显） ====================
// 职责：为卡牌元素添加护盾数字、嘲讽图标、跳过行动图标等效果
// 被 render.js 中的 renderBoard、renderHand 调用

window.YYCardItemRender = (function() {

    const EFFECT_ICONS = {
        taunt: '/assets/logo/taunt.png',   // 嘲讽图标
        skip_turn: '🚫'                    // 跳过行动
    };

    // 效果图标项之间的水平间隔（加大了一点）
    const ICON_GAP = '6px';

    function parseAbilities(abilities) {
        if (!abilities) return [];
        if (typeof abilities === 'string') {
            try { return JSON.parse(abilities); } catch (e) { return []; }
        }
        return Array.isArray(abilities) ? abilities : [];
    }

    function hasAbility(abilities, type) {
        return parseAbilities(abilities).some(a => a.effect && a.effect.type === type);
    }

    function cardHasEffect(card, type) {
        if (!card) return false;
        if (hasAbility(card.abilities, type)) return true;
        if (card.weapon && hasAbility(card.weapon.abilities, type)) return true;
        if (card.item1 && hasAbility(card.item1.abilities, type)) return true;
        if (card.item2 && hasAbility(card.item2.abilities, type)) return true;
        return false;
    }

    // 护盾数字（保持和原 .card-shield 完全一致的样式）
    function createShieldElement(total) {
        const shieldDiv = document.createElement('div');
        shieldDiv.className = 'card-shield'; // 沿用游戏原有样式
        // 如果原样式有绝对定位等，这里用内联覆盖让它正常处于文档流
        shieldDiv.style.cssText = `
            position: static;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 150, 255, 0.8);
            color: white;
            font-weight: bold;
            font-size: clamp(0.7rem, 2.2vw, 1rem);
            padding: 0 0.4em;
            border-radius: 50%;
            text-shadow: 0 0 3px black;
            white-space: nowrap;
            height: auto;
            line-height: 1;
        `;
        shieldDiv.textContent = total;
        return shieldDiv;
    }

    // 嘲讽图标（放大 20%）
    function createTauntElement() {
        const img = document.createElement('img');
        img.src = EFFECT_ICONS.taunt;
        img.alt = '嘲讽';
        img.style.cssText = `
            width: clamp(17px, 5vw, 29px);
            height: auto;
            object-fit: contain;
            display: block;
        `;
        return img;
    }

    // 跳过行动符号（放大 20%，方形比例）
    function createSkipTurnElement() {
        const span = document.createElement('span');
        span.textContent = EFFECT_ICONS.skip_turn;
        span.style.cssText = `
            font-size: clamp(17px, 5vw, 29px);
            color: #ff4d4d;
            text-shadow: 0 0 4px black;
            font-weight: bold;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        `;
        return span;
    }

    function applyEffects(cardElement, card, options = {}) {
        if (!cardElement || !card) return;
        const { includeIcons = true } = options;

        // 移除旧的效果容器
        const oldContainer = cardElement.querySelector('.card-effects-container');
        if (oldContainer) oldContainer.remove();

        const items = [];
        const totalShield = (card.shield || 0) + (card.tempShield || 0);
        if (totalShield > 0) {
            items.push(createShieldElement(totalShield));
        }
        if (includeIcons) {
            if (cardHasEffect(card, 'taunt')) {
                items.push(createTauntElement());
            }
            if (cardHasEffect(card, 'skip_turn')) {
                items.push(createSkipTurnElement());
            }
        }

        if (items.length === 0) return;

        const container = document.createElement('div');
        container.className = 'card-effects-container';
        container.style.cssText = `
            position: absolute;
            top: -0.2vh;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: ${ICON_GAP};
            z-index: 10;
            pointer-events: none;
        `;

        items.forEach(el => container.appendChild(el));
        cardElement.appendChild(container);
    }

    return { applyEffects };
})();
