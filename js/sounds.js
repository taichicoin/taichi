// ==================== 音效管理器 (sounds.js) ====================
window.YYCardSounds = (function() {
    const SOUND_FILES = {
        pickup: '/assets/mp3/pickup.mp3',   // 刷新、购买、拖拽、交换等
        equip:  '/assets/mp3/equip.mp3',    // 装备/卸下
        sell:   '/assets/mp3/sell.mp3',     // 出售成功（金钱声）
        exp:    '/assets/mp3/exp.mp3'       // 升级成功
    };

    const cache = {};

    function preload() {
        Object.entries(SOUND_FILES).forEach(([key, url]) => {
            const audio = new Audio(url);
            audio.volume = 0.5;
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
        const shop = window.YYCardShop;
        if (!shop) { setTimeout(bind, 100); return; }

        shop.on('pickup', () => play('pickup'));
        shop.on('equip',  () => play('equip'));
        shop.on('sell',   () => play('sell'));
        shop.on('exp',    () => play('exp'));    // ★ 新增升级音效
    }

    window.addEventListener('load', () => {
        preload();
        bind();
    });

    return { preload, bind, play };
})();
