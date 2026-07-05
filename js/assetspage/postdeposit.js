// js/assetspage/postdeposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  const RPC_LIST = [
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org'
  ];

  const SUPPORTED_TOKENS = [
    '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832'
  ];

  const COLLECT_API = `${SUPABASE_URL}/functions/v1/collect`;

  const CONFIRM_BLOCKS = 3;
  const HISTORY_BLOCKS = 5000;

  let provider;
  let currentUUID = null;
  let currentDepositAddr = null;
  let watching = false;

  window.__depositWatchStatus = {
    ready: false,
    watching: false,
    address: null,
    error: null
  };

  // 返回一个 Promise，确保 start 能够等待
  const providerReadyPromise = (async function initProvider() {
    for (const rpc of RPC_LIST) {
      try {
        const p = new ethers.providers.JsonRpcProvider(rpc);
        // 用 3 秒超时快速测试
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 3000))
        ]);
        provider = p;
        window.__depositWatchStatus.ready = true;
        console.log('✅ 监听模块就绪，使用节点:', rpc);
        return; // 成功即返回
      } catch (e) {
        console.warn('节点不可用:', rpc, e.message);
      }
    }
    // 全部失败
    window.__depositWatchStatus.error = '所有RPC节点不可用';
    throw new Error('所有RPC节点不可用');
  })();

  // 读取充值地址（同之前）
  async function getDepositAddressFromCoreInfo(uuid) {
    if (window.supabase) {
      const { data, error } = await window.supabase
        .from('core_info')
        .select('deposit_address')
        .eq('user_id', uuid)
        .single();
      if (error) {
        console.error('查询 core_info 失败:', error);
        return null;
      }
      return data?.deposit_address || null;
    }
    try {
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/core_info?user_id=eq.${encodeURIComponent(uuid)}&select=deposit_address`, {
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

  function watchToken(tokenAddr) {
    if (!provider) return;
    const tokenContract = new ethers.Contract(tokenAddr, [
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ], provider);

    const filter = tokenContract.filters.Transfer(null, currentDepositAddr);

    tokenContract.on(filter, async (from, to, value, event) => {
      console.log(`🔔 检测到充值: ${event.transactionHash}`);
      try {
        await provider.waitForTransaction(event.transactionHash, CONFIRM_BLOCKS);
        await notifyBackend(currentUUID, tokenAddr, event.transactionHash);
      } catch (e) {
        console.warn('处理充值事件失败:', e.message);
      }
    });

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

  async function start(uuid) {
    try {
      // ★ 关键：等待 provider 初始化完成
      await providerReadyPromise;
    } catch (e) {
      window.__depositWatchStatus.error = e.message;
      console.error('启动监听失败:', e.message);
      return;
    }

    if (watching) {
      console.log('已在监听中');
      return;
    }
    currentUUID = uuid;
    try {
      let addr = await getDepositAddressFromCoreInfo(uuid);
      if (!addr) {
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

  window.YYCardPostDeposit = {
    start: start,
    isReady: () => window.__depositWatchStatus.ready
  };
})();
