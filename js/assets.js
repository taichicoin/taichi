// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'
    }
  ];

  async function fetchBalances(userId) {
    if (!supabase || !userId) return {};
    try {
      const { data, error } = await supabase
        .from('user_balances')
        .select('token_type, balance')
        .eq('user_id', userId);
      if (error) return {};
      const map = {};
      data.forEach(row => {
        map[row.token_type.toLowerCase()] = row.balance;
      });
      return map;
    } catch (e) {
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

    // ★ 用户点击资产页面时，启动充值监听（只监听一次，若已在监听不会重复）
    if (window.YYCardPostDeposit && user.id) {
      window.YYCardPostDeposit.start(user.id);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const balances = await fetchBalances(user.id);

    // 最外层 div 加上 padding-top: 10vh，保持全屏白底但内容从 10% 开始
    let html = `<div style="padding-top: 10vh;">`;

    html += `
      <div class="assets-title">资产</div>
      <div class="assets-actions">
        <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
        <button class="assets-btn assets-btn-withdraw" disabled>提币</button>
      </div>
    `;

    TOKEN_LIST.forEach(token => {
      const rawBalance = balances[token.address] || '0';
      let formatted = rawBalance;
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
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

    html += `</div>`; // 关闭外层 div
    container.innerHTML = html;
  }

  window.refreshAssets = render;
})();
