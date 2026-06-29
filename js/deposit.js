// js/deposit.js
(function() {
  // ========== 配置 ==========
  const DEPOSIT_MANAGER_ADDR = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const ABI = ["function depositAddress(bytes32 userId) view returns (address)"];
  const RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545'; // BSC Testnet

  let provider, contract, ready = false;

  // ========== 注入样式 ==========
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .deposit-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      }
      .deposit-modal {
        background: #1e293b; color: #e2e8f0; border-radius: 12px;
        padding: 20px; width: 90%; max-width: 400px; text-align: center;
      }
      .deposit-modal h3 { margin-bottom: 10px; }
      .deposit-modal input {
        width: 100%; padding: 8px; margin: 10px 0; border-radius: 6px;
        background: #0f172a; color: #38bdf8; border: 1px solid #334155;
        font-size: 14px; text-align: center; user-select: all;
      }
      .deposit-modal button {
        margin: 5px; padding: 8px 16px; border: none; border-radius: 6px;
        background: #3b82f6; color: white; font-weight: bold; cursor: pointer;
      }
      .deposit-modal .close-deposit { background: #475569; }
      .deposit-note { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  // ========== 初始化合约 ==========
  function init() {
    if (typeof ethers === 'undefined' || !ethers.providers) {
      console.warn('⏳ ethers 未加载');
      return false;
    }
    try {
      provider = new ethers.providers.JsonRpcProvider(RPC);
      contract = new ethers.Contract(DEPOSIT_MANAGER_ADDR, ABI, provider);
      ready = true;
      console.log('✅ 充值模块就绪');
      return true;
    } catch (e) {
      console.error('充值初始化失败:', e);
      return false;
    }
  }

  // 轮询直到 ethers 可用
  let tries = 0;
  const interval = setInterval(() => {
    if (init() || ++tries > 20) {
      clearInterval(interval);
    }
  }, 500);

  // ========== 获取充值地址 ==========
  async function getDepositAddress(userUUID) {
    if (!ready || !contract) throw new Error('充值模块未就绪');
    const userIdBytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(userUUID));
    return await contract.depositAddress(userIdBytes);
  }

  // ========== 弹窗 ==========
  function showModal(addr) {
    const old = document.querySelector('.deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'deposit-overlay';
    overlay.innerHTML = `
      <div class="deposit-modal">
        <h3>💰 充值 (BSC 测试网)</h3>
        <p>向以下地址转入任意代币，系统自动归集并增加余额</p>
        <input type="text" value="${addr}" readonly id="dep-addr-input">
        <button id="copy-addr-btn">📋 复制地址</button>
        <p class="deposit-note">支持 BNB、USDT 等 BSC 测试网代币</p>
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

  // ========== 绑定按钮（模块自己找按钮） ==========
  function bindButton() {
    const btn = document.getElementById('deposit-btn');
    if (!btn) {
      // 如果按钮还没渲染，等 DOM 加载完再试
      document.addEventListener('DOMContentLoaded', () => {
        const retryBtn = document.getElementById('deposit-btn');
        if (retryBtn) retryBtn.onclick = openPopup;
      });
      return;
    }
    btn.onclick = openPopup;
  }

  async function openPopup() {
    const user = window.YYCardAuth?.currentUser;
    if (!user || !user.id) {
      alert('请先登录');
      return;
    }
    if (!ready) {
      alert('充值功能初始化中，请稍候');
      return;
    }
    try {
      const addr = await getDepositAddress(user.id);
      showModal(addr);
    } catch (err) {
      console.error(err);
      alert('获取充值地址失败，请刷新后重试');
    }
  }

  // 启动绑定
  bindButton();
})();
