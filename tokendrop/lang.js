/* ============================================================
 * Tokendrop · 语言切换（中 / 英）
 * 负责：顶部标题、底部导航按钮文字、语言按钮自身文字
 * ============================================================ */
(function (global) {
    'use strict';

    const DICT = {
        zh: {
            'page.card':    '📜 图鉴·角色',
            'page.weapon':  '📜 图鉴·武器',
            'page.item':    '📜 图鉴·道具',
            'page.early':   '📜 早鸟名单',
            'page.airdrop': '📜 免费空投',

            'nav.card':    '角色牌',
            'nav.weapon':  '武器牌',
            'nav.item':    '道具牌',
            'nav.early':   '早鸟名单',
            'nav.airdrop': '免费空投',

            'toggle.label': 'EN',
            'toggle.aria':  'Switch to English'
        },
        en: {
            'page.card':    '📜 Codex · Character',
            'page.weapon':  '📜 Codex · Weapon',
            'page.item':    '📜 Codex · Item',
            'page.early':   '📜 Early List',
            'page.airdrop': '📜 Free Airdrop',

            'nav.card':    'Character',
            'nav.weapon':  'Weapon',
            'nav.item':    'Item',
            'nav.early':   'Early List',
            'nav.airdrop': 'Airdrop',

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
            try { fn(current); } catch (_) {}
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
