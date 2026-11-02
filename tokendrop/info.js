/* ============================================================
 * 项目介绍 · 内容与渲染
 * 修改下方 SECTIONS 即可更新页面内容
 * 支持两种段落：
 *   { title, body }             普通段落
 *   { title, items: [...] }     列表
 * ============================================================ */
(function (global) {
    'use strict';

    const STYLE_ID = 'info-styles';

    const SECTIONS = [
        {
            title: '🌟 关于项目',
            body: '凡人修仙：悠悠万倍证道路! 修仙养成、山海经、神话历史自走棋策略卡牌.'
        },
        {
            title: '🎯 核心特性',
            items: [
                '具有一定可玩性，策略性较强，阵容丰富，玩法多样',
                '后端游戏逻辑近1万行',
                '社区治理：代币赋能用于游戏对战入场券社区空投和基础游戏奖池'
            ]
        },
        {
            title: '🧭 愿景',
            body: '证道10000X'
        }
    ];

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #info-list {
                display: flex;
                flex-direction: column;
                gap: 16px;
                width: 100%;
                max-width: var(--content-max, 760px);
                margin: 0 auto;
                padding: 4px;
                box-sizing: border-box;
                font-size: var(--content-font, 16px);
            }

            .info-card {
                border-radius: 14px;
                padding: 16px 16px 14px;
                box-sizing: border-box;
                background: linear-gradient(135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.10));
                backdrop-filter: blur(16px) saturate(160%);
                -webkit-backdrop-filter: blur(16px) saturate(160%);
                border: 1px solid rgba(255,255,255,0.42);
                box-shadow:
                    0 8px 22px rgba(0,0,0,0.28),
                    inset 0 1px 0 rgba(255,255,255,0.5);
                color: #fff6d6;
                animation: infoIn 0.34s ease backwards;
            }
            @keyframes infoIn {
                from { opacity: 0; transform: translateY(10px) scale(0.97); }
                to   { opacity: 1; transform: none; }
            }

            .info-title {
                font-size: 0.98em;
                font-weight: 700;
                letter-spacing: 0.03em;
                margin-bottom: 10px;
                color: #fff6d6;
                text-shadow: 0 1px 3px rgba(0,0,0,0.65);
            }

            .info-body {
                font-size: 0.78em;
                line-height: 1.65;
                color: #f8ecd0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                word-break: break-word;
            }

            .info-list-items {
                margin: 0;
                padding-left: 1.2em;
                font-size: 0.78em;
                line-height: 1.65;
                color: #f8ecd0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
            .info-list-items li + li { margin-top: 6px; }
        `;
        document.head.appendChild(style);
    }

    function createCard(section) {
        const card = document.createElement('div');
        card.className = 'info-card';

        const title = document.createElement('div');
        title.className = 'info-title';
        title.textContent = section.title;
        card.appendChild(title);

        if (section.body) {
            const body = document.createElement('div');
            body.className = 'info-body';
            body.textContent = section.body;
            card.appendChild(body);
        }

        if (Array.isArray(section.items) && section.items.length) {
            const ul = document.createElement('ul');
            ul.className = 'info-list-items';
            section.items.forEach(text => {
                const li = document.createElement('li');
                li.textContent = text;
                ul.appendChild(li);
            });
            card.appendChild(ul);
        }

        return card;
    }

    function render(container) {
        if (!container) return;

        injectStyles();
        container.innerHTML = '';

        const frag = document.createDocumentFragment();
        SECTIONS.forEach(section => frag.appendChild(createCard(section)));
        container.appendChild(frag);
    }

    global.Info = {
        render: render,
        sections: SECTIONS
    };
})(window);
