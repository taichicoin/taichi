// ==================== 通用工具函数 + 真实卡池管理（强制加载真实卡牌） ====================
window.YYCardUtils = (function() {
    const config = window.YYCardConfig;

    let cardTemplates = [];
    let templatesLoaded = false;

    // ===== 手机调试面板辅助（简单输出到屏幕） =====
    function logToScreen(msg, isError = false) {
        try {
            const p = document.getElementById('mobile-debug-panel');
            if (p) {
                const line = document.createElement('div');
                line.style.color = isError ? '#ff7b7b' : '#7bffb1';
                line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
                p.appendChild(line);
                p.scrollTop = p.scrollHeight;
                while (p.children.length > 40) p.removeChild(p.firstChild);
            }
        } catch (e) {}
    }

    // ===== 加载卡牌模板（无降级，失败即报错） =====
    async function loadCardTemplates() {
        if (templatesLoaded && cardTemplates.length > 0) return cardTemplates;

        logToScreen('🔄 正在加载卡牌模板: /data/characters.json');
        console.log('🔄 正在加载卡牌模板...');

        const response = await fetch('/data/characters.json');
        if (!response.ok) {
            const msg = `❌ 卡牌模板加载失败: HTTP ${response.status}`;
            logToScreen(msg, true);
            throw new Error(msg);
        }

        const data = await response.json();

        // 处理两种格式：数组 或 阵营分组对象
        if (Array.isArray(data)) {
            cardTemplates = data;
        } else {
            cardTemplates = Object.values(data).flat();
        }

        if (cardTemplates.length === 0) {
            const msg = '❌ 卡牌模板为空，请检查 characters.json 内容';
            logToScreen(msg, true);
            throw new Error(msg);
        }

        templatesLoaded = true;
        logToScreen(`✅ 成功加载 ${cardTemplates.length} 张卡牌`);
        console.log(`✅ 卡牌模板加载完成，共 ${cardTemplates.length} 张`);
        return cardTemplates;
    }

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function formatAddress(addr) {
        if (!addr) return '';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function isValidUsername(u) { return /^[a-z0-9]{1,7}$/.test(u); }
    function isValidEthAddress(addr) { return /^0x[a-fA-F0-9]{40}$/.test(addr); }

    function calculateCooldown(lastModified, cooldownDays) {
        if (!lastModified) return { canChange: true, remaining: 0, remainingDays: 0 };
        const diff = Date.now() - new Date(lastModified).getTime();
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        if (diff >= cooldownMs) return { canChange: true, remaining: 0, remainingDays: 0 };
        const remainingMs = cooldownMs - diff;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        return { canChange: false, remaining: remainingMs, remainingDays: remainingDays };
    }

    function formatRemaining(ms) {
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${days}天${hours}小时`;
    }

    function getCardPrice(rarity) {
        const prices = config?.ECONOMY?.CARD_PRICE || {
            Common: { buy: 1, sell: 1 },
            Rare: { buy: 2, sell: 2 },
            Epic: { buy: 3, sell: 3 },
            Legendary: { buy: 5, sell: 4 }
        };
        return prices[rarity]?.buy || 1;
    }

    function drawRandomTemplateByRarity(rarity) {
        const filtered = cardTemplates.filter(c => c.rarity === rarity);
        if (filtered.length === 0) {
            const common = cardTemplates.filter(c => c.rarity === 'Common');
            return common.length > 0 ? common[Math.floor(Math.random() * common.length)] : null;
        }
        return filtered[Math.floor(Math.random() * filtered.length)];
    }

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

    function generateShopCard(shopLevel) {
        if (cardTemplates.length === 0) {
            throw new Error('❌ 卡牌模板为空，无法生成商店卡牌');
        }
        const rarity = rollRarity(shopLevel);
        const template = drawRandomTemplateByRarity(rarity);
        if (!template) return null;

        const imagePath = template.image || template.icon || `/assets/card/${template.cardId || template.id}.png`;

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
            icon: imagePath,
            image: imagePath,
            skill: template.skill,
            equipment: { weapon: null, items: [null, null] },
            enlightenmentCount: 0
        };
    }

    async function generateShopCards(shopLevel) {
        await loadCardTemplates();
        const cards = [];
        const count = config?.ECONOMY?.SHOP_CARD_COUNT || 3;
        for (let i = 0; i < count; i++) {
            const card = generateShopCard(shopLevel);
            if (card) cards.push(card);
        }
        return cards;
    }

    function getDefaultDeck() {
        if (cardTemplates.length === 0) {
            throw new Error('❌ 卡池为空，无法生成初始卡组');
        }
        const commonRare = cardTemplates.filter(c => c.rarity === 'Common' || c.rarity === 'Rare');
        if (commonRare.length === 0) return [];
        const shuffled = [...commonRare].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 6);
        return selected.map(t => {
            const imagePath = t.image || t.icon || `/assets/card/${t.cardId || t.id}.png`;
            return {
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
                icon: imagePath,
                image: imagePath,
                equipment: { weapon: null, items: [null, null] },
                enlightenmentCount: 0
            };
        });
    }

    function getBotDeck() {
        return getDefaultDeck();
    }

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

console.log('✅ utils.js 加载完成（强制真实卡牌，无降级）');
