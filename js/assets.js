// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', // 全小写
      decimals: 18,
      price: '$98'
    }
  ];

  async function fetchBalances(userId) {
    if (!supabase || !userId) return {};
    try {
      console.log('查询余额，用户ID:', userId);
      const { data, error } = await supabase
        .from('user_balances')
        .select('token_type, balance')
        .eq('user_id', userId);
      console.log('余额查询原始结果:', { data, error });
      if (error) {
        console.error('获取余额失败:', error);
        return {};
      }
      const map = {};
      data.forEach(row => {
        // 统一转小写作为 key
        map[row.token_type.toLowerCase()] = row.balance;
      });
      console.log('处理后余额映射:', map);
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

    // 启动充值监听
    if (window.YYCardPostDeposit && user.id) {
      window.YYCardPostDeposit.start(user.id);
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const balances = await fetchBalances(user.id);

    // 最外层 div 加上 padding-top: 10vh
    let html = `<div style="padding-top: 10vh;">`;

    html += `
      <div class="assets-title">资产</div>
      <div class="assets-actions">
        <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
        <button class="assets-btn assets-btn-withdraw" disabled>提币</button>
      </div>
    `;

    TOKEN_LIST.forEach(token => {
      // 用全小写地址匹配
      const rawBalance = balances[token.address.toLowerCase()] || '0';
      let formatted = rawBalance;
      // 容错：如果 ethers 未加载，手动计算
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
      } else {
        // 手动除以 10^decimals
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
