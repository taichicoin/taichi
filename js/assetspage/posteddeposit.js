// js/assetspage/postdeposit.js（支持中英双语）
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

  const L = () => window.YYCardAssetsLang;
  function t(key, fallback) {
    const lang = L();
    return lang?.t ? lang.t(key) : (fallback || key);
  }

  const RPC_LIST = [
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org'
  ];

  const SUPPORTED_TOKENS = [
    '0x6C29DA96F77297192d51eE6f4742e3c3EbC0e1de'
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

  // 初始化 provider
  const providerReadyPromise = (async function initProvider() {
    for (const rpc of RPC_LIST) {
      try {
        const p = new ethers.providers.JsonRpcProvider(rpc);
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(t('timeout', '超时'))), 3000))
        ]);
        provider = p;
        window.__depositWatchStatus.ready = true;
        console.log(t('watch_ready', '监听模块就绪，使用节点:'), rpc);
        return;
      } catch (e) {
        console.warn(t('node_unavailable', '节点不可用:'), rpc, e.message);
      }
    }
    window.__depositWatchStatus.error = t('all_nodes_unavailable', '所有RPC节点不可用');
    throw new Error(window.__depositWatchStatus.error);
  })();

  async function getDepositAddressFromCoreInfo(uuid) {
    if (window.supabase) {
      const { data, error } = await window.supabase
        .from('core_info')
        .select('deposit_address')
        .eq('user_id', uuid)
        .single();
      if (error) {
        console.error(t('query_core_failed', '查询 core_info 失败:'), error);
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
      if (!resp.ok) throw new Error(t('network_error', '请求失败') + ': ' + resp.status);
      const arr = await resp.json();
      return arr?.[0]?.deposit_address || null;
    } catch (e) {
      console.error(t('read_deposit_addr_failed', '读取充值地址失败:'), e);
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
        console.log(t('deposit_submitted', '✅ 充值已提交后端:'), txHash);
        if (window.refreshAssets) setTimeout(() => window.refreshAssets(), 2000);
      } else {
        console.error(t('backend_process_failed', '后端处理失败:'), await res.text());
      }
    } catch (err) {
      console.error(t('notify_backend_failed', '通知后端失败:'), err);
    }
  }

  function watchToken(tokenAddr) {
    if (!provider) return;
    const tokenContract = new ethers.Contract(tokenAddr, [
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ], provider);

    const filter = tokenContract.filters.Transfer(null, currentDepositAddr);

    tokenContract.on(filter, async (from, to, value, event) => {
      console.log(t('deposit_detected', '🔔 检测到充值:'), event.transactionHash);
      try {
        await provider.waitForTransaction(event.transactionHash, CONFIRM_BLOCKS);
        await notifyBackend(currentUUID, tokenAddr, event.transactionHash);
      } catch (e) {
        console.warn(t('process_deposit_event_failed', '处理充值事件失败:'), e.message);
      }
    });

    (async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(currentBlock - HISTORY_BLOCKS, 0);
        const events = await tokenContract.queryFilter(filter, fromBlock, currentBlock);
        console.log(t('found_historical_deposits', '📜 找到 {n} 笔历史充值').replace('{n}', events.length));
        for (const evt of events) {
          const { transactionHash } = evt;
          const receipt = await provider.getTransactionReceipt(transactionHash);
          if (receipt && receipt.confirmations >= CONFIRM_BLOCKS) {
            await notifyBackend(currentUUID, tokenAddr, transactionHash);
          }
        }
        console.log(t('historical_scan_complete', '✅ 回溯处理完成'));
      } catch (e) {
        console.warn(t('historical_scan_failed', '回溯历史事件失败:'), e.message);
      }
    })();
  }

  async function start(uuid) {
    try {
      await providerReadyPromise;
    } catch (e) {
      window.__depositWatchStatus.error = e.message;
      console.error(t('start_watch_failed', '启动监听失败:'), e.message);
      return;
    }

    if (watching) {
      console.log(t('already_watching', '已在监听中'));
      return;
    }
    currentUUID = uuid;
    try {
      let addr = await getDepositAddressFromCoreInfo(uuid);
      if (!addr) {
        window.__depositWatchStatus.error = t('no_deposit_address', '未找到充值地址，请先在资产页面点击充币生成');
        console.error(window.__depositWatchStatus.error);
        return;
      }
      currentDepositAddr = addr;
      window.__depositWatchStatus.address = addr;
      window.__depositWatchStatus.watching = true;
      console.log(t('deposit_address_label', '充值地址:'), addr);
      SUPPORTED_TOKENS.forEach(watchToken);
      watching = true;
    } catch (e) {
      window.__depositWatchStatus.error = e.message;
      console.error(t('start_watch_failed', '启动监听失败:'), e);
    }
  }

  window.YYCardPostDeposit = {
    start: start,
    isReady: () => window.__depositWatchStatus.ready
  };
})();
