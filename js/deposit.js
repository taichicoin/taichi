// js/deposit.js
(function() {
  const DEPOSIT_MANAGER_ADDR = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const ABI = [ "function depositAddress(bytes32 userId) view returns (address)" ];
  const RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545';

  let provider, contract, ready = false;

  function init() {
    if (typeof ethers === 'undefined' || !ethers.providers) {
      console.error('❌ ethers 未加载，充值不可用');
      return;
    }
    try {
      provider = new ethers.providers.JsonRpcProvider(RPC);
      contract = new ethers.Contract(DEPOSIT_MANAGER_ADDR, ABI, provider);
      ready = true;
      console.log('✅ 充值模块就绪');
    } catch (e) {
      console.error('充值初始化失败:', e);
    }
  }

  // 等 ethers 加载好再初始化
  let tries = 0;
  const interval = setInterval(() => {
    if (typeof ethers !== 'undefined' && ethers.providers) {
      clearInterval(interval);
      init();
    }
    if (++tries > 20) clearInterval(interval);
  }, 500);

  async function getDepositAddress(userUUID) {
    if (!ready || !contract) throw new Error('模块未就绪');
    const userIdBytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(userUUID));
    return await contract.depositAddress(userIdBytes);
  }

  function showModal(addr) {
    const old = document.querySelector('.deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'deposit-overlay';
    overlay.innerHTML = `
      <div class="deposit-modal">
        <h3>💰 充值 (BSC 测试网)</h3>
        <p>向此地址转测试币，系统自动加余额</p>
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
      alert('地址已复制');
    };
  }

  window.openDepositPopup = async function() {
    const user = window.YYCardAuth?.currentUser;
    if (!user || !user.id) {
      alert('请先登录');
      return;
    }
    try {
      const addr = await getDepositAddress(user.id);
      showModal(addr);
    } catch (err) {
      console.error(err);
      alert('获取充值地址失败，请稍后重试');
    }
  };
})();
