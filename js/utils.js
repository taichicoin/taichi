// ==================== 通用工具函数 + 卡池管理 ====================
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
            // 降级：返回空数组，避免商店崩溃
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
        // 确保模板已加载
        if (cardTemplates.length === 0) {
            console.warn('⚠️ 卡牌模板为空，返回占位卡');
            return {
                instanceId: uuid(),
                cardId: 'placeholder',
                name: '加载中...',
                type: 'character',
                rarity: 'Common',
                atk: 1,
                hp: 1,
                baseAtk: 1,
                baseHp: 1,
                star: 0,
                price: 1,
                icon: '/assets/default-avatar.png',
                equipment: { weapon: null, items: [null, null] },
                enlightenmentCount: 0
            };
        }
        const rarity = rollRarity(shopLevel);
        const template = drawRandomTemplateByRarity(rarity);
        if (!template) {
            // 极端情况降级
            return generateShopCard(shopLevel);
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
        // 确保模板已加载
        await loadCardTemplates();
        const cards = [];
        for (let i = 0; i < 3; i++) {
            cards.push(generateShopCard(shopLevel));
        }
        return cards;
    }

    // ===== 获取默认卡组（真实玩家初始卡组） =====
    function getDefaultDeck() {
        // 从模板中随机选取6张 Common 或 Rare 卡牌作为初始卡组
        const templates = cardTemplates.length > 0 ? cardTemplates : [];
        if (templates.length === 0) {
            // 降级：返回写死的测试卡组
            return [
                { instanceId: uuid(), name: '斯沃特', atk: 5, hp: 8, rarity: 'Common', star: 0, price: 1, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } },
                { instanceId: uuid(), name: '赛斯', atk: 6, hp: 6, rarity: 'Common', star: 0, price: 1, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } },
                { instanceId: uuid(), name: '精卫', atk: 22, hp: 28, rarity: 'Legendary', star: 0, price: 5, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } },
                { instanceId: uuid(), name: '孙悟空', atk: 25, hp: 25, rarity: 'Legendary', star: 0, price: 5, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } },
                { instanceId: uuid(), name: '雇佣兵', atk: 15, hp: 18, rarity: 'Epic', star: 0, price: 3, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } },
                { instanceId: uuid(), name: '奥摩', atk: 4, hp: 10, rarity: 'Common', star: 0, price: 1, icon: '/assets/default-avatar.png', equipment: { weapon: null, items: [null, null] } }
            ];
        }
        const deck = [];
        const commonRare = templates.filter(c => c.rarity === 'Common' || c.rarity === 'Rare');
        const shuffled = [...commonRare].sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(6, shuffled.length); i++) {
            const t = shuffled[i];
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

    // ===== 获取人机卡组（简单卡组） =====
    function getBotDeck() {
        // 人机使用固定的简单卡组
        return [
            { instanceId: uuid(), name: '斯沃特', atk: 5, hp: 8, rarity: 'Common', star: 0, price: 1, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } },
            { instanceId: uuid(), name: '赛斯', atk: 6, hp: 6, rarity: 'Common', star: 0, price: 1, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } },
            { instanceId: uuid(), name: '奥摩', atk: 4, hp: 10, rarity: 'Common', star: 0, price: 1, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } },
            { instanceId: uuid(), name: '猎狐者', atk: 7, hp: 7, rarity: 'Rare', star: 0, price: 2, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } },
            { instanceId: uuid(), name: '飞虎队', atk: 8, hp: 9, rarity: 'Rare', star: 0, price: 2, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } },
            { instanceId: uuid(), name: '雇佣兵', atk: 15, hp: 18, rarity: 'Epic', star: 0, price: 3, icon: '/assets/card/yuanshi.png', equipment: { weapon: null, items: [null, null] } }
        ];
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
        // 暴露模板，供其他地方使用
        getTemplates: () => cardTemplates
    };
})();

console.log('✅ utils.js 加载完成（真实卡池版）');
