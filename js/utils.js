// ==================== 通用工具函数 + 真实卡池管理（初始卡组含1个普通武器 + 纯角色） ====================
window.YYCardUtils = (function() {
    const config = window.YYCardConfig;  // 仍保留外部配置引用，但不再使用商店/价格相关字段

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

    // ★ 删除了 rollRarity、drawRandomTemplateByRarity、generateShopCard、generateShopCards、getCardPrice

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

        // 转换为运行时的卡牌对象 (price 不再由前端决定，设为 0)
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
                price: 0,                    // 价格由后端决定
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
        getDefaultDeck,
        getBotDeck,
        getTemplates: () => cardTemplates
        // 商店相关函数已全部移除
    };
})();

console.log('✅ utils.js 加载完成（纯工具函数 + 初始卡组，商店逻辑已移除）');
