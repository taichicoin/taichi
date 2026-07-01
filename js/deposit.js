// js/deposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const DEPOSIT_ADDR_API = `${SUPABASE_URL}/functions/v1/get-depositaddr`;
  const CHAIN_ID = 97; // BSC Testnet
  const TRUSTED_SIGNER_ADDR = '0x1Da84faF7d347640AE15bc5Dcb0e87E1E57539e3';

  // 注入样式
  const style = document.createElement('style');
  style.textContent = `
    .deposit-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000; }
    .deposit-modal { background:#1e293b; color:#e2e8f0; border-radius:12px; padding:20px; width:90%; max-width:400px; text-align:center; }
    .deposit-modal h3 { margin-bottom:10px; }
    .deposit-modal input { width:100%; padding:8px; margin:10px 0; border-radius:6px; background:#0f172a; color:#38bdf8; border:1px solid #334155; font-size:14px; text-align:center; user-select:all; }
    .deposit-modal button { margin:5px; padding:8px 16px; border:none; border-radius:6px; background:#3b82f6; color:white; font-weight:bold; cursor:pointer; }
    .deposit-modal .close-deposit { background:#475569; }
    .deposit-note { font-size:12px; color:#94a3b8; margin-top:8px; }
  `;
  document.head.appendChild(style);

  let ready = false;
  let initError = '';

  function initEthers() {
    if (typeof ethers === 'undefined' || !ethers.utils) {
      initError = 'ethers 库未加载，请刷新页面';
      return false;
    }
    ready = true;
    console.log('✅ 签名验证模块就绪');
    return true;
  }

  let tries = 0;
  const interval = setInterval(() => {
    if (initEthers() || ++tries > 20) clearInterval(interval);
  }, 500);

  // ★ 增强的错误捕获，把后端原始返回暴露出来
  async function getVerifiedDepositAddress(uuid) {
    const body = JSON.stringify({ user_uuid: uuid, chain_id: CHAIN_ID });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let resp;
    try {
      resp = await fetch(DEPOSIT_ADDR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeout);
      throw new Error('网络请求失败，请检查网络或 Supabase 地址配置。\n请求地址：' + DEPOSIT_ADDR_API);
    }
    clearTimeout(timeout);

    // 读取原始文本，无论状态码
    const rawText = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new Error(`后端返回错误 (${resp.status}): ${rawText || '(空响应)'}\n请求地址：${DEPOSIT_ADDR_API}`);
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      throw new Error('后端返回无效 JSON: ' + rawText.slice(0, 200) + '\n请求地址：' + DEPOSIT_ADDR_API);
    }

    if (data.error) {
      throw new Error(data.error + '\n请求地址：' + DEPOSIT_ADDR_API);
    }

    const { address, signature, signer } = data;
    if (!address || !signature || !signer) {
      throw new Error('后端返回缺少必要字段 (address/signature/signer)\n原始返回：' + rawText.slice(0, 300));
    }

    // 签名验证
    if (signer.toLowerCase() !== TRUSTED_SIGNER_ADDR.toLowerCase()) {
      throw new Error('签名者身份不符，存在安全风险！\n收到 signer: ' + signer + '\n预期 signer: ' + TRUSTED_SIGNER_ADDR);
    }

    const userId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
    const messageHash = ethers.utils.solidityKeccak256(
      ["uint256", "bytes32", "address"],
      [CHAIN_ID, userId, address]
    );
    const recoveredAddr = ethers.utils.verifyMessage(
      ethers.utils.arrayify(messageHash),
      signature
    );
    if (recoveredAddr.toLowerCase() !== TRUSTED_SIGNER_ADDR.toLowerCase()) {
      throw new Error('充值地址签名验证失败！\n恢复地址: ' + recoveredAddr + '\n预期地址: ' + TRUSTED_SIGNER_ADDR);
    }

    return address;
  }

  // 弹窗
  function showModal(addr) {
    const old = document.querySelector('.deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'deposit-overlay';
    overlay.innerHTML = `
      <div class="deposit-modal">
        <h3>💰 充值 (BSC 测试网)</h3>
        <p>向此地址转币，系统自动加余额</p>
        <input type="text" value="${addr}" readonly id="dep-addr-input">
        <button id="copy-addr-btn">📋 复制</button>
        <p class="deposit-note">⚠️ 仅限 BSC 链，跨链转账无法找回</p>
        <button class="close-deposit">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-deposit').onclick = () => overlay.remove();
    overlay.querySelector('#copy-addr-btn').onclick = () => {
      const inp = document.getElementById('dep-addr-input');
      inp.select();
      document.execCommand('copy');
      alert('地址已复制（仅限 BSC 链）');
    };
  }

  // ★ 弹窗显示详细错误
  function showErrorModal(message) {
    const old = document.querySelector('.deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'deposit-overlay';
    overlay.innerHTML = `
      <div class="deposit-modal" style="background:#450a0a; color:#fecaca;">
        <h3>❌ 充值地址获取失败</h3>
        <p style="white-space: pre-wrap; text-align: left; font-size: 13px;">${message}</p>
        <button class="close-deposit" style="background:#ef4444; margin-top: 10px;">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-deposit').onclick = () => overlay.remove();
  }

  window.openDepositPopup = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) {
      showErrorModal('请先登录');
      return;
    }
    if (!ready) {
      showErrorModal(initError || '系统初始化中，请稍后点击');
      return;
    }

    try {
      const addr = await getVerifiedDepositAddress(user.id);
      showModal(addr);
    } catch (e) {
      // 直接弹窗显示错误详情
      showErrorModal(e.message || '未知错误');
    }
  };

  // 按钮绑定
  function bindBtn() {
    const btn = document.getElementById('deposit-btn');
    if (btn) {
      btn.onclick = window.openDepositPopup;
    } else {
      setTimeout(bindBtn, 300);
    }
  }
  if (document.readyState === 'complete') bindBtn();
  else window.addEventListener('load', bindBtn);
})();
