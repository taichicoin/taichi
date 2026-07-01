// js/billviews.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  // 已知代币列表（用于显示符号）
  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', decimals: 18 }
  ];

  function getTokenInfo(tokenAddr) {
    return TOKEN_LIST.find(t => t.address.toLowerCase() === tokenAddr.toLowerCase());
  }

  // 格式化金额（wei -> 可读）
  function formatAmount(amountWei, decimals = 18) {
    try {
      if (typeof ethers !== 'undefined' && ethers.utils) {
        return ethers.utils.formatUnits(amountWei, decimals);
      }
      const val = Number(amountWei) / Math.pow(10, decimals);
      return val.toFixed(4);
    } catch (e) {
      return '0';
    }
  }

  // 格式化时间
  function formatTime(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return dateStr;
    }
  }

  // 截短 tx hash
  function shortHash(hash) {
    return hash.slice(0, 6) + '...' + hash.slice(-4);
  }

  async function fetchDepositRecords(userId) {
    // 获取当前有效的 access_token
    let token = '';
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('获取 session 失败，尝试使用匿名请求');
    }

    // 如果 token 存在，使用 fetch；否则回退到 supabase 客户端（可能带 anon key）
    if (token) {
      const url = `${SUPABASE_URL}/rest/v1/deposit_events?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`;
      const resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      return await resp.json();
    }

    // 回退到 supabase 客户端（如果 token 不存在但客户端已初始化，可能只允许公开读取，但 RLS 仍会验证 auth.uid()）
    if (window.supabase && window.supabase.from) {
      const { data, error } = await window.supabase
        .from('deposit_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    }

    throw new Error('无法获取认证信息，请重新登录');
  }

  function buildBillModal(records) {
    const old = document.querySelector('.bill-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'bill-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10002;';

    let listHtml = '';
    if (!records || records.length === 0) {
      listHtml = '<div style="text-align:center;padding:20px;color:#888;">暂无充值记录</div>';
    } else {
      listHtml = records.map(r => {
        const info = getTokenInfo(r.token_type);
        const symbol = info ? info.symbol : r.token_type.slice(0, 6) + '...';
        const decimals = info ? info.decimals : 18;
        const amount = formatAmount(r.amount, decimals);
        const time = formatTime(r.created_at);
        const hash = shortHash(r.tx_hash);
        const statusText = r.status === 1 ? '✅ 成功' : '❌ 失败';
        const statusColor = r.status === 1 ? '#16a34a' : '#dc2626';

        return `
          <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-bottom:8px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:bold;">${amount} ${symbol}</div>
              <div style="color:#666; font-size:12px;">${time}</div>
              <div style="color:#999; font-family:monospace; font-size:12px;">${hash}</div>
            </div>
            <div style="color:${statusColor}; font-weight:bold;">${statusText}</div>
          </div>
        `;
      }).join('');
    }

    overlay.innerHTML = `
      <div style="background:white; color:#1e293b; max-width:480px; width:90%; max-height:70vh; border-radius:16px; padding:20px; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;">📋 充值记录</h3>
          <button id="close-bill-btn" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
        </div>
        <div style="overflow-y:auto; flex:1;">
          ${listHtml}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#close-bill-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // 对外入口
  window.showBillModal = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      alert('请先登录');
      return;
    }

    // 先显示加载中
    buildBillModal(null);
    const loadingDiv = document.querySelector('.bill-overlay');
    if (loadingDiv) {
      const contentDiv = loadingDiv.querySelector('div > div:last-child');
      if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';
    }

    try {
      const records = await fetchDepositRecords(user.id);
      buildBillModal(records);
    } catch (err) {
      console.error('账单加载失败:', err);
      const errDiv = document.querySelector('.bill-overlay');
      if (errDiv) {
        const contentDiv = errDiv.querySelector('div > div:last-child');
        if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center;color:#a00;padding:20px;">加载失败: ' + err.message + '</div>';
      }
    }
  };
})();
