// js/selfdeposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const COLLECT_API = `${SUPABASE_URL}/functions/v1/collect`;

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      name: 'test测试'
    }
  ];

  function showSelfDepositModal() {
    const old = document.querySelector('.self-deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'self-deposit-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10001;';

    const tokenOptions = TOKEN_LIST.map(t =>
      `<option value="${t.address}">${t.symbol} - ${t.name}</option>`
    ).join('');

    overlay.innerHTML = `
      <div style="background:white;color:#1e293b;max-width:420px;width:90%;padding:24px;border-radius:16px;text-align:left;">
        <h3 style="margin-bottom:16px;font-size:20px;">📌 手动上账</h3>
        <label style="font-size:14px;font-weight:600;">选择币种</label>
        <select id="self-token-select" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          ${tokenOptions}
        </select>
        <label style="font-size:14px;font-weight:600;">交易哈希</label>
        <input type="text" id="self-txhash-input" placeholder="0x..." style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
        <div id="self-result" style="font-size:13px;color:#dc2626;margin-bottom:12px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="submit-self-btn" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:bold;">提交</button>
          <button id="close-self-btn" style="flex:1;padding:12px;background:#e5e7eb;color:#1e293b;border:none;border-radius:8px;font-weight:bold;">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#close-self-btn').onclick = () => overlay.remove();

    overlay.querySelector('#submit-self-btn').onclick = async () => {
      const token = document.getElementById('self-token-select').value;
      const txHash = document.getElementById('self-txhash-input').value.trim();
      const resultDiv = document.getElementById('self-result');
      resultDiv.textContent = '';

      if (!txHash || txHash.length !== 66 || !txHash.startsWith('0x')) {
        resultDiv.textContent = '请输入有效的交易哈希（0x开头+64位）';
        return;
      }

      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) {
        resultDiv.textContent = '请先登录';
        return;
      }

      // 获取 token
      let accessToken = '';
      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        accessToken = session?.access_token || '';
      } catch (e) {}

      const body = JSON.stringify({
        user_uuid: user.id,
        token: token,
        tx_hash: txHash
      });

      resultDiv.textContent = '提交中...';
      try {
        const res = await fetch(COLLECT_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: body
        });
        const text = await res.text();
        if (res.ok) {
          resultDiv.style.color = '#16a34a';
          resultDiv.textContent = '✅ 上账成功！余额已更新';
          setTimeout(() => {
            overlay.remove();
            if (window.refreshAssets) window.refreshAssets();
          }, 1500);
        } else {
          resultDiv.textContent = '❌ ' + text;
        }
      } catch (e) {
        resultDiv.textContent = '网络错误: ' + e.message;
      }
    };
  }

  window.showSelfDeposit = showSelfDepositModal;
})();
