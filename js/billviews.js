// js/billviews.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', decimals: 18 }
  ];

  function getTokenInfo(tokenAddr) {
    return TOKEN_LIST.find(t => t.address.toLowerCase() === tokenAddr.toLowerCase());
  }

  // ★ 修复金额格式化，使用 BigInt 避免大数溢出
  function formatAmount(amountWei, decimals = 18) {
    if (!amountWei || amountWei === '0') return '0.0';
    try {
      // 优先使用 ethers（最可靠）
      if (typeof ethers !== 'undefined' && ethers.utils && ethers.utils.formatUnits) {
        return ethers.utils.formatUnits(amountWei, decimals);
      }
    } catch (e) {
      console.warn('ethers formatUnits 失败，降级使用 BigInt', e);
    }

    // 回退：BigInt 计算
    try {
      const val = BigInt(amountWei);
      const divisor = BigInt(10) ** BigInt(decimals);
      const integerPart = val / divisor;
      const remainder = val % divisor;
      // 补齐前导零，保留 4 位小数
      const remainderStr = remainder.toString().padStart(decimals, '0').slice(0, 4);
      return `${integerPart.toString()}.${remainderStr}`;
    } catch (e) {
      console.error('BigInt 格式化失败', e);
      return '0.0';
    }
  }

  function formatTime(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return dateStr;
    }
  }

  function shortHash(hash) {
    return hash.slice(0, 6) + '...' + hash.slice(-4);
  }

  async function fetchDepositRecords(userId) {
    let token = '';
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('获取 session 失败');
    }

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
          <h3 style="margin:0;"> 充值记录</h3>
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

  window.showBillModal = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      alert('请先登录');
      return;
    }

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
