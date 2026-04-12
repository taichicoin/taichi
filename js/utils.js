// 通用工具函数
window.YYCardUtils = {
    // 生成 UUID
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },

    // 格式化钱包地址
    formatAddress(addr) {
        if (!addr) return '';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    },

    // 验证用户名 (1-7位小写字母/数字)
    isValidUsername(u) {
        return /^[a-z0-9]{1,7}$/.test(u);
    },

    // 验证以太坊地址
    isValidEthAddress(addr) {
        return /^0x[a-fA-F0-9]{40}$/.test(addr);
    },

    // 冷却计算
    calculateCooldown(lastModified, cooldownDays) {
        if (!lastModified) return { canChange: true, remaining: 0, remainingDays: 0 };
        const diff = Date.now() - new Date(lastModified).getTime();
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        if (diff >= cooldownMs) return { canChange: true, remaining: 0, remainingDays: 0 };
        const remainingMs = cooldownMs - diff;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        return { canChange: false, remaining: remainingMs, remainingDays: remainingDays };
    },

    // 格式化剩余时间
    formatRemaining(ms) {
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${days}天${hours}小时`;
    },

    // 获取默认卡组（真实玩家）
    getDefaultDeck() {
        // 后续可从 characters.json 加载
        return [
            { id: this.uuid(), name: '斯沃特', atk: 5, hp: 8, rare: 'Common', star: 0 },
            { id: this.uuid(), name: '赛斯', atk: 6, hp: 6, rare: 'Common', star: 0 },
            { id: this.uuid(), name: '精卫', atk: 22, hp: 28, rare: 'Legendary', star: 0 },
            { id: this.uuid(), name: '孙悟空', atk: 25, hp: 25, rare: 'Legendary', star: 0 },
            { id: this.uuid(), name: '雇佣兵', atk: 15, hp: 18, rare: 'Epic', star: 0 },
            { id: this.uuid(), name: '奥摩', atk: 4, hp: 10, rare: 'Common', star: 0 }
        ];
    },

    // 获取人机卡组
    getBotDeck() {
        return [
            { id: this.uuid(), name: '斯沃特', atk: 5, hp: 8, rare: 'Common', star: 0 },
            { id: this.uuid(), name: '赛斯', atk: 6, hp: 6, rare: 'Common', star: 0 },
            { id: this.uuid(), name: '奥摩', atk: 4, hp: 10, rare: 'Common', star: 0 },
            { id: this.uuid(), name: '猎狐者', atk: 7, hp: 7, rare: 'Rare', star: 0 },
            { id: this.uuid(), name: '飞虎队', atk: 8, hp: 9, rare: 'Rare', star: 0 },
            { id: this.uuid(), name: '雇佣兵', atk: 15, hp: 18, rare: 'Epic', star: 0 }
        ];
    },

    // 生成商店卡牌
    generateShopCards(level) {
        // 后续可接入真实卡池
        return this.getDefaultDeck().slice(0, 3);
    }
};

console.log('✅ utils.js 加载完成');
