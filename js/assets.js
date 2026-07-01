// js/assets.js (改造后，适配 coinlister 目录，含监听状态指示)
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
    if (!userId) return { error: '用户ID为空' };

    let token = '';
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('获取 session 失败', e);
    }

    const url = `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
      }

      const data = await resp.json();
      if (!Array.isArray(data)) return { error: '返回格式异常' };

      const map = {};
      data.forEach(row => {
        if (row.token_type) {
          map[row.token_type.toLowerCase()] = row.balance || '0';
        }
      });
      return { balances: map };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') return { error: '请求超时，请检查网络后重试' };
      return { error: '网络请求失败: ' + (e.message || '未知错误') };
    }
  }

  function formatBalance(rawBalance, decimals) {
    if (!rawBalance || rawBalance === '0') return '0.0';
    try {
      const divisor = Math.pow(10, decimals);
      return (Number(rawBalance) / divisor).toFixed(4);
    } catch (e) {
      return '0.0';
    }
  }

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

  function renderAssetRow(icon, name, amount, price) {
    return `
      <div class="asset-item">
        <div class="asset-left">
          <img src="${icon}" class="asset-icon" onerror="this.src='/assets/default-avatar.png'">
          <span class="asset-symbol">${name}</span>
        </div>
        <div class="asset-amount">${amount}</div>
        <div class="asset-price">${price || '--'}</div>
      </div>
    `;
  }

  async function render() {
    const container = document.getElementById('assets-area');
    if (!container) return;

    try {
      const user = window.YYCardAuth?.currentUser;
      const userId = user?.id;
      if (!userId) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">请先登录</div>';
        return;
      }

      if (window.YYCardPostDeposit && userId) {
        window.YYCardPostDeposit.start(userId);
      }

      container.innerHTML = '<div style="text-align:center; color:#666; padding-top:20px;">加载中...</div>';

      // 查询余额
      let result;
      try {
        result = await fetchBalances(userId);
      } catch (e) {
        result = { error: '渲染异常: ' + (e.message || '未知') };
      }
      const isError = result.error != null;
      const balances = result.balances || {};

      // 动态资产模块
      const dynamicModules = window.__YY_ASSETS__ || [];
      const dynamicBalances = await Promise.allSettled(
        dynamicModules.map(mod => 
          mod.fetchBalance().then(b => ({ mod, balance: b }))
        )
      );

      let html = `<div style="padding-top: 10vh;">`;

      // 用户ID + 复制
      html += `
        <div style="display: flex; align-items: center; justify-content: center; padding: 10px 20px; margin-bottom: 10px;">
          <span style="font-size: 13px; color: #666; background: #f0f0f0; padding: 6px 12px; border-radius: 20px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ID: ${userId}
          </span>
          <button id="copy-user-id-btn" style="margin-left: 8px; background: none; border: 1px solid #ccc; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; white-space: nowrap;">
            复制
          </button>
        </div>
      `;

      html += `<div class="assets-title">资产</div>`;
      // ★ 充币 / 提币 / 手动上账 / 账单
      html += `
        <div class="assets-actions" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
          <button class="assets-btn assets-btn-deposit" onclick="window.openDepositPopup()">充币</button>
          <button class="assets-btn assets-btn-withdraw" onclick="window.showWithdrawPopup()">提币</button>
          <button class="assets-btn" style="background:#f59e0b; color:white;" onclick="window.showSelfDeposit()">手动上账</button>
          <button class="assets-btn" style="background:#e2e8f0; color:#1e293b; border:1px solid #cbd5e1;" onclick="window.showBillModal()"> 账单</button>
        </div>
      `;

      // 渲染 TEST 币种
      TOKEN_LIST.forEach(token => {
        const rawBalance = isError ? '0' : (balances[token.address.toLowerCase()] || '0');
        const formatted = formatBalance(rawBalance, token.decimals);
        html += renderAssetRow('/assets/default-avatar.png', token.symbol, formatted, token.price);
      });

      // 动态模块
      dynamicBalances.forEach(settled => {
        if (settled.status === 'fulfilled') {
          const { mod, balance } = settled.value;
          if (typeof mod.render === 'function') {
            const customHtml = mod.render(balance);
            if (customHtml) {
              html += customHtml;
              return;
            }
          }
          html += renderAssetRow(mod.icon, mod.name, balance, mod.price || null);
        } else {
          console.warn('动态资产模块加载失败', settled.reason);
        }
      });

      if (isError) {
        html += `
          <div style="margin-top: 30px; padding: 16px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; font-size: 14px; color: #856404; word-break: break-all;">
            <strong>⚠️ 余额加载失败</strong><br>
            ${result.error}
          </div>
        `;
      }

      // ★ 监听状态指示器
      const watchStatus = window.__depositWatchStatus || {};
      let statusHtml = '';
      if (watchStatus.watching) {
        statusHtml = `<div style="margin-top:20px;padding:8px 16px;background:#d4edda;border-radius:8px;font-size:12px;color:#155724;">🟢 自动监听已开启</div>`;
      } else if (watchStatus.error) {
        statusHtml = `<div style="margin-top:20px;padding:8px 16px;background:#f8d7da;border-radius:8px;font-size:12px;color:#721c24;">🔴 监听未启动: ${watchStatus.error}</div>`;
      } else {
        statusHtml = `<div style="margin-top:20px;padding:8px 16px;background:#fff3cd;border-radius:8px;font-size:12px;color:#856404;">⏳ 监听初始化中...</div>`;
      }
      html += statusHtml;

      html += `</div>`;
      container.innerHTML = html;

      const copyBtn = document.getElementById('copy-user-id-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          copyToClipboard(userId);
          copyBtn.textContent = ' 已复制';
          setTimeout(() => { copyBtn.textContent = ' 复制'; }, 1500);
        });
      }
    } catch (globalError) {
      container.innerHTML = `
        <div style="padding:20px; text-align:center; color:#a00;">
          ❌ 资产页面渲染失败：${globalError.message || '未知错误'}
        </div>
      `;
    }
  }

  window.refreshAssets = render;
})();
