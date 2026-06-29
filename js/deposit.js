// js/deposit.js
(function() {
  const DEPOSIT_MANAGER_ADDR = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const ABI = ["function depositAddress(bytes32 userId) view returns (address)"];

  // 多个 RPC 按优先级
  const RPC_LIST = [
    'https://bsc-testnet.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://bsc-testnet.nodereal.io/v1/seeded-light-node'
  ];

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

  let provider, contract, ready = false;
  let initError = '';

  // 尝试用一个 RPC 初始化，失败后自动切下一个
  async function initModule() {
    if (typeof ethers === 'undefined') {
      initError = 'ethers 库未加载，请刷新页面';
      return;
    }
    for (const url of RPC_LIST) {
      try {
        const p = new ethers.providers.JsonRpcProvider(url);
        // 简单测试：获取区块号
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 3000))
        ]);
        provider = p;
        contract = new ethers.Contract(DEPOSIT_MANAGER_ADDR, ABI, provider);
        ready = true;
        console.log('✅ 充值模块就绪，使用节点:', url);
        return;
      } catch (e) {
        console.warn('RPC 不可用:', url, e.message);
      }
    }
    initError = '网络连接失败，请稍后重试';
  }

  // 立即初始化
  initModule();

  // 获取充值地址
  async function getAddress(uuid) {
    const bytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
    return await contract.depositAddress(bytes);
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
        <p class="deposit-note">支持 BNB、USDT 等</p>
        <button class="close-deposit">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-deposit').onclick = () => overlay.remove();
    overlay.querySelector('#copy-addr-btn').onclick = () => {
      const inp = document.getElementById('dep-addr-input');
      inp.select();
      document.execCommand('copy');
      alert('已复制');
    };
  }

  // 入口
  window.openDepositPopup = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) { alert('请先登录'); return; }
    if (!ready) {
      // 如果还在尝试，再给点时间
      if (!initError) {
        setTimeout(() => {
          if (ready) window.openDepositPopup();
          else alert(initError || '正在初始化，请稍后点击');
        }, 2000);
        return;
      }
      alert(initError);
      return;
    }
    try {
      const addr = await getAddress(user.id);
      showModal(addr);
    } catch (e) {
      alert('获取地址失败，请稍后重试');
    }
  };

  // 绑定按钮
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
