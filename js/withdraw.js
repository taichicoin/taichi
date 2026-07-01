// js/withdraw.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const WITHDRAW_API = `${SUPABASE_URL}/functions/v1/withdraw`;

  // 目前支持的币种（与充值保持一致）
  const TOKEN_LIST = [
    { symbol: 'TEST', address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832', decimals: 18 }
  ];

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
      // 回退：简单乘以 10^decimals，但可能有精度问题，仅做后备
      const num = parseFloat(amountStr);
      if (isNaN(num)) throw new Error('无效数字');
      return BigInt(Math.floor(num * 10 ** decimals)).toString();
    } catch (e) {
      return null;
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
        <input id="withdraw-address-input" type="text" placeholder="0x..." style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
        <label style="font-size:14px;font-weight:600;">数量</label>
        <input id="withdraw-amount-input" type="number" step="any" placeholder="0.0" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
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

    closeBtn.onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    submitBtn.onclick = async () => {
      const tokenSymbol = document.getElementById('withdraw-token-select').value;
      const toAddress = document.getElementById('withdraw-address-input').value.trim();
      const amountStr = document.getElementById('withdraw-amount-input').value.trim();

      // 基本校验
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

      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) {
        resultDiv.textContent = '请先登录';
        return;
      }

      // 获取 access token
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
          resultDiv.textContent = `提现成功！交易哈希: ${data.tx_hash}`;
          // 刷新资产
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
