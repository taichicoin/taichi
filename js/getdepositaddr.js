// js/getdepositaddr.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const DEPOSIT_ADDR_API = `${SUPABASE_URL}/functions/v1/get-depositaddr`;
  const CHAIN_ID = 97;

  // 主合约地址和 ABI（用于本地计算验证）
  const MAIN_ADDR = '0x0ACd8d4977f7aE68BCa6B19702aD808D6391F24b';
  const MAIN_ABI = ["function depositAddress(bytes32 userId) view returns (address)"];

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

  let provider = null;
  let ready = false;
  let initError = '';

  // 初始化 ethers 并连接 RPC
  async function initProvider() {
    if (typeof ethers === 'undefined' || !ethers.utils) {
      initError = 'ethers 库未加载，请刷新页面';
      return false;
    }
    // 尝试连接 RPC 节点
    const rpcList = [
      'https://rpc.ankr.com/bsc_testnet_chapel',
      'https://data-seed-prebsc-1-s1.binance.org:8545',
      'https://bsc-testnet-rpc.publicnode.com'
    ];
    for (const rpc of rpcList) {
      try {
        const p = new ethers.providers.JsonRpcProvider(rpc);
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 4000))
        ]);
        provider = p;
        ready = true;
        console.log('✅ 充值模块就绪，使用节点:', rpc);
        return true;
      } catch (e) {
        console.warn('节点不可用:', rpc, e.message);
      }
    }
    initError = '无法连接区块链节点，请稍后重试';
    return false;
  }

  // 启动时自动初始化
  initProvider();

  // ★ 从 profiles 表读取 deposit_address
  async function getDepositAddressFromProfile(uuid) {
    const token = window.YYCardAuth?.currentSession?.access_token || '';
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uuid)}&select=deposit_address`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!resp.ok) return null;
    const arr = await resp.json();
    return arr?.[0]?.deposit_address || null;
  }

  // ★ 本地用合约计算充值地址
  async function computeAddressLocally(uuid) {
    if (!provider) throw new Error('RPC 未连接');
    const contract = new ethers.Contract(MAIN_ADDR, MAIN_ABI, provider);
    const userId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
    return await contract.depositAddress(userId);
  }

  // 获取充值地址（优先从数据库读，本地计算验证，没有再调后端）
  async function getDepositAddress(uuid) {
    // 1. 从数据库读取
    let dbAddr = await getDepositAddressFromProfile(uuid);

    if (dbAddr) {
      // 2. 数据库有，本地计算验证
      const computed = await computeAddressLocally(uuid);
      if (computed.toLowerCase() !== dbAddr.toLowerCase()) {
        throw new Error('数据库地址验证失败，存在安全风险！');
      }
      // 验证通过，直接使用数据库地址
      return dbAddr;
    }

    // 3. 数据库没有，首次生成（调用后端，只会这一次）
    console.log('首次生成充值地址...');
    const resp = await fetch(DEPOSIT_ADDR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uuid: uuid, chain_id: CHAIN_ID })
    });
    const rawText = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new Error(`后端返回错误 (${resp.status}): ${rawText || '(空响应)'}`);
    }
    let data;
    try { data = JSON.parse(rawText); } catch (e) {
      throw new Error('后端返回无效 JSON: ' + rawText.slice(0, 200));
    }
    if (data.error) throw new Error(data.error);
    // 后端已写入数据库，下次直接从数据库读
    return data.address;
  }

  // 正常弹窗
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

  // 错误弹窗
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

  // 对外入口
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
      const addr = await getDepositAddress(user.id);
      showModal(addr);
    } catch (e) {
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
