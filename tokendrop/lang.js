/* ============================================================
 * Tokendrop · 语言切换（中 / 英）
 * 负责：顶部标题、底部导航按钮文字、语言按钮自身文字
 * 用法：
 *   Lang.t('nav.card')        取当前语言文案
 *   Lang.subscribe(fn)        语言变化时回调
 *   Lang.mountToggle(el)      给按钮挂上切换逻辑
 * ============================================================ */
(function (global) {
    'use strict';

    const DICT = {
        zh: {
            'page.card':   '📜 图鉴·角色',
            'page.weapon': '📜 图鉴·武器',
            'page.item':   '📜 图鉴·道具',
            'page.early':  '📜 早鸟名单',

            'nav.card':   '角色牌',
            'nav.weapon': '武器牌',
            'nav.item':   '道具牌',
            'nav.early':  '早鸟名单',

            'toggle.label': 'EN',
            'toggle.aria':  'Switch to English'
        },
        en: {
            'page.card':   '📜 Codex · Character',
            'page.weapon': '📜 Codex · Weapon',
            'page.item':   '📜 Codex · Item',
            'page.early':  '📜 Early List',

            'nav.card':   'Character',
            'nav.weapon': 'Weapon',
            'nav.item':   'Item',
            'nav.early':  'Early List',

            'toggle.label': '中',
            'toggle.aria':  '切换到中文'
        }
    };

    const STORAGE_KEY = 'tokendrop_lang';
    const listeners = new Set();
    let current = 'zh';

    function applyHtmlLang() {
        document.documentElement.lang = (current === 'zh') ? 'zh-CN' : 'en';
    }

    function t(key) {
        const dict = DICT[current] || DICT.zh;
        return (dict && dict[key]) || key;
    }

    function setLang(lang) {
        if (!DICT[lang] || lang === current) return;
        current = lang;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
        applyHtmlLang();
        listeners.forEach(function (fn) {
            try { fn(current); } catch (_) { /* 单个回调失败不影响其他 */ }
        });
    }

    function toggle() {
        setLang(current === 'zh' ? 'en' : 'zh');
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.add(fn);
        return function () { listeners.delete(fn); };
    }

    function mountToggle(el) {
        if (!el) return;

        function refresh() {
            el.textContent = t('toggle.label');
            el.setAttribute('aria-label', t('toggle.aria'));
            el.setAttribute('title', t('toggle.aria'));
        }

        el.addEventListener('click', function (e) {
            e.preventDefault();
            toggle();
        });

        subscribe(refresh);
        refresh();
    }

    /* 初始化：读取上次选择 */
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && DICT[saved]) current = saved;
    } catch (_) {}
    applyHtmlLang();

    global.Lang = {
        t: t,
        setLang: setLang,
        toggle: toggle,
        subscribe: subscribe,
        mountToggle: mountToggle,
        get current() { return current; },
        DICT: DICT
    };
})(window);
