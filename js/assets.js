// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 币种配置（模拟价格 $98，后续可接入真实价格）
  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'               // 模拟价格
    }
  ];

  // 获取用户余额
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

  // 渲染资产页面
  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
      return;
    }

    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const balances = await fetchBalances(user.id);

    // 构建 HTML
    let html = `
      <div style="padding: 0 20px;">
        <!-- 资产标题 -->
        <h2 style="font-size: 28px; font-weight: 700; margin-bottom: 20px;">资产</h2>

        <!-- 充币 / 提币按钮（放在标题下方） -->
        <div style="display: flex; gap: 12px; margin-bottom: 30px;">
          <button onclick="window.openDepositPopup()" style="
            flex: 1; padding: 12px; background: #3b82f6; color: white;
            border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
          ">充币</button>
          <button disabled style="
            flex: 1; padding: 12px; background: #e5e7eb; color: #9ca3af;
            border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
          ">提币</button>
        </div>

        <!-- 币种列表 -->
    `;

    TOKEN_LIST.forEach(token => {
      const rawBalance = balances[token.address] || '0';
      let formatted = rawBalance;
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
      }

      html += `
        <div style="
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 0; border-bottom: 1px solid #f0f0f0;
        ">
          <!-- 左侧：圆形头像 + 符号 -->
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="/assets/default-avatar.png" style="
              width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
            " onerror="this.src='/assets/default-avatar.png'">
            <span style="font-weight: 700; font-size: 18px;">${token.symbol}</span>
          </div>

          <!-- 中间：数量 -->
          <div style="font-size: 16px; font-weight: 500;">${formatted}</div>

          <!-- 右侧：价格 -->
          <div style="font-size: 16px; color: #10b981; font-weight: 600;">${token.price}</div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  window.refreshAssets = render;
})();
