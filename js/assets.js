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

  // 获取 token（同步拿，不阻塞）
  function getAccessToken() {
    try {
      return window.YYCardAuth?.currentSession?.access_token || null;
    } catch(e) {
      return null;
    }
  }

  // 查询余额（原生 fetch，10 秒超时）
  async function fetchBalances(userId) {
    if (!userId) return { error: '用户ID为空' };

    const token = getAccessToken();
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
      }
      
      const data = await resp.json();
      if (!Array.isArray(data)) return { error: '返回格式异常' };
      
      const map = {};
      data.forEach(row => {
        if (row.token_type) {
          map[row.token_type.toLowerCase()] = row.balance || '0';
        }
      });
      return { balances: map };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') return { error: '请求超时，请检查网络后重试' };
      return { error: '网络请求失败: ' + (e.message || '未知错误') };
    }
  }

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

    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    let result;
    try {
      result = await fetchBalances(userId);
    } catch(e) {
      result = { error: '渲染异常: ' + (e.message || '未知') };
    }

    const isError = result.error != null;
    const balances = result.balances || {};

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
