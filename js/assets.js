// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) 
    || (typeof supabase !== 'undefined' && supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

  // 支持的币种列表（按你的实际合约改）
  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      name: 'test测试',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', // 小写
      decimals: 18
    }
  ];

  // 获取当前用户所有余额
  async function fetchBalances(userId) {
    if (!supabase || !userId) return {};
    const { data, error } = await supabase
      .from('user_balances')
      .select('token_type, balance')
      .eq('user_id', userId);
    if (error) {
      console.error('获取余额失败:', error);
      return {};
    }
    const map = {};
    data.forEach(row => {
      map[row.token_type.toLowerCase()] = row.balance;
    });
    return map;
  }

  // 渲染资产页面（全白）
  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      container.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">请先登录</div>`;
      return;
    }

    // 显示加载状态
    container.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">加载中...</div>`;

    const balances = await fetchBalances(user.id);

    // 构建 HTML
    let html = `
      <div style="padding: 20px; padding-top: max(20px, env(safe-area-inset-top)); height: 100%; box-sizing: border-box;">
        <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 700;">资产</h2>
    `;

    TOKEN_LIST.forEach(token => {
      const rawBalance = balances[token.address] || '0';
      // 格式化余额（如果 ethers 已加载）
      let formatted = rawBalance;
      if (typeof ethers !== 'undefined' && ethers.utils) {
        formatted = ethers.utils.formatUnits(rawBalance, token.decimals);
      }

      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid #f0f0f0;">
          <div>
            <div style="font-weight: 600; font-size: 18px;">${token.symbol}</div>
            <div style="font-size: 13px; color: #999; margin-top: 2px;">${token.name}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 500; font-size: 16px;">${formatted}</div>
            <div style="margin-top: 10px;">
              <button class="asset-deposit-btn" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 14px;">充币</button>
              <button disabled style="background: #e5e7eb; color: #9ca3af; border: none; border-radius: 6px; padding: 6px 16px; margin-left: 8px; font-size: 14px;">提币</button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // 绑定充币按钮（直接调用已有的 openDepositPopup）
    container.querySelectorAll('.asset-deposit-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.openDepositPopup) {
          window.openDepositPopup();
        } else {
          alert('充值功能未就绪，请稍后重试');
        }
      };
    });
  }

  // 暴露全局刷新函数
  window.refreshAssets = render;
})();
