// js/withdraw.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const WITHDRAW_API = `${SUPABASE_URL}/functions/v1/withdraw`;

  // 目前支持的币种（与充值保持一致）
  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', decimals: 18 }
  ];

  const SERVICE_FEE = 10; // 每笔提现服务费 10 TEST
  const MIN_RECEIVE = 0.1; // 最低到账 0.1 TEST，即最少提现 10.1

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

  // 查询用户可用余额
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
      // 回退 fetch
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/user_balances?user_id=eq.${encodeURIComponent(userId)}&token_type=eq.${encodeURIComponent(tokenAddress.toLowerCase())}&select=balance`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
      );
      if (!resp.ok) return '0';
      const arr = await resp.json();
      return arr?.[0]?.balance || '0';
    } catch (e) {
      console.warn('查询余额失败', e);
      return '0';
    }
  }

  function showWithdrawModal() {
    const old = document.querySelector('.withdraw-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'withdraw-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10003;';

    const tokenOptions = TOKEN_LIST.map(t => `<option value="${t.symbol}">${t.symbol} - ${t.address.slice(0,6)}...</option>`).join('');

    overlay.innerHTML = `
      <div style="background:white;color:#1e293b;max-width:420px;width:90%;padding:24px;border-radius:16px;text-align:left;">
        <h3 style="margin-bottom:16px;">📤 提币</h3>

        <label style="font-size:14px;font-weight:600;">币种</label>
        <select id="withdraw-token-select" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          ${tokenOptions}
        </select>

        <label style="font-size:14px;font-weight:600;">提现地址</label>
        <input id="withdraw-address-input" type="text" placeholder="0x..." style="width:100%;padding:10px;margin:8px 0 4px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
        <div style="font-size:11px; color:#999; margin-bottom:12px;">最低提现 ${SERVICE_FEE + MIN_RECEIVE} TEST（服务费 ${SERVICE_FEE} + 最低到账 ${MIN_RECEIVE}）</div>

        <label style="font-size:14px;font-weight:600;">数量</label>
        <div style="display:flex; gap:8px; align-items:center; margin:8px 0 4px;">
          <input id="withdraw-amount-input" type="number" step="any" placeholder="0.0" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          <span id="withdraw-available-label" style="font-size:12px; color:#666; white-space:nowrap;">可用: --</span>
          <button id="withdraw-max-btn" style="padding:8px 12px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap;">最大</button>
        </div>

        <!-- 服务费 & 预计到账 -->
        <div style="font-size:13px; color:#666; margin:4px 0 12px;">
          <div>服务费: <span id="withdraw-fee-text">10.0 TEST</span></div>
          <div>预计到账: <span id="withdraw-estimate-text">0.0 TEST</span></div>
        </div>

        <div id="withdraw-result" style="font-size:13px;color:#dc2626;margin-bottom:12px;word-break:break-all;"></div>

        <div style="display:flex;gap:10px;">
          <button id="submit-withdraw-btn" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:bold;">提交</button>
          <button id="close-withdraw-btn" style="flex:1;padding:12px;background:#e5e7eb;color:#1e293b;border:none;border-radius:8px;font-weight:bold;">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#close-withdraw-btn');
    const submitBtn = overlay.querySelector('#submit-withdraw-btn');
    const resultDiv = overlay.querySelector('#withdraw-result');

    const tokenSelect = document.getElementById('withdraw-token-select');
    const amountInput = document.getElementById('withdraw-amount-input');
    const maxBtn = document.getElementById('withdraw-max-btn');
    const availableLabel = document.getElementById('withdraw-available-label');
    const feeText = document.getElementById('withdraw-fee-text');
    const estimateText = document.getElementById('withdraw-estimate-text');

    let currentBalanceWei = '0';
    let currentDecimals = 18;

    closeBtn.onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // 更新显示：可用余额、最大可提、预计到账
    function updateBalanceDisplay() {
      const symbol = tokenSelect.value;
      const info = getTokenInfo(symbol);
      if (info) currentDecimals = info.decimals;

      const available = formatUnits(currentBalanceWei, currentDecimals);
      availableLabel.textContent = `可用: ${available}`;

      const inputVal = parseFloat(amountInput.value) || 0;
      const estimate = Math.max(0, inputVal);
      feeText.textContent = `${SERVICE_FEE} ${symbol}`;
      estimateText.textContent = `${estimate.toFixed(4)} ${symbol}`;
    }

    // 最大按钮：填入 可用余额 - 服务费（但不能小于最低提现金额）
    maxBtn.onclick = () => {
      const available = parseFloat(formatUnits(currentBalanceWei, currentDecimals));
      const minWithdraw = SERVICE_FEE + MIN_RECEIVE;
      const maxWithdraw = Math.max(0, available - SERVICE_FEE);
      // 如果可用余额不够最低提现，则不填
      if (available < minWithdraw) {
        amountInput.value = '';
        updateBalanceDisplay();
        return;
      }
      amountInput.value = maxWithdraw.toFixed(4);
      updateBalanceDisplay();
    };

    // 输入变化时更新预计到账
    amountInput.addEventListener('input', () => updateBalanceDisplay());

    // 加载余额
    (async () => {
      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) return;
      const info = getTokenInfo(tokenSelect.value);
      if (!info) return;
      currentBalanceWei = await fetchUserBalance(user.id, info.address);
      updateBalanceDisplay();
    })();

    // 切换币种时重新加载余额
    tokenSelect.addEventListener('change', async () => {
      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) return;
      const info = getTokenInfo(tokenSelect.value);
      if (!info) return;
      currentBalanceWei = await fetchUserBalance(user.id, info.address);
      updateBalanceDisplay();
    });

    // 提交
    submitBtn.onclick = async () => {
      const tokenSymbol = tokenSelect.value;
      const toAddress = document.getElementById('withdraw-address-input').value.trim();
      const amountStr = amountInput.value.trim();

      if (!toAddress || !amountStr) {
        resultDiv.textContent = '请填写完整信息';
        return;
      }
      if (typeof ethers !== 'undefined' && ethers.utils && !ethers.utils.isAddress(toAddress)) {
        resultDiv.textContent = '无效的提现地址';
        return;
      }

      const tokenInfo = getTokenInfo(tokenSymbol);
      if (!tokenInfo) {
        resultDiv.textContent = '不支持的币种';
        return;
      }

      const amountWei = parseUnits(amountStr, tokenInfo.decimals);
      if (!amountWei || BigInt(amountWei) <= 0) {
        resultDiv.textContent = '无效的数量';
        return;
      }

      // 校验最低提现（输入金额必须 >= SERVICE_FEE + MIN_RECEIVE）
      const minWithdrawWei = parseUnits(String(SERVICE_FEE + MIN_RECEIVE), tokenInfo.decimals);
      if (BigInt(amountWei) < BigInt(minWithdrawWei)) {
        resultDiv.textContent = `最低提现 ${SERVICE_FEE + MIN_RECEIVE} ${tokenSymbol}`;
        return;
      }

      // 检查用户输入的金额 + 服务费 是否超过余额
      const feeWei = parseUnits(String(SERVICE_FEE), tokenInfo.decimals);
      const totalCostWei = BigInt(amountWei) + BigInt(feeWei);
      if (totalCostWei > BigInt(currentBalanceWei)) {
        resultDiv.textContent = `余额不足（含服务费 ${SERVICE_FEE} ${tokenSymbol}）`;
        return;
      }

      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) {
        resultDiv.textContent = '请先登录';
        return;
      }

      let accessToken = '';
      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        accessToken = session?.access_token || '';
      } catch (e) {}

      resultDiv.style.color = '#666';
      resultDiv.textContent = '处理中...';

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
            amount: amountWei,
            fee: feeWei
          })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          resultDiv.style.color = '#16a34a';
          resultDiv.textContent = `提现成功！交易哈希: ${data.tx_hash}`;
          if (window.refreshAssets) window.refreshAssets();
          setTimeout(() => overlay.remove(), 3000);
        } else {
          resultDiv.style.color = '#dc2626';
          resultDiv.textContent = `提现失败: ${data.error || '未知错误'}`;
        }
      } catch (err) {
        resultDiv.style.color = '#dc2626';
        resultDiv.textContent = '网络错误: ' + err.message;
      }
    };
  }

  // 对外暴露
  window.showWithdrawPopup = showWithdrawModal;
})();
