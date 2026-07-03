// ==================== 基础卡牌构建模块 ====================
// 职责：生成单张卡牌的 DOM 元素（纯视图，无布局/价格/效果图标）
// 被 handRender.js / boardRender.js / shopRender.js 共享使用
window.YYCardBuild = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let cardConfig = {};

    // ----- 工具函数 -----
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }
    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }
    function getRarityColor(rarity) {
        switch (rarity) {
            case 'Common': return '#94a3b8';
            case 'Rare': return '#22c55e';
            case 'Epic': return '#8b5cf6';
            case 'Legendary': return '#f59e0b';
            default: return '#94a3b8';
        }
    }

    // ----- 卡牌配置加载 -----
    async function loadCardConfig() {
        try {
            const res = await fetch('/data/image.json');
            if (res.ok) {
                cardConfig = await res.json();
            } else {
                console.warn('无法加载卡牌展示配置: /data/image.json');
            }
        } catch (e) {
            console.warn('加载卡牌展示配置出错:', e);
        }
    }

    function getCardDisplay(card) {
        const id = card.card_id || card.cardId;
        const cfg = cardConfig[id] || {};
        return {
            name: cfg.name || card.name || id || '未知',
            image: cfg.image || card.image || `/assets/card/${id}.png`
        };
    }

    // ----- 卡牌元素创建（图片 108%，含护盾，不含价格/效果图标） -----
    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity || 'Common');
        d.setAttribute('data-card-type', cardType);
        d.setAttribute('data-star', card.star || 0);

        d.style.cssText = `
            position: relative;
            overflow: visible !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            display: block;
        `;

        // 消耗牌特殊渲染
        if (card.type === 'consumable' || card.isConsumable) {
            d.style.background = getRarityColor(card.rarity);
            d.style.border = `2px solid ${getRarityColor(card.rarity)}`;
            d.style.display = 'flex';
            d.style.flexDirection = 'column';
            d.style.alignItems = 'center';
            d.style.justifyContent = 'center';
            d.style.padding = '1vh 2vw';
            const descEl = document.createElement('div');
            descEl.className = 'card-desc';
            descEl.textContent = card.name || '消耗牌';
            descEl.style.cssText = `
                color: white; font-weight: bold;
                font-size: clamp(0.6rem, 1.8vw, 0.8rem);
                text-align: center; line-height: 1.3;
                text-shadow: 0 0 4px rgba(0,0,0,0.8);
            `;
            d.appendChild(descEl);
            return d;
        }

        // 普通卡牌
        const display = getCardDisplay(card);
        const imgPath = display.image;

        // 图片层
        const iconDiv = document.createElement('div');
        iconDiv.className = 'card-icon';
        iconDiv.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            overflow: visible;
            pointer-events: none;
        `;
        const img = document.createElement('img');
        img.src = imgPath;
        img.alt = display.name;
        img.onerror = () => img.src = '/assets/default-avatar.png';
        img.draggable = false;
        img.style.cssText = `
            width: 108%;
            height: 108%;
            object-fit: contain;
            display: block;
            border: none;
            position: relative;
            top: 0%;
            left: 0%;
        `;
        iconDiv.appendChild(img);
        d.appendChild(iconDiv);

        // 名字层
        const nameDiv = document.createElement('div');
        nameDiv.className = 'card-name';
        nameDiv.textContent = display.name;
        d.appendChild(nameDiv);

        // 攻防数值层
        const statsDiv = document.createElement('div');
        statsDiv.className = 'card-stats';
        const atk = card.atk !== undefined ? card.atk : (card.base_atk || 0);
        const hp = card.hp !== undefined ? card.hp : (card.base_hp || 0);
        statsDiv.innerHTML = `<span class="card-atk">${atk}</span><span class="card-hp">${hp}</span>`;
        d.appendChild(statsDiv);

        // 护盾显示（基础效果，所有区域都需要）
        const totalShield = (card.shield || 0) + (card.tempShield || 0);
        if (totalShield > 0) {
            const shieldDiv = document.createElement('div');
            shieldDiv.className = 'card-shield';
            shieldDiv.innerHTML = `<span>${totalShield}</span>`;
            d.appendChild(shieldDiv);
        }

        return d;
    }

    // 公开 API
    return {
        loadCardConfig,
        getCardDisplay,
        createCardElement,
        getRarityColor,
        isValidCard,
        getValidHandCount
    };
})();
