// js/withdraw.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const WITHDRAW_API = `${SUPABASE_URL}/functions/v1/withdraw`;

  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', decimals: 18 }
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

    const tokenOptions = TOKEN_LIST.map(t => `<option value="${t.symbol}">${t.symbol}</option>`).join('');

    overlay.innerHTML = `
      <div style="background:white;color:#1e293b;max-width:420px;width:90%;padding:24px;border-radius:16px;text-align:left;">
        <h3 style="margin-bottom:16px;">📤 提币</h3>

        <label style="font-size:14px;font-weight:600;">币种</label>
        <select id="withdraw-token-select" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          <option value="">-- 请选择币种 --</option>
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

    overlay.querySelector('#close-withdraw-btn')?.remove(); // 如果之前有残留

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // 根据余额渲染表单或提示
    function renderFormArea() {
      const available = parseFloat(formatUnits(currentBalanceWei, currentDecimals));
      const symbol = tokenSelect.value;
      if (!symbol || available < MIN_WITHDRAW) {
        // 未选币种或余额不足：隐藏表单，显示提示
        formArea.style.display = 'block';
        formArea.innerHTML = `
          <div style="color:#dc2626; font-size:13px; margin-top:8px;">
            最低提现金额 ${MIN_WITHDRAW} TEST（服务费 ${SERVICE_FEE} + 最低到账 ${MIN_RECEIVE}）
          </div>
        `;
        return;
      }

      // 余额足够：显示完整表单
      formArea.style.display = 'block';
      formArea.innerHTML = `
        <label style="font-size:14px;font-weight:600;">提现地址</label>
        <input id="withdraw-address-input" type="text" placeholder="0x..." style="width:100%;padding:10px;margin:8px 0 4px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
        <div style="font-size:11px; color:#999; margin-bottom:12px;">最低提现 ${MIN_WITHDRAW} TEST（服务费 ${SERVICE_FEE} + 最低到账 ${MIN_RECEIVE}）</div>

        <label style="font-size:14px;font-weight:600;">数量</label>
        <div style="display:flex; gap:8px; align-items:center; margin:8px 0 4px;">
          <input id="withdraw-amount-input" type="number" step="any" placeholder="0.0" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          <span id="withdraw-available-label" style="font-size:12px; color:#666; white-space:nowrap;">可用: ${available.toFixed(4)}</span>
          <button id="withdraw-max-btn" style="padding:8px 12px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap;">最大</button>
        </div>

        <div style="font-size:13px; color:#666; margin:4px 0 12px;">
          <div>服务费: <span id="withdraw-fee-text">${SERVICE_FEE} ${symbol}</span></div>
          <div>预计到账: <span id="withdraw-estimate-text">0.0 ${symbol}</span></div>
        </div>

        <div style="display:flex;gap:10px;">
          <button id="submit-withdraw-btn" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:bold;">提现</button>
          <button id="close-withdraw-btn" style="flex:1;padding:12px;background:#e5e7eb;color:#1e293b;border:none;border-radius:8px;font-weight:bold;">取消</button>
        </div>
      `;

      // 绑定新生成元素的事件
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

      // 提交逻辑
      submitBtn.onclick = async () => {
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

        const tokenInfo = getTokenInfo(symbol);
        if (!tokenInfo) {
          resultDiv.textContent = '不支持的币种';
          return;
        }

        const amountWei = parseUnits(amountStr, tokenInfo.decimals);
        if (!amountWei || BigInt(amountWei) <= 0) {
          resultDiv.textContent = '无效的数量';
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
              amount: amountWei
            })
          });

          const data = await resp.json();
          if (resp.ok && data.success) {
            resultDiv.style.color = '#16a34a';
            resultDiv.textContent = `提现成功！实际到账: ${data.actual_amount} TEST，交易哈希: ${data.tx_hash}`;
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

    // 切换币种时重新查询余额并渲染
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

    // 默认选中 TEST（如果只有一个币种）
    if (TOKEN_LIST.length === 1) {
      tokenSelect.value = TOKEN_LIST[0].symbol;
      tokenSelect.dispatchEvent(new Event('change'));
    }
  }

  window.showWithdrawPopup = showWithdrawModal;
})();
