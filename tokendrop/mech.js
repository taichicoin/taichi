/* ============================================================
 * 代币机制 · 内容与渲染
 * 修改下方 SECTIONS 即可更新页面内容
 * 支持两种段落：
 *   { title, rows: [[label, value], ...] }   左右两列表格
 *   { title, body }                          普通段落
 * ============================================================ */
(function (global) {
    'use strict';

    const STYLE_ID = 'mech-styles';

    const SECTIONS = [
        {
            title: '💠 代币信息',
            rows: [
                ['代币名称', '凡人百世输'],
                ['代币符号', '$凡人百世输'],
                ['总供应量', '99,999,999'],
                ['合约地址', '0x54fF…5000'],
                ['主网', 'BSC（链 ID 56）']
            ]
        },
        {
            title: ' 分配方案',
            rows: [
                ['社区空投', '10%'],
                ['流动性池', '20%'],
                ['捐款瓜分', '70%'],
            ]
        },
        {
            title: ' 代币用途',
            rows: [
                ['治理投票', '持有即可参与平台治理与空投规则投票'],
                ['质押奖励', '质押 $DROP 获得平台收益分成'],
                ['手续费折扣', '使用平台服务时享受手续费折扣'],
                ['空投资格', '部分后续空投将优先面向 $DROP 持有者']
            ]
        },
        {
            title: '⚠️ 风险提示',
            body: '代币价格具有波动性，参与任何链上操作前请自行评估风险。本文档不构成任何投资建议。请以官方公告与链上合约为准。'
        }
    ];

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #mech-list {
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

            .mech-card {
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
                animation: mechIn 0.34s ease backwards;
            }
            @keyframes mechIn {
                from { opacity: 0; transform: translateY(10px) scale(0.97); }
                to   { opacity: 1; transform: none; }
            }

            .mech-title {
                font-size: 0.98em;
                font-weight: 700;
                letter-spacing: 0.03em;
                margin-bottom: 10px;
                color: #fff6d6;
                text-shadow: 0 1px 3px rgba(0,0,0,0.65);
            }

            .mech-body {
                font-size: 0.78em;
                line-height: 1.65;
                color: #f8ecd0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                word-break: break-word;
            }

            .mech-table {
                display: flex;
                flex-direction: column;
                gap: 1px;
                border-radius: 8px;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.18);
            }

            .mech-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
                padding: 9px 11px;
                background: rgba(255, 255, 255, 0.06);
                font-size: 0.76em;
                line-height: 1.45;
            }
            .mech-row:nth-child(even) {
                background: rgba(255, 255, 255, 0.11);
            }

            .mech-label {
                flex-shrink: 0;
                color: #e8d9ac;
                font-weight: 600;
                letter-spacing: 0.02em;
            }

            .mech-value {
                text-align: right;
                color: #fff6d6;
                font-weight: 600;
                word-break: break-word;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
        `;
        document.head.appendChild(style);
    }

    function createCard(section) {
        const card = document.createElement('div');
        card.className = 'mech-card';

        const title = document.createElement('div');
        title.className = 'mech-title';
        title.textContent = section.title;
        card.appendChild(title);

        if (Array.isArray(section.rows) && section.rows.length) {
            const table = document.createElement('div');
            table.className = 'mech-table';

            section.rows.forEach(pair => {
                if (!Array.isArray(pair) || pair.length < 2) return;

                const row = document.createElement('div');
                row.className = 'mech-row';

                const label = document.createElement('span');
                label.className = 'mech-label';
                label.textContent = pair[0];

                const value = document.createElement('span');
                value.className = 'mech-value';
                value.textContent = pair[1];

                row.appendChild(label);
                row.appendChild(value);
                table.appendChild(row);
            });

            card.appendChild(table);
        }

        if (section.body) {
            const body = document.createElement('div');
            body.className = 'mech-body';
            body.textContent = section.body;
            card.appendChild(body);
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

    global.Mech = {
        render: render,
        sections: SECTIONS
    };
})(window);
