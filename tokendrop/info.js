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
            body: 'Tokendrop 是一个社区驱动的空投与代币分发平台，致力于让每一个真实用户都能公平地获得项目早期的奖励。我们通过链上资格校验与透明分配机制，减少刷号与机器人干扰，让空投回归社区本质。'
        },
        {
            title: '🎯 核心特性',
            items: [
                '公平空投：基于链上持仓与交互行为自动校验资格，每个地址限领一次。',
                '多链支持：首批支持 BSC 主网，后续将扩展至更多 EVM 兼容链。',
                '透明分配：所有空投规则与合约地址公开可查，分配结果链上可验证。',
                '社区治理：持有代币即可参与平台方向与后续空投规则的投票。'
            ]
        },
        {
            title: '🧭 我们的愿景',
            body: '让空投不再是少数人的游戏。我们希望建立一个长期、可持续、由社区共同维护的代币分发网络，让优质项目与真实用户之间的连接更简单、更可信。'
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
