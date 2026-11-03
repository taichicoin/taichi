/* ============================================================
 * 免费空投 · 提示词与复制 + 领取进度条
 * 提供 Airdrop.render(container)          → 进度条 + 提示词卡片
 * 提供 Airdrop.renderProgress(container)  → 只渲染进度条
 * ============================================================ */
(function (global) {
    'use strict';

    const STYLE_ID = 'airdrop-styles';
    const ETHERS_CDN = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';

    /* ---------------- 链上配置 ---------------- */
    const CONFIG = {
        RPC: 'https://bsc-dataseed.binance.org',
        RPC_FALLBACK: 'https://bsc-dataseed1.defibit.io',
        AIRDROP: '0xD32F3Ac8DE9008C1eA5457207675d87c9b02598D',
        TOTAL_CLAIMS: 1000,
        REFRESH_MS: 15000,
    };

    const AIRDROP_ABI = [
        'function totalClaimed() view returns (uint256)',
        'function AMOUNT_PER_CLAIM() view returns (uint256)',
        'function poolBalance() view returns (uint256)',
    ];

    /* ---------------- 提示词文本 ---------------- */

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
                color: #fff6d6;
                text-shadow: 0 1px 3px rgba(0,0,0,0.65);
            }

            /* 正文：浅色不透明底 + 纯黑字 */
            .airdrop-body {
                max-height: 190px;
                overflow-y: auto;
                padding: 9px 11px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.9);
                font-size: 0.66em;
                line-height: 1.5;
                white-space: pre-wrap;
                word-break: break-word;
                color: #000000;
                font-family: 'Consolas', 'Courier New', monospace;
                margin-bottom: 10px;
                -webkit-overflow-scrolling: touch;
            }
            .airdrop-body::-webkit-scrollbar { width: 4px; }
            .airdrop-body::-webkit-scrollbar-thumb {
                background: rgba(0, 0, 0, 0.28);
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

            /* ========== 进度条卡片 ========== */
            .airdrop-progress-card {
                padding-bottom: 14px;
            }

            .progress-stats {
                display: flex;
                flex-direction: column;
                align-items: center;
                margin-bottom: 12px;
                position: relative;
            }

            .progress-label {
                font-size: 0.78em;
                color: rgba(255, 255, 255, 0.7);
                letter-spacing: 0.05em;
                margin-bottom: 6px;
            }

            .progress-number {
                display: flex;
                align-items: baseline;
                gap: 4px;
                font-variant-numeric: tabular-nums;
            }

            .progress-claimed {
                font-size: 2.6em;
                font-weight: 800;
                color: #ffd166;
                text-shadow: 0 0 20px rgba(255, 209, 102, 0.5);
                line-height: 1;
            }

            .progress-sep {
                font-size: 1.4em;
                color: rgba(255, 255, 255, 0.4);
                font-weight: 300;
            }

            .progress-total {
                font-size: 1.4em;
                color: rgba(255, 255, 255, 0.85);
                font-weight: 600;
            }

            .progress-unit {
                font-size: 0.9em;
                color: rgba(255, 255, 255, 0.55);
                margin-left: 2px;
            }

            .progress-bar {
                height: 10px;
                background: rgba(0, 0, 0, 0.35);
                border-radius: 999px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 10px;
                position: relative;
            }

            .progress-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #f0a800, #ffd166);
                border-radius: 999px;
                box-shadow: 0 0 12px rgba(255, 209, 102, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.4);
                transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
                position: relative;
                overflow: hidden;
            }

            .progress-fill::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
                animation: progressShimmer 2.2s infinite;
            }

            @keyframes progressShimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            .progress-meta {
                display: flex;
                justify-content: space-between;
                font-size: 0.72em;
                color: rgba(255, 255, 255, 0.75);
                margin-bottom: 8px;
                letter-spacing: 0.02em;
            }

            .progress-percent {
                color: #ffd166;
                font-weight: 700;
            }

            .progress-remain {
                text-align: right;
            }

            .progress-status {
                font-size: 0.7em;
                text-align: center;
                color: rgba(255, 255, 255, 0.6);
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
                min-height: 1.2em;
                letter-spacing: 0.02em;
            }

            .progress-status.ok {
                color: #8ce6a0;
                background: rgba(140, 230, 160, 0.08);
            }

            .progress-status.err {
                color: #ff8080;
                background: rgba(255, 128, 128, 0.08);
            }
        `;
        document.head.appendChild(style);
    }

    /* ---------------- 复制 ---------------- */

    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) {}

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

    /* ============================================================
     *                      进度条模块
     * ============================================================ */

    function loadEthers() {
        return new Promise((resolve, reject) => {
            if (window.ethers) return resolve(window.ethers);
            const s = document.createElement('script');
            s.src = ETHERS_CDN;
            s.onload = () => resolve(window.ethers);
            s.onerror = () => reject(new Error('ethers 加载失败'));
            document.head.appendChild(s);
        });
    }

    async function fetchProgress() {
        const ethers = await loadEthers();

        // RPC fallback
        const urls = [CONFIG.RPC, CONFIG.RPC_FALLBACK];
        let provider = null;
        let lastErr = null;
        for (const url of urls) {
            try {
                const p = new ethers.providers.JsonRpcProvider(url);
                await p.getBlockNumber();
                provider = p;
                break;
            } catch (e) {
                lastErr = e;
            }
        }
        if (!provider) throw new Error('RPC 均不可用');

        const c = new ethers.Contract(CONFIG.AIRDROP, AIRDROP_ABI, provider);
        const [totalClaimedWei, amountPerClaim, poolBalWei] = await Promise.all([
            c.totalClaimed(),
            c.AMOUNT_PER_CLAIM(),
            c.poolBalance(),
        ]);

        const claimed = totalClaimedWei.div(amountPerClaim).toNumber();
        const remaining = poolBalWei.div(amountPerClaim).toNumber();

        return {
            claimed: Math.min(claimed, CONFIG.TOTAL_CLAIMS),
            total: CONFIG.TOTAL_CLAIMS,
            remaining,
        };
    }

    function createProgressCard() {
        const card = document.createElement('div');
        card.className = 'airdrop-card airdrop-progress-card';
        card.innerHTML = `
            <div class="airdrop-title">🎁 免费空投</div>
            <div class="progress-stats">
                <div class="progress-label">已领取</div>
                <div class="progress-number">
                    <span class="progress-claimed" data-claimed>--</span>
                    <span class="progress-sep">/</span>
                    <span class="progress-total" data-total>${CONFIG.TOTAL_CLAIMS}</span>
                    <span class="progress-unit">份</span>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" data-fill></div>
            </div>
            <div class="progress-meta">
                <span class="progress-percent" data-percent>0%</span>
                <span class="progress-remain" data-remain>—</span>
            </div>
            <div class="progress-status" data-status>正在连接链上...</div>
        `;

        const els = {
            claimed: card.querySelector('[data-claimed]'),
            total: card.querySelector('[data-total]'),
            fill: card.querySelector('[data-fill]'),
            percent: card.querySelector('[data-percent]'),
            remain: card.querySelector('[data-remain]'),
            status: card.querySelector('[data-status]'),
        };

        function update({ claimed, total, remaining }) {
            const pct = Math.min((claimed / total) * 100, 100);
            els.claimed.textContent = claimed;
            els.total.textContent = total;
            els.fill.style.width = pct.toFixed(2) + '%';
            els.percent.textContent = pct.toFixed(2) + '%';
            els.remain.textContent = `剩余 ${remaining} 份`;
            els.status.textContent = '✅ 数据已同步';
            els.status.className = 'progress-status ok';
        }

        function showError(msg) {
            els.status.textContent = '⚠️ ' + msg + ' · 15 秒后重试';
            els.status.className = 'progress-status err';
        }

        let timer = null;

        async function refresh() {
            try {
                const data = await fetchProgress();
                update(data);
            } catch (e) {
                showError(e.message || '加载失败');
            }
        }

        // 首屏加载
        refresh();
        // 定时刷新
        timer = setInterval(refresh, CONFIG.REFRESH_MS);

        // 卡片被移除时清理定时器
        card.__cleanup__ = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };

        return card;
    }

    /* ---------------- 渲染 ---------------- */

    function render(container) {
        if (!container) return;

        // 清理上一次渲染的定时器
        if (container.__airdropCleanup__) {
            container.__airdropCleanup__();
            container.__airdropCleanup__ = null;
        }

        injectStyles();
        container.innerHTML = '';

        const progressCard = createProgressCard();
        const frag = document.createDocumentFragment();

        frag.appendChild(progressCard);

        frag.appendChild(createCard({
            title: '提示词',
            text: PROMPT_ZH,
            copyLabel: ' 复制提示词',
            copiedLabel: '✓ 已复制'
        }));

        frag.appendChild(createCard({
            title: 'Prompt',
            text: PROMPT_EN,
            copyLabel: ' Copy Prompt',
            copiedLabel: '✓ Copied'
        }));

        container.appendChild(frag);
        container.__airdropCleanup__ = progressCard.__cleanup__;
    }

    /* ---------------- 只渲染进度条 ---------------- */

    function renderProgress(container) {
        if (!container) return;

        if (container.__airdropCleanup__) {
            container.__airdropCleanup__();
            container.__airdropCleanup__ = null;
        }

        injectStyles();
        container.innerHTML = '';

        const progressCard = createProgressCard();
        container.appendChild(progressCard);
        container.__airdropCleanup__ = progressCard.__cleanup__;
    }

    /* ---------------- 对外暴露 ---------------- */

    global.Airdrop = {
        render: render,
        renderProgress: renderProgress,
        PROMPT_ZH: PROMPT_ZH,
        PROMPT_EN: PROMPT_EN,
        CONFIG: CONFIG,
    };
})(window);
