// js/assets.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  // 使用项目已初始化的 supabase 客户端，它自动管理 token，与 RLS 无缝配合
  const supabase = window.supabase;

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'
    }
  ];

  // 带超时的查询（兜底保护，10 秒必出结果）
  async function fetchBalancesWithTimeout(userId, timeoutMs = 10000) {
    if (!supabase || !userId) return { error: '客户端未初始化或用户ID为空' };

    const query = supabase
      .from('user_balances')
      .select('token_type, balance')
      .eq('user_id', userId);

    // 同时启动查询和超时计时器
    return Promise.race([
      query.then(({ data, error }) => {
        if (error) {
          console.error('查询余额出错:', error);
          return { error: error.message };
        }
        const map = {};
        (data || []).forEach(row => {
          map[row.token_type.toLowerCase()] = row.balance;
        });
        return { balances: map };
      }),
      new Promise(resolve => setTimeout(() => resolve({ error: '请求超时，请检查网络后刷新重试' }), timeoutMs))
    ]);
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

    // 启动充值监听（不阻塞）
    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    // 显示加载中
    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    // ★ 用 try-catch 确保任何意外错误都不会让页面卡死
    let result;
    try {
      result = await fetchBalancesWithTimeout(userId);
    } catch (e) {
      result = { error: '渲染异常: ' + (e.message || '未知') };
    }

    const isError = result.error != null;
    const balances = result.balances || {};

    // 构建 HTML
    let html = `<div style="padding-top: 10vh;">`;

    // 用户 ID + 复制按钮
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

    // 错误信息置底
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

    // 绑定复制
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
