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

  // 强制显示余额的调试开关（URL 加 ?debug=1 启用）
  const DEBUG_MODE = /[?&]debug=1/.test(location.search);

  // 获取余额（直接用原生 fetch，RLS 已关，不带 token 也能读）
  async function fetchBalances(userId) {
    if (!userId) return null;
    const url = `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}`;
    console.log('请求地址:', url);
    try {
      const resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) {
        console.error('请求失败, 状态码:', resp.status, await resp.text());
        return null;
      }
      const data = await resp.json();
      console.log('获取到的余额数据:', data);
      if (!Array.isArray(data) || data.length === 0) {
        console.warn('余额表里没有该用户的记录');
        return {};
      }
      const map = {};
      data.forEach(row => {
        map[row.token_type.toLowerCase()] = row.balance;
      });
      return map;
    } catch (e) {
      console.error('网络请求异常:', e);
      return null;
    }
  }

  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    const userId = user?.id;

    // 显示当前用户 ID（方便核对）
    let debugInfo = '';
    if (userId) {
      debugInfo = `<div style="font-size:12px; color:#999; padding:5px 20px;">当前登录用户ID: ${userId}</div>`;
    } else {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
      return;
    }

    // 启动充值监听
    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    // 如果开启了 debug 模式，直接硬编码显示 999，跳过网络请求
    if (DEBUG_MODE) {
      const fakeBalances = { '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832': '999000000000000000000' };
      renderUI(container, fakeBalances, debugInfo);
      return;
    }

    const balances = await fetchBalances(userId);
    if (balances === null) {
      container.innerHTML = debugInfo + '<div style="padding:20px; text-align:center; color:red;">网络请求失败，请检查控制台</div>';
      return;
    }

    renderUI(container, balances, debugInfo);
  }

  function renderUI(container, balances, debugInfo) {
    let html = `<div style="padding-top: 10vh;">` + debugInfo;
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
