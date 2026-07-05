// js/getdepositaddr.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const DEPOSIT_ADDR_API = `${SUPABASE_URL}/functions/v1/get-depositaddr`; // 仅首次生成调用
  const MAIN_ADDR = '0x1435BC05803D2464B717ef1d7314eD1E46116ae9';
  const ABI = ["function depositAddress(bytes32 userId) view returns (address)"];
  const CHAIN_ID = 97;

  // 多节点 RPC 列表
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
    .deposit-modal { background:#ffffff; color:#1e293b; border-radius:12px; padding:20px; width:90%; max-width:400px; text-align:center; box-shadow:0 0 20px rgba(0,0,0,0.3); }
    .deposit-modal h3 { margin-bottom:10px; }
    .deposit-modal input { width:100%; padding:8px; margin:10px 0; border-radius:6px; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; font-size:14px; text-align:center; user-select:all; }
    .deposit-modal button { margin:5px; padding:8px 16px; border:none; border-radius:6px; background:#3b82f6; color:white; font-weight:bold; cursor:pointer; }
    .deposit-modal .close-deposit { background:#94a3b8; color:#fff; }
    .deposit-note { font-size:12px; color:#475569; margin-top:8px; }
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

  // ★ 从 core_info 表读取邮箱和充值地址
  async function getCoreInfo(uuid) {
    if (window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from('core_info')
          .select('email, deposit_address')
          .eq('user_id', uuid)
          .single();
        if (error) return null;
        return data; // { email, deposit_address } or null
      } catch (e) {
        console.error('supabase 查询 core_info 异常:', e);
      }
    }

    // 回退 fetch
    try {
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/core_info?user_id=eq.${encodeURIComponent(uuid)}&select=email,deposit_address`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) return null;
      const arr = await resp.json();
      return arr?.[0] || null;
    } catch (e) {
      console.error('fetch core_info 失败:', e);
      return null;
    }
  }

  // ★ 本地合约计算地址（用邮箱）
  async function computeAddressByEmail(email) {
    let lastError = null;
    for (const rpc of RPC_LIST) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpc);
        await Promise.race([
          provider.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 3000))
        ]);
        const contract = new ethers.Contract(MAIN_ADDR, ABI, provider);
        const userId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(email));
        return await contract.depositAddress(userId);
      } catch (e) {
        console.warn(`RPC ${rpc} 失败:`, e.message);
        lastError = e;
      }
    }
    throw new Error('所有RPC节点不可用，请稍后重试');
  }

  // 获取充值地址
  async function getDepositAddress(uuid) {
    // 1. 从 core_info 读取
    let coreInfo = await getCoreInfo(uuid);

    // 2. 如果数据库没有，调用后端生成（后端会写入 core_info）
    if (!coreInfo || !coreInfo.email || !coreInfo.deposit_address) {
      console.log('首次生成充值地址，调用后端...');
      const resp = await fetch(DEPOSIT_ADDR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: uuid, chain_id: CHAIN_ID })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      // 重新从数据库读取（后端已经写入）
      coreInfo = await getCoreInfo(uuid);
      if (!coreInfo || !coreInfo.email || !coreInfo.deposit_address) {
        throw new Error('后端生成成功但数据库未更新');
      }
    }

    // 3. 本地验证：用邮箱计算地址，与数据库中的地址对比
    const computedAddr = await computeAddressByEmail(coreInfo.email);
    if (computedAddr.toLowerCase() !== coreInfo.deposit_address.toLowerCase()) {
      throw new Error('充值地址验证失败，数据库记录与合约计算不一致');
    }

    // 4. 验证通过，返回可信地址
    return coreInfo.deposit_address;
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
