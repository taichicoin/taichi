// js/deposit.js
window.YYCardDeposit = (() => {
  const DEPOSIT_MANAGER_ADDRESS = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const DEPOSIT_MANAGER_ABI = [
    "function depositAddress(bytes32 userId) view returns (address)"
  ];

  // 测试网代币列表（按你的实际替换）
  const SUPPORTED_TOKENS = [
    { symbol: 'USDT', addr: '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd' }, // BSC Testnet USDT
    // 主链币 BNB 不用填地址
  ];

  let provider, contract;

  async function init() {
    // 用 ethers v5 的 JsonRpcProvider，和部署脚本一致
    const rpc = 'https://data-seed-prebsc-1-s1.binance.org:8545'; // 或你自己的节点
    provider = new ethers.providers.JsonRpcProvider(rpc);
    contract = new ethers.Contract(DEPOSIT_MANAGER_ADDRESS, DEPOSIT_MANAGER_ABI, provider);
  }

  async function getDepositAddress(userUUID) {
    const userIdBytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(userUUID));
    return await contract.depositAddress(userIdBytes);
  }

  async function openDeposit() {
    const uid = window.YYCardAuth?.currentUser?.id;
    if (!uid) return alert('请先登录');

    try {
      const addr = await getDepositAddress(uid);
      showModal(addr);
    } catch (err) {
      alert('获取充值地址失败');
      console.error(err);
    }
  }

  function showModal(addr) {
    // 移除旧弹窗
    const old = document.querySelector('.deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay deposit-overlay';
    overlay.innerHTML = `
      <div class="modal-content deposit-modal">
        <h3>💰 充值</h3>
        <p>向这个地址转入支持的代币（BSC测试网）</p>
        <div class="deposit-address-box">
          <input type="text" value="${addr}" readonly id="dep-addr">
          <button id="copy-addr">📋</button>
        </div>
        <p class="deposit-note">支持：BNB, USDT 等</p>
        <button class="btn close-deposit">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.close-deposit').onclick = () => overlay.remove();
    overlay.querySelector('#copy-addr').onclick = () => {
      const inp = document.getElementById('dep-addr');
      inp.select();
      document.execCommand('copy');
      alert('地址已复制');
    };
  }

  // 绑定按钮
  function bindButton() {
    const btn = document.getElementById('deposit-btn');
    if (btn) btn.onclick = openDeposit;
  }

  window.addEventListener('DOMContentLoaded', () => {
    init().then(bindButton);
  });

  return { init, openDeposit };
})();
