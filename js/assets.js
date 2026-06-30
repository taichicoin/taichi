// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'
    }
  ];

  // 带详细错误信息的余额查询
  async function fetchBalances(userId) {
    if (!userId) return { error: '缺少用户ID' };
    const url = `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}`;
    try {
      const resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '无法读取响应');
        return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
      }
      const data = await resp.json();
      if (!Array.isArray(data)) return { error: '返回格式错误' };
      const map = {};
      data.forEach(row => { map[row.token_type.toLowerCase()] = row.balance; });
      return { balances: map };
    } catch (err) {
      return { error: '网络请求失败: ' + (err.message || '未知错误') };
    }
  }

  // 复制到剪贴板
  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  }

  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    const userId = user?.id;

    if (!userId) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
      return;
    }

    // 启动监听
    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const result = await fetchBalances(userId);
    const isError = result.error != null;
    const balances = result.balances || {};

    // 构建HTML
    let html = `<div style="padding-top: 10vh;">`;

    // 用户ID + 复制按钮
    html += `
      <div style="display: flex; align-items: center; justify-content: center; padding: 10px 20px; margin-bottom: 10px;">
        <span style="font-size: 13px; color: #666; background: #f0f0f0; padding: 6px 12px; border-radius: 20px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ID: ${userId}
        </span>
        <button id="copy-user-id-btn" style="margin-left: 8px; background: none; border: 1px solid #ccc; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; white-space: nowrap;">
          📋 复制
        </button>
      </div>
    `;

    html += `<div class="assets-title">资产</div>`;
    html += `
      <div class="assets-actions">
        <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
        <button class="assets-btn assets-btn-withdraw" disabled>提币</button>
      </div>
    `;

    TOKEN_LIST.forEach(token => {
      const rawBalance = isError ? '0' : (balances[token.address.toLowerCase()] || '0');
      let formatted = '0.0';
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
      } else {
        const divisor = Math.pow(10, token.decimals);
        formatted = (Number(rawBalance) / divisor).toFixed(4);
      }
      html += `
        <div class="asset-item">
          <div class="asset-left">
            <img src="/assets/default-avatar.png" class="asset-icon" onerror="this.src='/assets/default-avatar.png'">
            <span class="asset-symbol">${token.symbol}</span>
          </div>
          <div class="asset-amount">${formatted}</div>
          <div class="asset-price">${token.price}</div>
        </div>
      `;
    });

    // 错误信息（如果有）
    if (isError) {
      html += `
        <div style="margin-top: 30px; padding: 16px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; font-size: 14px; color: #856404; word-break: break-all;">
          <strong>⚠️ 余额加载失败</strong><br>
          ${result.error}
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    const copyBtn = document.getElementById('copy-user-id-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(userId);
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
      });
    }
  }

  window.refreshAssets = render;
})();
