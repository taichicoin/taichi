// js/assets.js
(function() {
  // 直接取全局配置，不用你手动改任何东西
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  // 直接用项目里已经初始化好的 supabase 客户端（auth.js 里用过，100% 能跑）
  const supabase = window.supabase || (window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY));

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'
    }
  ];

  // 获取余额（用 supabase 客户端，自动处理 RLS 和 apikey）
  async function fetchBalances(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_balances')
        .select('token_type, balance')
        .eq('user_id', userId);
      if (error) {
        console.error('查询余额出错:', error);
        return null;
      }
      const map = {};
      (data || []).forEach(row => {
        map[row.token_type.toLowerCase()] = row.balance;
      });
      return map;
    } catch (e) {
      console.error('查询异常:', e);
      return null;
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

    // 启动充值监听
    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    // 显示加载中
    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    const balances = await fetchBalances(userId);
    const isError = (balances === null);

    // 开始组装 HTML（所有样式保持原样）
    let html = `<div style="padding-top: 10vh;">`;

    // 用户 ID 显示 + 复制按钮
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

    // 资产标题
    html += `<div class="assets-title">资产</div>`;

    // 充币 / 提币按钮
    html += `
      <div class="assets-actions">
        <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
        <button class="assets-btn assets-btn-withdraw" disabled>提币</button>
      </div>
    `;

    // 币种列表
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

    // 错误信息放在最底部（不影响布局）
    if (isError) {
      html += `
        <div style="margin-top: 30px; padding: 12px 20px; background: #fff3cd; color: #856404; border-radius: 8px; font-size: 13px; text-align: center;">
          ⚠️ 余额加载失败，请检查网络或稍后重试
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    // 绑定复制按钮
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
