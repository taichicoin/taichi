/* ============================================================
 * 免费空投 · 提示词与复制
 * 提供 Airdrop.render(container)
 * 页面固定显示中英两个提示词卡片，各带一个复制按钮
 * 不随语言切换改变展示，始终两个都在
 * ============================================================ */
(function (global) {
    'use strict';

    const STYLE_ID = 'airdrop-styles';

    /* ---------------- 提示词文本（原样保留） ---------------- */

    const PROMPT_ZH = `请用我的 Agentic Wallet,在 BSC 主网(链 ID 56)领取空投:

- 空投合约:0xa66bb210FE0b96664a79Bec77995AC9F95ff4F8D
- 调用函数:claim(),无参数,Value 为 0,calldata 为 0x4e71d92d
- 领取资格:我的钱包持有 Agent ID NFT(合约 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F),每个地址限领一次
- 空投代币合约:0x54fF3edBbF51F34D0590dD1EF2F1820B86C45000,每人 10,000 枚

请先检查开发者模式是否已开启,再预览这笔调用,把资产变动和风险提示发给我看。我确认后再执行。`;

    const PROMPT_EN = `Please use my Agentic Wallet to claim an airdrop on BSC mainnet (chain ID 56):

- Airdrop contract: 0xa66bb210FE0b96664a79Bec77995AC9F95ff4F8D
- Function: claim(), no parameters, value 0, calldata 0x4e71d92d
- Eligibility: my wallet holds an Agent ID NFT (contract 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F); one claim per address
- Airdrop token contract: 0x54fF3edBbF51F34D0590dD1EF2F1820B86C45000, 10,000 tokens per person

First check that Developer Mode is on, then preview the call and show me the asset changes and any risk warnings. Execute only after I confirm.`;

    /* ---------------- 样式注入 ---------------- */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #airdrop-list {
                display: flex;
                flex-direction: column;
                gap: 16px;
                width: 100%;
                max-width: 360px;
                margin: 0 auto;
                padding: 4px;
                box-sizing: border-box;
            }

            .airdrop-card {
                border-radius: 14px;
                padding: 14px 14px 12px;
                box-sizing: border-box;
                background: linear-gradient(135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.10));
                backdrop-filter: blur(16px) saturate(160%);
                -webkit-backdrop-filter: blur(16px) saturate(160%);
                border: 1px solid rgba(255,255,255,0.42);
                box-shadow:
                    0 8px 22px rgba(0,0,0,0.28),
                    inset 0 1px 0 rgba(255,255,255,0.5);
                color: #fff6d6;
                animation: airdropIn 0.34s ease backwards;
            }
            @keyframes airdropIn {
                from { opacity: 0; transform: translateY(10px) scale(0.97); }
                to   { opacity: 1; transform: none; }
            }

            .airdrop-title {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.92em;
                font-weight: 700;
                letter-spacing: 0.03em;
                margin-bottom: 10px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.65);
            }

            .airdrop-body {
                max-height: 190px;
                overflow-y: auto;
                padding: 8px 10px;
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.20);
                border: 1px solid rgba(255,255,255,0.18);
                font-size: 0.66em;
                line-height: 1.5;
                white-space: pre-wrap;
                word-break: break-word;
                color: #f8ecd0;
                font-family: 'Consolas', 'Courier New', monospace;
                margin-bottom: 10px;
                -webkit-overflow-scrolling: touch;
            }
            .airdrop-body::-webkit-scrollbar { width: 4px; }
            .airdrop-body::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.3);
                border-radius: 2px;
            }

            .airdrop-copy {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                width: 100%;
                padding: 9px 12px;
                border-radius: 9px;
                border: 1px solid rgba(255,255,255,0.5);
                background: rgba(255,255,255,0.78);
                color: #3d2b00;
                font-family: inherit;
                font-size: 0.78em;
                font-weight: 700;
                letter-spacing: 0.03em;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.12s ease;
                -webkit-tap-highlight-color: transparent;
                outline: none;
            }
            .airdrop-copy:hover { background: rgba(255,255,255,0.92); }
            .airdrop-copy:active { transform: scale(0.97); }
            .airdrop-copy.copied {
                background: rgba(140, 230, 160, 0.92);
                border-color: rgba(180, 255, 190, 0.9);
                color: #0d4d1f;
            }
            .airdrop-copy.failed {
                background: rgba(255, 160, 160, 0.92);
                border-color: rgba(255, 200, 200, 0.9);
                color: #5a0d0d;
            }
        `;
        document.head.appendChild(style);
    }

    /* ---------------- 复制 ---------------- */

    async function copyText(text) {
        // 首选现代剪贴板 API（需要 https 或 localhost）
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) { /* 继续降级 */ }

        // 降级：临时 textarea + execCommand
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.width = '1px';
            ta.style.height = '1px';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_) {
            return false;
        }
    }

    /* ---------------- 单个卡片 ---------------- */

    function createCopyButton(text, normalLabel, copiedLabel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'airdrop-copy';
        btn.textContent = normalLabel;

        let resetTimer = null;

        btn.addEventListener('click', async function () {
            const ok = await copyText(text);

            if (resetTimer) {
                clearTimeout(resetTimer);
                resetTimer = null;
            }

            btn.classList.remove('copied', 'failed');
            if (ok) {
                btn.classList.add('copied');
                btn.textContent = copiedLabel;
            } else {
                btn.classList.add('failed');
                btn.textContent = '复制失败 · Copy failed';
            }

            resetTimer = setTimeout(function () {
                btn.classList.remove('copied', 'failed');
                btn.textContent = normalLabel;
                resetTimer = null;
            }, 2000);
        });

        return btn;
    }

    function createCard(opts) {
        const card = document.createElement('div');
        card.className = 'airdrop-card';

        const title = document.createElement('div');
        title.className = 'airdrop-title';
        title.textContent = opts.title;

        const body = document.createElement('div');
        body.className = 'airdrop-body';
        body.textContent = opts.text;

        const btn = createCopyButton(opts.text, opts.copyLabel, opts.copiedLabel);

        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(btn);
        return card;
    }

    /* ---------------- 渲染 ---------------- */

    function render(container) {
        if (!container) return;

        injectStyles();
        container.innerHTML = '';

        const frag = document.createDocumentFragment();

        frag.appendChild(createCard({
            title: '🇨🇳 中文提示词',
            text: PROMPT_ZH,
            copyLabel: '📋 复制提示词',
            copiedLabel: '✓ 已复制'
        }));

        frag.appendChild(createCard({
            title: '🇬🇧 English Prompt',
            text: PROMPT_EN,
            copyLabel: '📋 Copy Prompt',
            copiedLabel: '✓ Copied'
        }));

        container.appendChild(frag);
    }

    /* ---------------- 对外暴露 ---------------- */

    global.Airdrop = {
        render: render,
        PROMPT_ZH: PROMPT_ZH,
        PROMPT_EN: PROMPT_EN
    };
})(window);
