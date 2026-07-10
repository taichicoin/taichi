// js/withdraw.js（支持中英双语）
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const WITHDRAW_API = `${SUPABASE_URL}/functions/v1/withdraw`;

  const L = () => window.YYCardAssetsLang;
  function t(key, fallback) {
    const lang = L();
    return lang?.t ? lang.t(key) : (fallback || key);
  }

  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xed8deeCBbA6Cc5DD4B583392AeA6191ED142e1CA', decimals: 18 }
  ];

  const SERVICE_FEE = 10;
  const MIN_RECEIVE = 0.1;
  const MIN_WITHDRAW = SERVICE_FEE + MIN_RECEIVE;

  function getTokenInfo(symbolOrAddress) {
    return TOKEN_LIST.find(
      t => t.symbol === symbolOrAddress || t.address.toLowerCase() === symbolOrAddress.toLowerCase()
    );
  }

  function parseUnits(amountStr, decimals) {
    try {
      if (typeof ethers !== 'undefined' && ethers.utils) {
        return ethers.utils.parseUnits(amountStr, decimals).toString();
      }
      const num = parseFloat(amountStr);
      if (isNaN(num)) throw new Error('无效数字');
      return BigInt(Math.floor(num * 10 ** decimals)).toString();
    } catch (e) {
      return null;
    }
  }

  function formatUnits(amountWei, decimals) {
    try {
      if (typeof ethers !== 'undefined' && ethers.utils) {
        return ethers.utils.formatUnits(amountWei, decimals);
      }
      const val = Number(amountWei) / Math.pow(10, decimals);
      return val.toFixed(4);
    } catch (e) {
      return '0.0';
    }
  }

  async function fetchUserBalance(userId, tokenAddress) {
    try {
      if (window.supabase && window.supabase.from) {
        const { data, error } = await window.supabase
          .from('user_balances')
          .select('balance')
          .eq('user_id', userId)
          .eq('token_type', tokenAddress.toLowerCase())
          .maybeSingle();
        if (error || !data) return '0';
        return data.balance;
      }
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}&token_type=eq.${encodeURIComponent(tokenAddress.toLowerCase())}&select=balance`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
      );
      if (!resp.ok) return '0';
      const arr = await resp.json();
      return arr?.[0]?.balance || '0';
    } catch (e) {
      console.warn(t('query_balance_failed', '查询余额失败'), e);
      return '0';
    }
  }

  function showWithdrawModal() {
    const old = document.querySelector('.withdraw-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'withdraw-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10003;';

    const tokenOptions = TOKEN_LIST.map(t => `<option value="${t.symbol}">${t.symbol}</option>`).join('');

    overlay.innerHTML = `
      <div style="background:white;color:#1e293b;max-width:420px;width:90%;padding:24px;border-radius:16px;text-align:left;">
        <h3 style="margin-bottom:16px;">${t('withdraw_title', '提币')}</h3>

        <label style="font-size:14px;font-weight:600;">${t('token', '币种')}</label>
        <select id="withdraw-token-select" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          <option value="">-- ${t('select_token_placeholder', '请选择币种')} --</option>
          ${tokenOptions}
        </select>

        <div id="withdraw-form-area" style="display:none;"></div>

        <div id="withdraw-result" style="font-size:13px;color:#dc2626;margin-top:12px;word-break:break-all;"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const tokenSelect = document.getElementById('withdraw-token-select');
    const formArea = document.getElementById('withdraw-form-area');
    const resultDiv = document.getElementById('withdraw-result');

    let currentBalanceWei = '0';
    let currentDecimals = 18;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    function renderFormArea() {
      const available = parseFloat(formatUnits(currentBalanceWei, currentDecimals));
      const symbol = tokenSelect.value;
      if (!symbol || available < MIN_WITHDRAW) {
        formArea.style.display = 'block';
        formArea.innerHTML = `
          <div style="color:#dc2626; font-size:13px; margin-top:8px;">
            ${t('min_withdraw_hint', '最低提现金额 {min} {symbol}（服务费 {fee} + 最低到账 {receive}）')
              .replace('{min}', MIN_WITHDRAW)
              .replace('{symbol}', symbol || 'TEST')
              .replace('{fee}', SERVICE_FEE)
              .replace('{receive}', MIN_RECEIVE)}
          </div>
        `;
        return;
      }

      formArea.style.display = 'block';
      formArea.innerHTML = `
        <label style="font-size:14px;font-weight:600;">${t('withdraw_address', '提现地址')}</label>
        <input id="withdraw-address-input" type="text" placeholder="0x..." style="width:100%;padding:10px;margin:8px 0 4px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
        <div style="font-size:11px; color:#999; margin-bottom:12px;">
          ${t('min_withdraw_hint', '最低提现 {min} {symbol}（服务费 {fee} + 最低到账 {receive}）')
            .replace('{min}', MIN_WITHDRAW)
            .replace('{symbol}', symbol)
            .replace('{fee}', SERVICE_FEE)
            .replace('{receive}', MIN_RECEIVE)}
        </div>

        <label style="font-size:14px;font-weight:600;">${t('amount', '数量')}</label>
        <div style="display:flex; gap:8px; align-items:center; margin:8px 0 4px;">
          <input id="withdraw-amount-input" type="number" step="any" placeholder="0.0" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          <span id="withdraw-available-label" style="font-size:12px; color:#666; white-space:nowrap;">${t('available', '可用')}: ${available.toFixed(4)}</span>
          <button id="withdraw-max-btn" style="padding:8px 12px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap;">${t('max', '最大')}</button>
        </div>

        <div style="font-size:13px; color:#666; margin:4px 0 12px;">
          <div>${t('fee_label', '服务费')}: <span id="withdraw-fee-text">${SERVICE_FEE} ${symbol}</span></div>
          <div>${t('estimate_arrival', '预计到账')}: <span id="withdraw-estimate-text">0.0 ${symbol}</span></div>
        </div>

        <div style="display:flex;gap:10px;">
          <button id="submit-withdraw-btn" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:bold;">${t('withdraw_btn', '提现')}</button>
          <button id="close-withdraw-btn" style="flex:1;padding:12px;background:#e5e7eb;color:#1e293b;border:none;border-radius:8px;font-weight:bold;">${t('cancel', '取消')}</button>
        </div>
      `;

      const amountInput = document.getElementById('withdraw-amount-input');
      const maxBtn = document.getElementById('withdraw-max-btn');
      const estimateText = document.getElementById('withdraw-estimate-text');
      const submitBtn = document.getElementById('submit-withdraw-btn');
      const closeBtn = document.getElementById('close-withdraw-btn');

      closeBtn.onclick = () => overlay.remove();

      function updateEstimate() {
        const inputVal = parseFloat(amountInput.value) || 0;
        const estimate = Math.max(0, inputVal - SERVICE_FEE);
        estimateText.textContent = `${estimate.toFixed(4)} ${symbol}`;
      }

      maxBtn.onclick = () => {
        amountInput.value = available.toFixed(4);
        updateEstimate();
      };

      amountInput.addEventListener('input', updateEstimate);

      submitBtn.onclick = async () => {
        const toAddress = document.getElementById('withdraw-address-input').value.trim();
        const amountStr = amountInput.value.trim();

        if (!toAddress || !amountStr) {
          resultDiv.textContent = t('fill_all_fields', '请填写完整信息');
          return;
        }
        if (typeof ethers !== 'undefined' && ethers.utils && !ethers.utils.isAddress(toAddress)) {
          resultDiv.textContent = t('invalid_address', '无效的提现地址');
          return;
        }

        const tokenInfo = getTokenInfo(symbol);
        if (!tokenInfo) {
          resultDiv.textContent = t('unsupported_token', '不支持的币种');
          return;
        }

        const amountWei = parseUnits(amountStr, tokenInfo.decimals);
        if (!amountWei || BigInt(amountWei) <= 0) {
          resultDiv.textContent = t('invalid_amount', '无效的数量');
          return;
        }

        const user = window.YYCardAuth?.currentUser;
        if (!user?.id) {
          resultDiv.textContent = t('please_login', '请先登录');
          return;
        }

        let accessToken = '';
        try {
          const { data: { session } } = await window.supabase.auth.getSession();
          accessToken = session?.access_token || '';
        } catch (e) {}

        resultDiv.style.color = '#666';
        resultDiv.textContent = t('processing', '处理中...');

        try {
          const resp = await fetch(WITHDRAW_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              user_uuid: user.id,
              token: tokenInfo.address,
              to: toAddress,
              amount: amountWei
            })
          });

          const data = await resp.json();
          if (resp.ok && data.success) {
            resultDiv.style.color = '#16a34a';
            resultDiv.textContent = t('withdraw_success', '提现成功！实际到账: {actual} TEST，交易哈希: {tx}')
              .replace('{actual}', data.actual_amount)
              .replace('{tx}', data.tx_hash);
            if (window.refreshAssets) window.refreshAssets();
            setTimeout(() => overlay.remove(), 3000);
          } else {
            resultDiv.style.color = '#dc2626';
            resultDiv.textContent = t('withdraw_fail', '提现失败: {error}')
              .replace('{error}', data.error || t('unknown_error', '未知错误'));
          }
        } catch (err) {
          resultDiv.style.color = '#dc2626';
          resultDiv.textContent = t('network_error', '网络错误') + ': ' + err.message;
        }
      };
    }

    tokenSelect.addEventListener('change', async () => {
      const symbol = tokenSelect.value;
      if (!symbol) {
        formArea.style.display = 'none';
        return;
      }
      const info = getTokenInfo(symbol);
      if (!info) {
        formArea.style.display = 'none';
        return;
      }
      currentDecimals = info.decimals;
      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) {
        formArea.style.display = 'none';
        return;
      }
      resultDiv.textContent = '';
      currentBalanceWei = await fetchUserBalance(user.id, info.address);
      renderFormArea();
    });

    if (TOKEN_LIST.length === 1) {
      tokenSelect.value = TOKEN_LIST[0].symbol;
      tokenSelect.dispatchEvent(new Event('change'));
    }
  }

  window.showWithdrawPopup = showWithdrawModal;
})();
