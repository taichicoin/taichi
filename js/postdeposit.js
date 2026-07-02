// js/postdeposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  // 备用 RPC 节点列表
  const RPC_LIST = [
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org'
  ];

  // 支持的代币
  const SUPPORTED_TOKENS = [
    '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832'
  ];

  // 后端归集接口
  const COLLECT_API = `${SUPABASE_URL}/functions/v1/collect`;

  const CONFIRM_BLOCKS = 3;
  const HISTORY_BLOCKS = 5000;

  let provider;
  let ready = false;
  let currentUUID = null;
  let currentDepositAddr = null;
  let watching = false;

  // 监听状态全局标记
  window.__depositWatchStatus = {
    ready: false,
    watching: false,
    address: null,
    error: null
  };

  // 初始化 ethers，尝试多个 RPC
  async function initProvider() {
    for (const rpc of RPC_LIST) {
      try {
        const p = new ethers.providers.JsonRpcProvider(rpc);
        // 测试连接
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 3000))
        ]);
        provider = p;
        ready = true;
        window.__depositWatchStatus.ready = true;
        console.log('✅ 监听模块就绪，使用节点:', rpc);
        return;
      } catch (e) {
        console.warn('节点不可用:', rpc, e.message);
      }
    }
    window.__depositWatchStatus.error = '所有RPC节点不可用';
    console.error('❌ 所有RPC节点不可用');
  }

  // 启动时自动初始化
  initProvider();

  // 从 profiles 表读地址（使用 supabase 客户端，自动带 token）
  async function getDepositAddressFromProfile(uuid) {
    // 优先用已存在的 supabase 客户端
    if (window.supabase) {
      const { data, error } = await window.supabase
        .from('profiles')
        .select('deposit_address')
        .eq('id', uuid)
        .single();
      if (error) {
        console.error('查询 profiles 失败:', error);
        return null;
      }
      return data?.deposit_address || null;
    }
    // 回退到原生 fetch
    try {
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uuid)}&select=deposit_address`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) throw new Error('请求失败: ' + resp.status);
      const arr = await resp.json();
      return arr?.[0]?.deposit_address || null;
    } catch (e) {
      console.error('读取充值地址失败:', e);
      return null;
    }
  }

  // 通知后端
  async function notifyBackend(uuid, token, txHash) {
    try {
      const res = await fetch(COLLECT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uuid: uuid, token: token, tx_hash: txHash })
      });
      if (res.ok) {
        console.log('✅ 充值已提交后端:', txHash);
        if (window.refreshAssets) setTimeout(() => window.refreshAssets(), 2000);
      } else {
        console.error('后端处理失败:', await res.text());
      }
    } catch (err) {
      console.error('通知后端失败:', err);
    }
  }

  // 监听单个代币
  function watchToken(tokenAddr) {
    if (!provider) return;
    const tokenContract = new ethers.Contract(tokenAddr, [
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ], provider);

    const filter = tokenContract.filters.Transfer(null, currentDepositAddr);

    // 实时监听
    tokenContract.on(filter, async (from, to, value, event) => {
      console.log(`🔔 检测到充值: ${event.transactionHash}`);
      try {
        await provider.waitForTransaction(event.transactionHash, CONFIRM_BLOCKS);
        await notifyBackend(currentUUID, tokenAddr, event.transactionHash);
      } catch (e) {
        console.warn('处理充值事件失败:', e.message);
      }
    });

    // 回溯历史（补离线期间的充值）
    (async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(currentBlock - HISTORY_BLOCKS, 0);
        const events = await tokenContract.queryFilter(filter, fromBlock, currentBlock);
        console.log(`📜 找到 ${events.length} 笔历史充值`);
        for (const evt of events) {
          const { transactionHash } = evt;
          const receipt = await provider.getTransactionReceipt(transactionHash);
          if (receipt && receipt.confirmations >= CONFIRM_BLOCKS) {
            await notifyBackend(currentUUID, tokenAddr, transactionHash);
          }
        }
        console.log(`✅ 回溯处理完成`);
      } catch (e) {
        console.warn('回溯历史事件失败:', e.message);
      }
    })();
  }

  // 启动监听（外部调用）
  async function start(uuid) {
    if (!ready) {
      console.warn('监听模块未就绪');
      window.__depositWatchStatus.error = 'RPC未就绪';
      return;
    }
    if (watching) {
      console.log('已在监听中');
      return;
    }
    currentUUID = uuid;
    try {
      let addr = await getDepositAddressFromProfile(uuid);
      if (!addr) {
        // 没有地址就不监听，报错退出
        window.__depositWatchStatus.error = '未找到充值地址，请先点击充币生成';
        console.error('启动监听失败：数据库中无充值地址');
        return;
      }
      currentDepositAddr = addr;
      window.__depositWatchStatus.address = addr;
      window.__depositWatchStatus.watching = true;
      console.log('充值地址:', addr);
      SUPPORTED_TOKENS.forEach(watchToken);
      watching = true;
    } catch (e) {
      window.__depositWatchStatus.error = e.message;
      console.error('启动监听失败:', e);
    }
  }

  // 暴露接口
  window.YYCardPostDeposit = {
    start: start,
    isReady: () => ready
  };
})();
