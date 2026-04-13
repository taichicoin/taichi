// ==================== 商店系统（模板与实例分离） ====================
window.YYCardShop = (function() {
    const config = window.YYCardConfig;
    const utils = window.YYCardUtils;

    // 卡牌模板缓存
    const templates = {
        characters: [],   // 扁平化后的角色模板数组
        weapons: [],      // 武器模板（后续填充）
        items: []         // 道具模板（后续填充）
    };

    // 稀有度概率表
    const RARITY_PROB = {
        1: { Common: 0.75, Rare: 0.25, Epic: 0, Legendary: 0 },
        2: { Common: 0.60, Rare: 0.35, Epic: 0.05, Legendary: 0 },
        3: { Common: 0.45, Rare: 0.40, Epic: 0.14, Legendary: 0.01 },
        4: { Common: 0.30, Rare: 0.40, Epic: 0.25, Legendary: 0.05 },
        5: { Common: 0.20, Rare: 0.35, Epic: 0.35, Legendary: 0.10 }
    };

    // 价格表
    const PRICE_MAP = { 'Common': 1, 'Rare': 2, 'Epic': 3, 'Legendary': 5 };

    // 加载所有模板（游戏初始化时调用一次）
    async function loadTemplates() {
        try {
            // 修复路径：根目录 /data/
            const charsResponse = await fetch('/data/characters.json');
            const charsData = await charsResponse.json();
            // 扁平化：将所有阵营的数组连接成一个数组
            templates.characters = Object.values(charsData).flat();
            console.log(`✅ 角色模板加载完成，共 ${templates.characters.length} 张`);

            // 武器和道具
            try {
                const weaponsResponse = await fetch('/data/weapons.json');
                templates.weapons = await weaponsResponse.json();
                console.log(`✅ 武器模板加载完成，共 ${templates.weapons.length} 把`);
            } catch (e) {
                console.warn('⚠️ weapons.json 未找到，武器池为空');
                templates.weapons = [];
            }

            try {
                const itemsResponse = await fetch('/data/items.json');
                templates.items = await itemsResponse.json();
                console.log(`✅ 道具模板加载完成，共 ${templates.items.length}`);
            } catch (e) {
                console.warn('⚠️ items.json 未找到，道具池为空');
                templates.items = [];
            }
        } catch (e) {
            console.error('❌ 商店模板加载失败:', e);
        }
    }

    // 获取模板（通过 cardId 和类型）
    function getTemplate(cardId, type) {
        if (type === 'character') return templates.characters.find(c => c.id === cardId);
        if (type === 'weapon') return templates.weapons.find(w => w.id === cardId);
        if (type === 'item') return templates.items.find(i => i.id === cardId);
        return null;
    }

    // 从模板创建卡牌实例
    function createCardInstance(template) {
        const base = {
            instanceId: utils.uuid(),
            cardId: template.id,
            type: template.type || 'character',
            rarity: template.rarity,
            star: 0,
            price: PRICE_MAP[template.rarity] || 1
        };

        if (template.type === 'weapon') {
            return {
                ...base,
                atkBonus: template.atkBonus || 0,
                effect: template.effect || null
            };
        } else if (template.type === 'item') {
            return {
                ...base,
                effect: template.effect || null
            };
        } else {
            // 角色
            return {
                ...base,
                atk: template.baseAtk,
                hp: template.baseHp,
                baseAtk: template.baseAtk,
                baseHp: template.baseHp,
                equipment: { weapon: null, items: [null, null] },
                enlightenmentCount: 0,
                slayDemonCount: 0,
                divineBlessingCount: 0
            };
        }
    }

    // 随机稀有度
    function rollRarity(shopLevel) {
        const prob = RARITY_PROB[shopLevel] || RARITY_PROB[1];
        const rand = Math.random();
        let cumulative = 0;
        for (const [rarity, chance] of Object.entries(prob)) {
            cumulative += chance;
            if (rand < cumulative) return rarity;
        }
        return 'Common';
    }

    // 抽取模板
    function drawRandomTemplate(rarity) {
        const pool = [...templates.characters, ...templates.weapons, ...templates.items];
        const filtered = pool.filter(c => c.rarity === rarity);
        if (filtered.length === 0) return null;
        return filtered[Math.floor(Math.random() * filtered.length)];
    }

    // 生成一张商店卡牌
    function generateShopCard(shopLevel) {
        const rarity = rollRarity(shopLevel);
        const template = drawRandomTemplate(rarity);
        if (!template) return null;
        return createCardInstance(template);
    }

    // 刷新商店
    function refreshShop(player) {
        if (player.gold < 1) return { success: false, message: '金币不足' };
        player.gold -= 1;
        player.shopCards = [];
        for (let i = 0; i < 3; i++) {
            const card = generateShopCard(player.shopLevel);
            if (card) player.shopCards.push(card);
        }
        return { success: true };
    }

    // 购买卡牌
    function buyCard(player, shopIndex) {
        if (shopIndex < 0 || shopIndex >= player.shopCards.length) {
            return { success: false, message: '无效的卡牌' };
        }
        const card = player.shopCards[shopIndex];
        if (player.gold < card.price) {
            return { success: false, message: '金币不足' };
        }
        const emptyIndex = player.hand.findIndex(slot => slot === null);
        if (emptyIndex === -1) {
            return { success: false, message: '手牌已满' };
        }
        player.gold -= card.price;
        player.hand[emptyIndex] = card;
        player.shopCards.splice(shopIndex, 1);
        return { success: true };
    }

    return {
        loadTemplates,
        getTemplate,
        createCardInstance,
        generateShopCard,
        refreshShop,
        buyCard,
        getTemplates: () => templates
    };
})();

console.log('✅ shop.js 加载完成');
