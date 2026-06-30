// js/assets.js
(function() {
  // ========== 配置（硬编码保底，避免变量丢失） ==========
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL || 'https://kvflbfdqyehtlfmigaxa.supabase.co';
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2ZmxiZmRxeWVodGxmbWlnYXhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY5MjQwMDAsImV4cCI6MjAyMjUwMDAwMH0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // 替换为你的真实 anon key

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      decimals: 18,
      price: '$98'
    }
  ];

  // 获取余额（直接 fetch，不用 token，RLS 已关）
  async function fetchBalances(userId) {
    const url = `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}`;
    console.log('请求余额:', url);
    try {
      const resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!Array.isArray(data)) throw new Error('返回格式错误');
      const map = {};
      data.forEach(row => { map[row.token_type.toLowerCase()] = row.balance; });
      return map;
    } catch (err) {
      console.error('余额请求失败:', err);
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

  // 主渲染函数
  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    const user = window.YYCardAuth?.currentUser;
    const userId = user?.id;

    // 未登录
    if (!userId) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
      return;
    }

    // 启动监听
    if (window.YYCardPostDeposit && userId) {
      window.YYCardPostDeposit.start(userId);
    }

    // 先显示加载状态
    container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

    // 获取余额
    const balances = await fetchBalances(userId);
    const isError = (balances === null);

    // 开始构建 HTML
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
      const rawBalance = (balances && !isError) ? (balances[token.address.toLowerCase()] || '0') : '0';
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
          <div class="asset-amount">${isError ? '0.0' : formatted}</div>
          <div class="asset-price">${token.price}</div>
        </div>
      `;
    });

    // 错误信息放在最底部，不影响上面样式
    if (isError) {
      html += `
        <div style="margin-top: 30px; padding: 12px 20px; background: #fff3cd; color: #856404; border-radius: 8px; font-size: 13px; text-align: center;">
          ⚠️ 余额加载失败，请检查网络或稍后重试
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    // 绑定复制按钮事件
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
