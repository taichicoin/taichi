// ==================== 商店系统（精简版，复用 utils 卡池，无弹窗） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 当前商店卡牌
    let currentShopCards = [];

    // 生成商店卡牌（直接调用 utils）
    async function generateShopCards(shopLevel) {
        currentShopCards = await utils.generateShopCards(shopLevel);
        renderShop();
        return currentShopCards;
    }

    // 刷新商店（扣金币）
    async function refreshShop(shopLevel, currentGold) {
        const refreshCost = config.ECONOMY.REFRESH_COST;
        if (currentGold < refreshCost) {
            alert('金币不足，无法刷新！');
            return false;
        }
        currentShopCards = await utils.generateShopCards(shopLevel);
        renderShop();
        return true;
    }

    // 购买卡牌
    function buyCard(card, myState) {
        const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
        if (myState.gold < price) {
            alert('金币不足！');
            return false;
        }
        if (myState.hand.length >= config.HAND_MAX_COUNT) {
            alert('手牌已满！');
            return false;
        }
        myState.gold -= price;
        myState.hand.push(card);
        currentShopCards = currentShopCards.filter(c => c.instanceId !== card.instanceId);
        renderShop();
        return true;
    }

    // 渲染商店到 HTML
    function renderShop() {
        const container = document.getElementById('shop-container');
        if (!container) return;

        container.innerHTML = '';
        if (!currentShopCards || currentShopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
            return;
        }

        currentShopCards.forEach(card => {
            const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.setAttribute('data-rarity', card.rarity);
            cardEl.dataset.instanceId = card.instanceId;

            const imgPath = card.image || card.icon || '/assets/default-avatar.png';

            cardEl.innerHTML = `
                <div class="card-icon">
                    <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
                </div>
                <div class="card-name">${card.name}</div>
                <div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>
                <div class="card-price">💰${price}</div>
            `;

            // 注意：点击购买逻辑需在外部绑定，这里仅渲染
            container.appendChild(cardEl);
        });
    }

    // 获取当前商店卡牌
    function getCurrentShopCards() {
        return currentShopCards;
    }

    return {
        generateShopCards,
        refreshShop,
        buyCard,
        renderShop,
        getCurrentShopCards
    };
})();

console.log('✅ shop.js 加载完成（精简复用版）');
