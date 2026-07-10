// js/billviews.js（支持中英双语）
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  // 获取翻译函数
  const L = () => window.YYCardAssetsLang;
  function t(key, fallback) {
    const lang = L();
    return lang?.t ? lang.t(key) : (fallback || key);
  }

  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xed8deeCBbA6Cc5DD4B583392AeA6191ED142e1CA', decimals: 18 }
  ];

  function getTokenInfo(tokenAddr) {
    return TOKEN_LIST.find(t => t.address.toLowerCase() === tokenAddr.toLowerCase());
  }

  function formatAmount(amountWei, decimals = 18) {
    if (!amountWei || amountWei === '0') return '0.0';
    try {
      if (typeof ethers !== 'undefined' && ethers.utils && ethers.utils.formatUnits) {
        return ethers.utils.formatUnits(amountWei, decimals);
      }
    } catch (e) {
      console.warn('ethers formatUnits 失败', e);
    }
    try {
      const val = BigInt(amountWei);
      const divisor = BigInt(10) ** BigInt(decimals);
      const integerPart = val / divisor;
      const remainder = val % divisor;
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
      // 使用中文格式或英文格式？这里简单使用24小时制，语言包可以改成其他格式，这里暂时固定
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return dateStr;
    }
  }

  function shortHash(hash) {
    return hash.slice(0, 6) + '...' + hash.slice(-4);
  }

  async function fetchRecords(userId) {
    let token = '';
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('获取 session 失败');
    }

    if (!token) {
      if (window.supabase && window.supabase.from) {
        const [depRes, wdRes] = await Promise.all([
          window.supabase.from('deposit_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
          window.supabase.from('withdraw_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
        ]);
        if (depRes.error) throw depRes.error;
        if (wdRes.error) throw wdRes.error;
        return mergeAndSort(depRes.data || [], wdRes.data || []);
      }
      throw new Error(t('auth_failed', '无法获取认证信息，请重新登录'));
    }

    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const [depRes, wdRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/deposit_events?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/withdraw_events?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`, { headers })
    ]);

    let deposits = [];
    let withdraws = [];

    if (depRes.ok) {
      deposits = await depRes.json();
    } else {
      console.warn('充值记录查询失败:', depRes.status);
    }

    if (wdRes.ok) {
      withdraws = await wdRes.json();
    } else {
      console.warn('提现记录查询失败:', wdRes.status);
    }

    return mergeAndSort(deposits, withdraws);
  }

  function mergeAndSort(deposits, withdraws) {
    const merged = [];
    deposits.forEach(d => merged.push({ type: 'deposit', ...d }));
    withdraws.forEach(w => merged.push({ type: 'withdraw', ...w }));
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged.slice(0, 50);
  }

  function buildBillModal(records) {
    const old = document.querySelector('.bill-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'bill-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10002;';

    let listHtml = '';
    if (!records || records.length === 0) {
      listHtml = `<div style="text-align:center;padding:20px;color:#888;">${t('no_records', '暂无记录')}</div>`;
    } else {
      listHtml = records.map(r => {
        const info = getTokenInfo(r.token_type);
        const symbol = info ? info.symbol : r.token_type.slice(0, 6) + '...';
        const decimals = info ? info.decimals : 18;
        const amount = formatAmount(r.amount, decimals);
        const time = formatTime(r.created_at);

        if (r.type === 'deposit') {
          const hash = shortHash(r.tx_hash);
          return `
            <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-bottom:8px; font-size:13px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; color:#16a34a;">${t('deposit', '充值')}</span>
                <span style="font-weight:bold;">+${amount} ${symbol}</span>
              </div>
              <div style="color:#666; font-size:12px;">${time}</div>
              <div style="color:#999; font-family:monospace; font-size:12px;">${hash}</div>
            </div>
          `;
        } else {
          const toAddr = shortHash(r.to_address);
          const txLink = r.tx_hash ? ` <a href="https://testnet.bscscan.com/tx/${r.tx_hash}" target="_blank" style="color:#3b82f6;">${t('view', '查看')}</a>` : '';
          return `
            <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-bottom:8px; font-size:13px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; color:#dc2626;">${t('withdraw', '提现')}</span>
                <span style="font-weight:bold;">-${amount} ${symbol}</span>
              </div>
              <div style="color:#666; font-size:12px;">${time}</div>
              <div style="color:#999; font-family:monospace; font-size:12px;">${t('to', '至')} ${toAddr}${txLink}</div>
            </div>
          `;
        }
      }).join('');
    }

    overlay.innerHTML = `
      <div style="background:white; color:#1e293b; max-width:480px; width:90%; max-height:70vh; border-radius:16px; padding:20px; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;">${t('bill_title', '历史账单')}</h3>
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
      alert(t('please_login', '请先登录'));
      return;
    }

    // 先显示加载中
    buildBillModal(null);
    const loadingDiv = document.querySelector('.bill-overlay');
    if (loadingDiv) {
      const contentDiv = loadingDiv.querySelector('div > div:last-child');
      if (contentDiv) contentDiv.innerHTML = `<div style="text-align:center;padding:20px;">${t('loading', '加载中...')}</div>`;
    }

    try {
      const records = await fetchRecords(user.id);
      buildBillModal(records);
    } catch (err) {
      console.error('账单加载失败:', err);
      const errDiv = document.querySelector('.bill-overlay');
      if (errDiv) {
        const contentDiv = errDiv.querySelector('div > div:last-child');
        if (contentDiv) contentDiv.innerHTML = `<div style="text-align:center;color:#a00;padding:20px;">${t('load_failed', '加载失败')}: ${err.message}</div>`;
      }
    }
  };
})();
