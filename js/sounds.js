// ==================== 音效管理器 (sounds.js) ====================
window.YYCardSounds = (function() {
    const SOUND_FILES = {
        refresh: '/assets/mp3/refresh.mp3',   // 刷新商店专用
        grab:    '/assets/mp3/grab.mp3',       // 拿起卡牌
        pickup:  '/assets/mp3/pickup.mp3',    // 拖拽/购买/交换等
        equip:   '/assets/mp3/equip.mp3',     // 装备/卸下
        sell:    '/assets/mp3/sell.mp3',      // 出售成功（金钱声）
        exp:     '/assets/mp3/exp.mp3'        // 升级成功
    };

    const cache = {};

    function preload() {
        Object.entries(SOUND_FILES).forEach(([key, url]) => {
            const audio = new Audio(url);
            audio.volume = 1;
            audio.preload = 'auto';
            cache[key] = audio;
        });
    }

    function play(key) {
        const a = cache[key];
        if (!a) return;
        a.currentTime = 0;
        a.play().catch(() => {});
    }

    function bind() {
        // 绑定商店核心动作音效（购买、装备、出售、拿起等）
        const shop = window.YYCardShop;
        if (shop) {
            shop.on('grab',   () => play('grab'));
            shop.on('pickup', () => play('pickup'));
            shop.on('equip',  () => play('equip'));
            shop.on('sell',   () => play('sell'));
        }

        // 绑定刷新和升级动作音效（从新模块触发）
        const refreshMod = window.YYCardShopRefresh;
        if (refreshMod) {
            refreshMod.on('refresh', () => play('refresh'));
            refreshMod.on('exp',     () => play('exp'));
        }

        // 如果新模块尚未加载，延迟重试
        if (!refreshMod) {
            setTimeout(bind, 100);
        }
    }

    window.addEventListener('load', () => {
        preload();
        bind();
    });

    return { preload, bind, play };
})();
