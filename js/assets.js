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

  async function fetchBalances(userId) {
    if (!userId) return {};
    try {
      // 获取当前用户的 access_token（用于 RLS）
      const session = window.YYCardAuth?.currentSession;
      const token = session?.access_token;
      
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${userId}`,
        { headers }
      );
      if (!resp.ok) {
        console.error('请求余额失败:', resp.status, await resp.text());
        return {};
      }
      const data = await resp.json();
      console.log('余额查询结果:', data);
      const map = {};
      (Array.isArray(data) ? data : []).forEach(row => {
        map[row.token_type.toLowerCase()] = row.balance;
      });
      return map;
    } catch (e) {
      console.error('获取余额异常:', e);
      return {};
    }
  }

  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
      return;
    }

    if (window.YYCardPostDeposit && user.id) {
      window.YYCardPostDeposit.start(user.id);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const balances = await fetchBalances(user.id);

    let html = `<div style="padding-top: 10vh;">`;
    html += `
      <div class="assets-title">资产</div>
      <div class="assets-actions">
        <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
        <button class="assets-btn assets-btn-withdraw" disabled>提币</button>
      </div>
    `;

    TOKEN_LIST.forEach(token => {
      const rawBalance = balances[token.address.toLowerCase()] || '0';
      let formatted = rawBalance;
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
      } else {
        const divisor = Math.pow(10, token.decimals);
        formatted = (Number(rawBalance) / divisor).toFixed(4);
      }
      console.log(`代币 ${token.symbol}：原始余额 ${rawBalance}，显示 ${formatted}`);

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

    html += `</div>`;
    container.innerHTML = html;
  }

  window.refreshAssets = render;
})();
