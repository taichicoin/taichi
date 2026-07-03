// ==================== 效果装饰模块（护盾+道具外显） ====================
// 职责：为卡牌元素添加护盾数字、嘲讽图标、跳过行动图标等效果
// 被 render.js 中的 renderBoard、renderHand 调用
window.YYCardItemRender = (function() {

    const EFFECT_ICONS = {
        taunt: '/assets/logo/taunt.png',   // 嘲讽图标（需确保图片存在）
        skip_turn: '🚫'                    // 跳过行动
    };

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

    // ========== 护盾渲染 ==========
    function addShield(cardElement, card) {
        // 移除旧的护盾
        const old = cardElement.querySelector('.card-shield');
        if (old) old.remove();

        const total = (card.shield || 0) + (card.tempShield || 0);
        if (total <= 0) return;

        const shieldDiv = document.createElement('div');
        shieldDiv.className = 'card-shield';
        shieldDiv.innerHTML = `<span>${total}</span>`;
        cardElement.appendChild(shieldDiv);
    }

    // ========== 效果图标渲染 ==========
    function addEffectIcon(cardElement, type) {
        const icon = EFFECT_ICONS[type];
        if (!icon) return;

        // 移除同类型旧图标
        const old = cardElement.querySelector(`.card-effect-icon[data-effect-type="${type}"]`);
        if (old) old.remove();

        const el = document.createElement('div');
        el.className = 'card-effect-icon';
        el.setAttribute('data-effect-type', type);
        el.style.cssText = `
            position: absolute;
            top: 2%;
            left: 2%;
            z-index: 10;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        if (type === 'taunt' && icon.startsWith('/')) {
            const img = document.createElement('img');
            img.src = icon;
            img.alt = '嘲讽';
            img.style.cssText = 'width: 25%; height: auto; display: block;';
            el.appendChild(img);
        } else {
            el.textContent = icon;
            el.style.fontSize = 'clamp(14px, 4vw, 24px)';
            el.style.color = '#ff4d4d';
            el.style.textShadow = '0 0 4px black';
            el.style.fontWeight = 'bold';
        }
        cardElement.appendChild(el);
    }

    // ========== 统一入口：应用所有效果 ==========
    // options.includeIcons: 是否添加嘲讽/跳过行动图标（棋盘 true，手牌 false）
    function applyEffects(cardElement, card, options = {}) {
        if (!cardElement || !card) return;
        const { includeIcons = true } = options;

        // 护盾（所有区域都需要）
        addShield(cardElement, card);

        if (includeIcons) {
            // 嘲讽
            if (cardHasEffect(card, 'taunt')) {
                addEffectIcon(cardElement, 'taunt');
            }
            // 跳过行动
            if (cardHasEffect(card, 'skip_turn')) {
                addEffectIcon(cardElement, 'skip_turn');
            }
        }
    }

    return { applyEffects };
})();
