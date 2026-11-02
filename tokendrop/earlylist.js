/* ============================================================
 * 早鸟名单 · 数据与渲染
 * 后续新增功能直接加在这个文件里，HTML 不需要再改
 *
 * 数据写法：
 *   1) 纯字符串：'8080.ai'
 *   2) 对象：{ domain: '8080.ai', url: 'https://8080.ai' }
 *      url 不填会自动补 https://domain
 * ============================================================ */
(function (global) {
    'use strict';

    /* ---------------- 名单数据 ---------------- */
    const DOMAINS = [
        /* 原始名单 */
        '8080.ai',
        'k9999.ai',
        'btclh.ai',
        'yundoufu.ai',
        'bor.ai',
        'xiaogu.ai',
        /* 新增名单 */
        'zzzzzzzcc.ai',
        'qianxun.ai',
        'abs.ai',
        'celeryy.ai',
        'vcing.ai',
        'binanceapp.ai',
        'liu8.ai',
        'laile.ai',
        'renday.ai',
        'lisu999.ai',
        'hu666.ai',
        'lian6.ai',
        'linsspyu.ai',
        'houge.ai',
        'cahk.ai',
        'cow1pk.ai'
    ];

    /* ---------------- 工具 ---------------- */

    function normalize(entry) {
        if (typeof entry === 'string') {
            const domain = entry.trim();
            return { domain, url: domain ? 'https://' + domain : '' };
        }
        if (entry && typeof entry === 'object') {
            const domain = String(entry.domain || entry.name || '').trim();
            let url = String(entry.url || '').trim();
            if (!url && domain) url = 'https://' + domain;
            return { domain, url };
        }
        return { domain: '', url: '' };
    }

    /* 根据序号生成个性化磨砂色调，避免维护大数组 */
    function tint(index) {
        const hue = (index * 47 + 15) % 360;
        return {
            bg:     'hsla(' + hue + ', 85%, 72%, 0.20)',
            border: 'hsla(' + hue + ', 85%, 84%, 0.60)'
        };
    }

    /* ---------------- 单个方块 ---------------- */

    function createCard(entry, index) {
        const item = normalize(entry);

        const el = document.createElement(item.url ? 'a' : 'div');
        el.className = 'early-card';
        el.style.animationDelay = Math.min(index * 0.035, 0.5) + 's';

        if (item.url) {
            el.href = item.url;
            el.target = '_blank';
            el.rel = 'noopener noreferrer';
        }
        el.title = item.domain;

        const t = tint(index);
        el.style.setProperty('--early-bg', t.bg);
        el.style.setProperty('--early-border', t.border);

        const idx = document.createElement('span');
        idx.className = 'early-index';
        idx.textContent = String(index + 1).padStart(2, '0');

        const name = document.createElement('span');
        name.className = 'early-domain';
        name.textContent = item.domain || '—';

        el.appendChild(idx);
        el.appendChild(name);
        return el;
    }

    /* ---------------- 渲染整份名单 ---------------- */

    function render(container) {
        if (!container) return;

        container.innerHTML = '';

        const list = Array.isArray(DOMAINS) ? DOMAINS.slice() : [];
        if (!list.length) {
            container.innerHTML = '<p class="gallery-status">暂无早鸟名单</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        list.forEach(function (entry, i) {
            frag.appendChild(createCard(entry, i));
        });
        container.appendChild(frag);
    }

    /* ---------------- 对外暴露 ---------------- */

    global.EarlyList = {
        domains: DOMAINS,
        render: render,
        createCard: createCard
    };

    /* 兼容旧引用：window.EARLY_LIST */
    global.EARLY_LIST = DOMAINS;
})(window);
