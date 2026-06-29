// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) 
    || (typeof supabase !== 'undefined' && supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

  // 支持的币种配置（按你实际需求扩展）
  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      name: 'test测试',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', // 小写
      decimals: 18
    }
  ];

  // 获取当前用户所有币种余额
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
    data.forEach(row => { map[row.token_type.toLowerCase()] = row.balance; });
    return map;
  }

  // 显示资产面板
  async function showPanel() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      alert('请先登录');
      return;
    }

    // 移除已有面板
    const old = document.getElementById('assets-panel');
    if (old) old.remove();

    // 创建面板
    const panel = document.createElement('div');
    panel.id = 'assets-panel';
    panel.style.cssText = `
      position:fixed; top:0; left:0; width:100%; height:100%;
      background:white; z-index:10000; overflow-y:auto;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: max(20px, env(safe-area-inset-top)) 16px 16px;
      box-sizing:border-box;
    `;
    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
        <h2 style="margin:0; font-size:22px;">资产</h2>
        <button id="close-assets-btn" style="background:none; border:none; font-size:28px; cursor:pointer;">✕</button>
      </div>
      <div id="assets-list" style="margin-top:16px;">加载中...</div>
    `;
    document.body.appendChild(panel);

    // 关闭事件
    panel.querySelector('#close-assets-btn').onclick = () => panel.remove();

    // 加载余额
    const balances = await fetchBalances(user.id);
    const listDiv = panel.querySelector('#assets-list');
    listDiv.innerHTML = '';

    TOKEN_LIST.forEach(token => {
      const bal = balances[token.address] || '0';
      const formatted = ethers.utils.formatUnits(bal, token.decimals);
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding: 16px 0; border-bottom: 1px solid #f0f0f0;
      `;
      row.innerHTML = `
        <div>
          <div style="font-weight:600; font-size:16px;">${token.symbol}</div>
          <div style="font-size:12px; color:#999; margin-top:4px;">${token.name}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:500;">${formatted}</div>
          <div style="margin-top:8px;">
            <button class="asset-deposit-btn" data-symbol="${token.symbol}" style="background:#3b82f6; color:white; border:none; border-radius:4px; padding:4px 12px; font-size:13px;">充币</button>
            <button disabled style="background:#e5e7eb; color:#9ca3af; border:none; border-radius:4px; padding:4px 12px; font-size:13px; margin-left:6px;">提币</button>
          </div>
        </div>
      `;
      listDiv.appendChild(row);
    });

    // 绑定充币按钮（直接调用已有的 openDepositPopup）
    listDiv.querySelectorAll('.asset-deposit-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.openDepositPopup) window.openDepositPopup();
      };
    });
  }

  // 暴露到全局
  window.showAssetsPanel = showPanel;
})();
