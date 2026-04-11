// 生成 UUID
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        let r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// 格式化钱包地址
function formatAddress(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// 验证用户名 (7位小写字母/数字)
function isValidUsername(u) {
    return /^[a-z0-9]{7}$/.test(u);
}

// 验证以太坊地址
function isValidEthAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

// 头像冷却计算
function calculateCooldown(lastModified) {
    if (!lastModified) return { canChange: true, remaining: 0 };
    const diff = Date.now() - new Date(lastModified).getTime();
    const cooldownMs = 15 * 24 * 60 * 60 * 1000;
    if (diff >= cooldownMs) return { canChange: true, remaining: 0 };
    return { canChange: false, remaining: cooldownMs - diff };
}

function formatRemaining(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days}天${hours}小时`;
}
