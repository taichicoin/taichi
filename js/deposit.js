// js/deposit.js
(function() {
  const DEPOSIT_MANAGER_ADDR = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const ABI = ["function depositAddress(bytes32 userId) view returns (address)"];

  // 备用 RPC 列表（按优先级）
  const RPC_LIST = [
    'https://bsc-testnet.publicnode.com',        // 公共节点1
    'https://data-seed-prebsc-1-s1.binance.org:8545', // 你原来的
    'https://bsc-testnet.nodereal.io/v1/seeded-light-node' // 公共节点2
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

  // 快速检测某个 RPC 是否可用（2 秒超时）
  async function testRPC(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const p = new ethers.providers.JsonRpcProvider(url);
      await p.getBlockNumber();
      clearTimeout(timeout);
      return true;
    } catch (e) {
      clearTimeout(timeout);
      return false;
    }
  }

  // 选择一个可用的最快 RPC
  async function pickRPC() {
    for (const url of RPC_LIST) {
      console.log('⏳ 测试 RPC:', url);
      if (await testRPC(url)) {
        console.log('✅ 选定 RPC:', url);
        return url;
      }
    }
    throw new Error('所有 RPC 节点均不可用');
  }

  async function init() {
    if (typeof ethers === 'undefined') {
      console.error('❌ ethers 未加载，请刷新重试');
      return;
    }
    try {
      const rpc = await pickRPC();
      provider = new ethers.providers.JsonRpcProvider(rpc);
      contract = new ethers.Contract(DEPOSIT_MANAGER_ADDR, ABI, provider);
      ready = true;
      console.log('✅ 充值模块就绪');
    } catch (e) {
      console.error('初始化失败:', e);
    }
  }

  // 立即异步初始化，不再轮询
  init();

  async function getAddress(uuid) {
    if (!ready) throw new Error('模块未就绪');
    const bytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
    return await contract.depositAddress(bytes);
  }

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

  window.openDepositPopup = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) { alert('请先登录'); return; }
    if (!ready) { alert('充值功能正在初始化，请稍候...'); return; }
    try {
      const addr = await getAddress(user.id);
      showModal(addr);
    } catch (e) {
      alert('获取充值地址失败，请稍后重试');
      console.error(e);
    }
  };

  // 确保按钮绑定
  function bind() {
    const btn = document.getElementById('deposit-btn');
    if (btn) {
      btn.onclick = window.openDepositPopup;
      console.log('✅ 按钮绑定完成');
    } else {
      setTimeout(bind, 200);
    }
  }
  if (document.readyState === 'complete') bind();
  else window.addEventListener('load', bind);
})();
