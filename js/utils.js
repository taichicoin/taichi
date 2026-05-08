// ==================== 通用工具函数 + 真实卡池管理（初始卡组含1个普通武器 + 纯角色） ====================
window.YYCardUtils = (function() {
    const config = window.YYCardConfig;

    let cardTemplates = [];
    let templatesLoaded = false;

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

    async function loadCardTemplates() {
        if (templatesLoaded && cardTemplates.length > 0) return cardTemplates;
        logToScreen('🔄 正在加载卡牌模板: /data/characters.json');
        try {
            const response = await fetch('/data/characters.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data)) {
                cardTemplates = data;
            } else {
                cardTemplates = Object.values(data).flat();
            }
            if (cardTemplates.length === 0) throw new Error('卡牌模板为空');
            templatesLoaded = true;
            window.cardTemplates = {};
            cardTemplates.forEach(t => {
                const key = t.card_id || t.id;
                if (key) window.cardTemplates[key] = t;
            });
            logToScreen(`✅ 成功加载 ${cardTemplates.length} 张卡牌`);
        } catch (err) {
            console.error('❌ 卡牌模板加载失败:', err);
            logToScreen(`❌ 卡牌模板加载失败: ${err.message}`, true);
            cardTemplates = [];
            window.cardTemplates = {};
            templatesLoaded = false;
        }
        return cardTemplates;
    }

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function formatAddress(addr) { return addr ? addr.slice(0,6)+'...'+addr.slice(-4) : ''; }
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
        if (cardTemplates.length === 0) return null;
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

    // 商店生成卡牌（不再携带 skill）
    function generateShopCard(shopLevel) {
        if (cardTemplates.length === 0) return null;
        const rarity = rollRarity(shopLevel);
        const template = drawRandomTemplateByRarity(rarity);
        if (!template) return null;
        const imagePath = template.image || template.icon || `/assets/card/${template.card_id || template.id}.png`;
        return {
            instanceId: uuid(),
            cardId: template.card_id || template.id,
            card_id: template.card_id || template.id,
            name: template.name,
            type: template.type || 'character',
            rarity: template.rarity,
            atk: template.base_atk || template.baseAtk || 0,
            hp: template.base_hp || template.baseHp || 0,
            base_atk: template.base_atk || template.baseAtk || 0,
            base_hp: template.base_hp || template.baseHp || 0,
            star: template.star || 0,
            price: getCardPrice(template.rarity),
            icon: imagePath,
            image: imagePath,
            faction: template.faction,
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

    // ★★★ 初始卡组：5张普通/稀有角色卡 + 1把普通武器 ★★★
    function getDefaultDeck() {
        if (cardTemplates.length === 0) return [];

        // 普通/稀有角色卡
        const characterTemplates = cardTemplates.filter(c =>
            (c.type === 'character' || !c.type) &&
            (c.rarity === 'Common' || c.rarity === 'Rare')
        );

        // 普通武器（优先Common）
        const weaponTemplates = cardTemplates.filter(c =>
            c.type === 'weapon' && c.rarity === 'Common'
        );
        const chosenWeapon = weaponTemplates.length > 0 
            ? weaponTemplates[Math.floor(Math.random() * weaponTemplates.length)]
            : null;

        // 角色卡数量：如果有武器就5张，否则6张
        const charCount = chosenWeapon ? 5 : 6;
        const shuffledChars = [...characterTemplates].sort(() => Math.random() - 0.5);
        const selectedChars = shuffledChars.slice(0, Math.min(charCount, shuffledChars.length));

        // 组装卡组
        const deck = [...selectedChars];
        if (chosenWeapon) deck.push(chosenWeapon);

        // 转换为运行时的卡牌对象
        return deck.map(t => {
            const imagePath = t.image || t.icon || `/assets/card/${t.card_id || t.id}.png`;
            return {
                instanceId: uuid(),
                cardId: t.card_id || t.id,
                card_id: t.card_id || t.id,
                name: t.name,
                type: t.type || 'character',
                rarity: t.rarity,
                atk: t.base_atk || t.baseAtk || 0,
                hp: t.base_hp || t.baseHp || 0,
                base_atk: t.base_atk || t.baseAtk || 0,
                base_hp: t.base_hp || t.baseHp || 0,
                star: 0,
                price: getCardPrice(t.rarity),
                icon: imagePath,
                image: imagePath,
                faction: t.faction,
                weapon: null,
                item1: null,
                item2: null,
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

console.log('✅ utils.js 加载完成（初始卡组：5角色+1普通武器）');
