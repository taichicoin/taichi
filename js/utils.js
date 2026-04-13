// ==================== 通用工具函数 + 真实卡池管理（无硬编码） ====================
window.YYCardUtils = (function() {
    const config = window.YYCardConfig;

    // 卡牌模板缓存（从 characters.json 加载）
    let cardTemplates = [];
    let templatesLoaded = false;

    // ===== 加载卡牌模板 =====
    async function loadCardTemplates() {
        if (templatesLoaded && cardTemplates.length > 0) return cardTemplates;
        try {
            const response = await fetch('/data/characters.json');
            const data = await response.json();
            // 兼容新旧两种格式：如果是数组直接用，如果是对象（按阵营分组）则扁平化
            if (Array.isArray(data)) {
                cardTemplates = data;
            } else {
                cardTemplates = Object.values(data).flat();
            }
            templatesLoaded = true;
            console.log(`✅ 卡牌模板加载完成，共 ${cardTemplates.length} 张`);
            return cardTemplates;
        } catch (e) {
            console.error('❌ 加载卡牌模板失败:', e);
            cardTemplates = [];
            return cardTemplates;
        }
    }

    // ===== 生成 UUID =====
    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ===== 格式化钱包地址 =====
    function formatAddress(addr) {
        if (!addr) return '';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    // ===== 验证用户名 =====
    function isValidUsername(u) {
        return /^[a-z0-9]{1,7}$/.test(u);
    }

    // ===== 验证以太坊地址 =====
    function isValidEthAddress(addr) {
        return /^0x[a-fA-F0-9]{40}$/.test(addr);
    }

    // ===== 冷却计算 =====
    function calculateCooldown(lastModified, cooldownDays) {
        if (!lastModified) return { canChange: true, remaining: 0, remainingDays: 0 };
        const diff = Date.now() - new Date(lastModified).getTime();
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        if (diff >= cooldownMs) return { canChange: true, remaining: 0, remainingDays: 0 };
        const remainingMs = cooldownMs - diff;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        return { canChange: false, remaining: remainingMs, remainingDays: remainingDays };
    }

    // ===== 格式化剩余时间 =====
    function formatRemaining(ms) {
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${days}天${hours}小时`;
    }

    // ===== 获取卡牌价格 =====
    function getCardPrice(rarity) {
        const prices = config?.ECONOMY?.CARD_PRICE || {
            Common: { buy: 1, sell: 1 },
            Rare: { buy: 2, sell: 2 },
            Epic: { buy: 3, sell: 3 },
            Legendary: { buy: 5, sell: 4 }
        };
        return prices[rarity]?.buy || 1;
    }

    // ===== 根据稀有度随机抽取一张卡牌模板 =====
    function drawRandomTemplateByRarity(rarity) {
        const templates = cardTemplates;
        const filtered = templates.filter(c => c.rarity === rarity);
        if (filtered.length === 0) {
            // 如果该稀有度没有卡牌，降级到 Common
            const common = templates.filter(c => c.rarity === 'Common');
            if (common.length === 0) return null;
            return common[Math.floor(Math.random() * common.length)];
        }
        return filtered[Math.floor(Math.random() * filtered.length)];
    }

    // ===== 根据商店等级随机决定稀有度 =====
    function rollRarity(shopLevel) {
        const probTable = config?.SHOP_RARITY_PROBABILITY || {
            1: { Common: 0.75, Rare: 0.25, Epic: 0, Legendary: 0 },
            2: { Common: 0.60, Rare: 0.35, Epic: 0.05, Legendary: 0 },
            3: { Common: 0.45, Rare: 0.40, Epic: 0.14, Legendary: 0.01 },
            4: { Common: 0.30, Rare: 0.40, Epic: 0.25, Legendary: 0.05 },
            5: { Common: 0.20, Rare: 0.35, Epic: 0.35, Legendary: 0.10 }
        };
        const prob = probTable[shopLevel] || probTable[1];
        const rand = Math.random();
        let cumulative = 0;
        for (const [rarity, chance] of Object.entries(prob)) {
            cumulative += chance;
            if (rand < cumulative) return rarity;
        }
        return 'Common';
    }

    // ===== 生成一张商店卡牌实例 =====
    function generateShopCard(shopLevel) {
        if (cardTemplates.length === 0) {
            console.error('❌ 卡牌模板为空，无法生成商店卡牌');
            return null;
        }
        const rarity = rollRarity(shopLevel);
        const template = drawRandomTemplateByRarity(rarity);
        if (!template) {
            console.error('❌ 抽取卡牌模板失败');
            return null;
        }
        return {
            instanceId: uuid(),
            cardId: template.cardId || template.id,
            name: template.name,
            type: template.type || 'character',
            rarity: template.rarity,
            atk: template.baseAtk,
            hp: template.baseHp,
            baseAtk: template.baseAtk,
            baseHp: template.baseHp,
            star: template.star || 0,
            price: getCardPrice(template.rarity),
            icon: template.icon || `/assets/card/${template.cardId || template.id}.png`,
            skill: template.skill,
            equipment: { weapon: null, items: [null, null] },
            enlightenmentCount: 0,
            slayDemonCount: 0,
            divineBlessingCount: 0
        };
    }

    // ===== 生成商店卡牌（3张） =====
    async function generateShopCards(shopLevel) {
        await loadCardTemplates();
        const cards = [];
        for (let i = 0; i < 3; i++) {
            const card = generateShopCard(shopLevel);
            if (card) cards.push(card);
        }
        // 如果一张都没生成，报错
        if (cards.length === 0) {
            console.error('❌ 商店卡牌生成完全失败，请检查卡池数据');
        }
        return cards;
    }

    // ===== 获取默认卡组（真实玩家初始卡组，完全基于卡池） =====
    function getDefaultDeck() {
        if (cardTemplates.length === 0) {
            console.error('❌ 卡牌模板为空，无法生成初始卡组');
            return [];
        }
        const deck = [];
        // 从 Common 和 Rare 卡牌中随机选6张
        const commonRare = cardTemplates.filter(c => c.rarity === 'Common' || c.rarity === 'Rare');
        if (commonRare.length === 0) {
            console.error('❌ 卡池中没有 Common 或 Rare 卡牌');
            return [];
        }
        const shuffled = [...commonRare].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 6);
        for (const t of selected) {
            deck.push({
                instanceId: uuid(),
                cardId: t.cardId || t.id,
                name: t.name,
                type: t.type || 'character',
                rarity: t.rarity,
                atk: t.baseAtk,
                hp: t.baseHp,
                baseAtk: t.baseAtk,
                baseHp: t.baseHp,
                star: 0,
                price: getCardPrice(t.rarity),
                icon: t.icon || `/assets/card/${t.cardId || t.id}.png`,
                equipment: { weapon: null, items: [null, null] },
                enlightenmentCount: 0
            });
        }
        return deck;
    }

    // ===== 获取人机卡组（完全基于卡池，不使用硬编码） =====
    function getBotDeck() {
        if (cardTemplates.length === 0) {
            console.error('❌ 卡牌模板为空，无法生成人机卡组');
            return [];
        }
        const deck = [];
        // 人机也使用 Common 和 Rare 卡牌
        const commonRare = cardTemplates.filter(c => c.rarity === 'Common' || c.rarity === 'Rare');
        if (commonRare.length === 0) {
            console.error('❌ 卡池中没有 Common 或 Rare 卡牌');
            return [];
        }
        const shuffled = [...commonRare].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 6);
        for (const t of selected) {
            deck.push({
                instanceId: uuid(),
                cardId: t.cardId || t.id,
                name: t.name,
                type: t.type || 'character',
                rarity: t.rarity,
                atk: t.baseAtk,
                hp: t.baseHp,
                baseAtk: t.baseAtk,
                baseHp: t.baseHp,
                star: 0,
                price: getCardPrice(t.rarity),
                icon: t.icon || `/assets/card/${t.cardId || t.id}.png`,
                equipment: { weapon: null, items: [null, null] },
                enlightenmentCount: 0
            });
        }
        return deck;
    }

    // 公开 API
    return {
        loadCardTemplates,
        uuid,
        formatAddress,
        isValidUsername,
        isValidEthAddress,
        calculateCooldown,
        formatRemaining,
        getCardPrice,
        generateShopCard,
        generateShopCards,
        getDefaultDeck,
        getBotDeck,
        getTemplates: () => cardTemplates
    };
})();

console.log('✅ utils.js 加载完成（纯真实卡池版，无任何硬编码卡牌）');
