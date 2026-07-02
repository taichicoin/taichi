// js/getdepositaddr.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const DEPOSIT_ADDR_API = `${SUPABASE_URL}/functions/v1/get-depositaddr`; // 仅首次生成时调用
  const MAIN_ADDR = '0x1435BC05803D2464B717ef1d7314eD1E46116ae9'; // 已修正，与后端 depositCA 一致
  const ABI = ["function depositAddress(bytes32 userId) view returns (address)"];
  const CHAIN_ID = 97;

  // 多节点 RPC 列表（与 postdeposit 保持一致）
  const RPC_LIST = [
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org',
    'https://rpc.ankr.com/bsc_testnet_chapel'
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

  let ready = false;

  function initEthers() {
    if (typeof ethers === 'undefined' || !ethers.utils) return false;
    ready = true;
    return true;
  }

  let tries = 0;
  const interval = setInterval(() => {
    if (initEthers() || ++tries > 20) clearInterval(interval);
  }, 500);

  // 1. 从 profiles 表读取 deposit_address（带缓存）
  let cachedAddress = null;
  async function readAddressFromDB(uuid) {
    if (cachedAddress) return cachedAddress;

    // 优先使用 supabase 客户端，与 postdeposit.js 保持一致
    if (window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from('profiles')
          .select('deposit_address')
          .eq('id', uuid)
          .single();
        if (error) {
          console.error('supabase 查询 profiles 失败:', error);
          return null;
        }
        const addr = data?.deposit_address || null;
        if (addr) cachedAddress = addr;
        return addr;
      } catch (e) {
        console.error('supabase 客户端读取异常:', e);
        // 继续尝试 fetch 回退
      }
    }

    // 回退：原生 fetch（可能因 token 问题失败，仅作备用）
    try {
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uuid)}&select=deposit_address`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) {
        console.error('fetch profiles 失败，状态码:', resp.status);
        return null;
      }
      const arr = await resp.json();
      const addr = arr?.[0]?.deposit_address || null;
      if (addr) cachedAddress = addr;
      return addr;
    } catch (e) {
      console.error('读取数据库地址失败:', e);
      return null;
    }
  }

  // 2. 本地合约计算地址（带缓存，多节点轮询）
  let cachedComputed = null;
  async function computeAddressLocally(uuid) {
    if (cachedComputed) return cachedComputed;

    let lastError = null;
    for (const rpc of RPC_LIST) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpc);
        // 快速连接测试
        await Promise.race([
          provider.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 3000))
        ]);
        const contract = new ethers.Contract(MAIN_ADDR, ABI, provider);
        const userId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
        const addr = await contract.depositAddress(userId);
        cachedComputed = addr;
        return addr;
      } catch (e) {
        console.warn(`RPC ${rpc} 失败:`, e.message);
        lastError = e;
      }
    }
    throw new Error('所有RPC节点不可用，请稍后重试');
  }

  // 3. 获取充值地址
  async function getDepositAddress(uuid) {
    const dbAddr = await readAddressFromDB(uuid);

    if (dbAddr) {
      // 数据库有，本地验证
      const computed = await computeAddressLocally(uuid);
      if (computed.toLowerCase() !== dbAddr.toLowerCase()) {
        throw new Error('充值地址验证失败，数据库记录与合约计算不一致');
      }
      return dbAddr;
    }

    // 数据库没有，调后端生成（仅首次）
    console.log('首次生成充值地址，调用后端...');
    const resp = await fetch(DEPOSIT_ADDR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uuid: uuid, chain_id: CHAIN_ID })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    // 生成成功后刷新缓存
    cachedAddress = data.address;
    cachedComputed = data.address;
    return data.address;
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
      showErrorModal('系统初始化中，请稍后点击');
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
