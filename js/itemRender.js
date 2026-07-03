// ==================== 效果装饰模块（护盾+道具外显） ====================
// 职责：为卡牌元素添加护盾数字、嘲讽图标、跳过行动图标等效果
// 被 render.js 中的 renderBoard、renderHand 调用
window.YYCardItemRender = (function() {

    const EFFECT_ICONS = {
        taunt: '/assets/logo/taunt.png',   // 嘲讽图标（需确保图片存在）
        skip_turn: '🚫'                    // 跳过行动
    };

    // 效果图标项之间的水平间隔（vw单位，会根据卡牌大小自适应）
    const ICON_GAP = '2px';

    // 解析 abilities（可能是字符串）
    function parseAbilities(abilities) {
        if (!abilities) return [];
        if (typeof abilities === 'string') {
            try { return JSON.parse(abilities); } catch (e) { return []; }
        }
        return Array.isArray(abilities) ? abilities : [];
    }

    // 检查 abilities 中是否包含指定效果类型
    function hasAbility(abilities, type) {
        return parseAbilities(abilities).some(a => a.effect && a.effect.type === type);
    }

    // 检查一张棋盘卡（角色 + 装备的武器/道具）是否有某效果
    function cardHasEffect(card, type) {
        if (!card) return false;
        // 角色本身
        if (hasAbility(card.abilities, type)) return true;
        // 装备的武器
        if (card.weapon && hasAbility(card.weapon.abilities, type)) return true;
        // 道具1
        if (card.item1 && hasAbility(card.item1.abilities, type)) return true;
        // 道具2
        if (card.item2 && hasAbility(card.item2.abilities, type)) return true;
        return false;
    }

    // 生成护盾数字元素
    function createShieldElement(totalShield) {
        const span = document.createElement('span');
        span.className = 'card-shield-inline';
        span.textContent = totalShield;
        // 护盾数字的样式（与原来 .card-shield 类似，但现在作为 flex 子项）
        span.style.cssText = `
            background: rgba(0, 150, 255, 0.8);
            color: white;
            font-weight: bold;
            font-size: clamp(0.6rem, 2vw, 0.9rem);
            padding: 0 0.3em;
            border-radius: 10px;
            text-shadow: 0 0 3px black;
            white-space: nowrap;
        `;
        return span;
    }

    // 生成嘲讽图片元素
    function createTauntElement() {
        const img = document.createElement('img');
        img.src = EFFECT_ICONS.taunt;
        img.alt = '嘲讽';
        img.style.cssText = 'width: clamp(14px, 4vw, 24px); height: auto; display: block;';
        return img;
    }

    // 生成跳过行动符号元素
    function createSkipTurnElement() {
        const span = document.createElement('span');
        span.textContent = EFFECT_ICONS.skip_turn;
        span.style.cssText = `
            font-size: clamp(14px, 4vw, 24px);
            color: #ff4d4d;
            text-shadow: 0 0 4px black;
            font-weight: bold;
            line-height: 1;
        `;
        return span;
    }

    // ========== 统一入口：应用所有效果 ==========
    function applyEffects(cardElement, card, options = {}) {
        if (!cardElement || !card) return;
        const { includeIcons = true } = options;

        // 移除旧的效果容器
        const oldContainer = cardElement.querySelector('.card-effects-container');
        if (oldContainer) oldContainer.remove();

        // 收集需要显示的效果项（顺序：护盾 → 嘲讽 → 跳过行动）
        const items = [];
        const totalShield = (card.shield || 0) + (card.tempShield || 0);
        if (totalShield > 0) {
            items.push({ type: 'shield', element: createShieldElement(totalShield) });
        }
        if (includeIcons) {
            if (cardHasEffect(card, 'taunt')) {
                items.push({ type: 'taunt', element: createTauntElement() });
            }
            if (cardHasEffect(card, 'skip_turn')) {
                items.push({ type: 'skip_turn', element: createSkipTurnElement() });
            }
        }

        if (items.length === 0) return;

        // 创建效果容器
        const container = document.createElement('div');
        container.className = 'card-effects-container';
        container.style.cssText = `
            position: absolute;
            top: -0.2vh;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: ${ICON_GAP};
            z-index: 10;
            pointer-events: none;
            white-space: nowrap;
        `;

        // 添加所有效果项
        items.forEach(item => container.appendChild(item.element));

        cardElement.appendChild(container);
    }

    return { applyEffects };
})();
