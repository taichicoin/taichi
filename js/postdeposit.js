// js/postdeposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;

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

  function init() {
    if (typeof ethers === 'undefined' || !ethers.providers) return false;
    try {
      provider = new ethers.providers.JsonRpcProvider(
        window.YYCardConfig?.RPC_URL || 'https://bsc-testnet.publicnode.com'
      );
      ready = true;
      console.log('✅ 充值监听模块就绪');
      return true;
    } catch (e) {
      console.error('监听模块初始化失败:', e);
      return false;
    }
  }

  let tries = 0;
  const interval = setInterval(() => {
    if (init() || ++tries > 20) clearInterval(interval);
  }, 500);

  // ★ 直接从 profiles 表读取充值地址，不调后端
  async function getDepositAddressFromProfile(uuid) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uuid)}&select=deposit_address`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${window.YYCardAuth?.currentSession?.access_token || ''}`
        }
      }
    );
    if (!resp.ok) throw new Error('查询 profiles 失败');
    const data = await resp.json();
    if (!data || data.length === 0) return null;
    return data[0].deposit_address || null;
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
        if (window.YYCardProfileUI?.update) {
          setTimeout(() => window.YYCardProfileUI.update(), 2000);
        }
        if (window.refreshAssets) {
          setTimeout(() => window.refreshAssets(), 2000);
        }
      } else {
        console.error('后端处理失败:', await res.text());
      }
    } catch (err) {
      console.error('通知后端失败:', err);
    }
  }

  function watchToken(tokenAddr) {
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

    // 回溯历史
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
    if (!ready) {
      console.warn('监听模块未就绪');
      return;
    }
    if (watching) {
      console.log('已在监听中');
      return;
    }
    currentUUID = uuid;
    try {
      // ★ 直接从 profiles 表读取充值地址
      const addr = await getDepositAddressFromProfile(uuid);
      if (!addr) {
        console.warn('profiles 中无充值地址，无法启动监听。请先在资产页点击"充币"生成地址。');
        return;
      }
      currentDepositAddr = addr;
      console.log('充值地址（从表读取）:', currentDepositAddr);
      SUPPORTED_TOKENS.forEach(watchToken);
      watching = true;
    } catch (e) {
      console.error('启动监听失败:', e);
    }
  }

  window.YYCardPostDeposit = {
    start: start,
    isReady: () => ready
  };
})();
