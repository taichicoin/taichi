// js/postdeposit.js
(function() {
  const MAIN_CONTRACT = '0xf77c35D43CE4Cbc7165a0cB37566a15e60404942';
  const DEPOSIT_MANAGER_ABI = [
    "function depositAddress(bytes32 userId) view returns (address)"
  ];

  // 支持的代币（小写）
  const SUPPORTED_TOKENS = [
    '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832' // 测试币
  ];

  // 后端归集接口（Supabase Edge Function 地址）
  const COLLECT_API = 'https://kvflbfdqyehtlfmigaxa.supabase.co/functions/v1/collect';

  const CONFIRM_BLOCKS = 3;
  const HISTORY_BLOCKS = 1200; // 回溯约 1 小时

  let provider, contract;
  let ready = false;
  let currentUUID = null;
  let currentDepositAddr = null;
  let watching = false;

  // 初始化 ethers
  function init() {
    if (typeof ethers === 'undefined' || !ethers.providers) return false;
    try {
      provider = new ethers.providers.JsonRpcProvider(
        window.YYCardConfig?.RPC_URL || 'https://bsc-testnet.publicnode.com'
      );
      contract = new ethers.Contract(MAIN_CONTRACT, DEPOSIT_MANAGER_ABI, provider);
      ready = true;
      console.log('✅ 充值监听模块就绪');
      return true;
    } catch (e) {
      console.error('监听模块初始化失败:', e);
      return false;
    }
  }

  // 轮询直到 ethers 加载
  let tries = 0;
  const interval = setInterval(() => {
    if (init() || ++tries > 20) clearInterval(interval);
  }, 500);

  // 计算充值地址
  async function getDepositAddress(uuid) {
    const userIdBytes = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
    return await contract.depositAddress(userIdBytes);
  }

  // 通知后端归集并记账
  async function notifyBackend(uuid, token, amountWei, txHash) {
    try {
      const res = await fetch(COLLECT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_uuid: uuid,
          token: token,
          amount: amountWei.toString(),
          tx_hash: txHash
        })
      });
      if (res.ok) {
        console.log('✅ 充值已提交后端:', txHash);
        // 刷新余额显示
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

  // 监听单个代币
  function watchToken(tokenAddr) {
    const tokenContract = new ethers.Contract(tokenAddr, [
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ], provider);

    const filter = tokenContract.filters.Transfer(null, currentDepositAddr);
    
    // 实时监听
    tokenContract.on(filter, async (from, to, value, event) => {
      console.log(`🔔 检测到充值: ${event.transactionHash}, 金额: ${ethers.utils.formatUnits(value, 18)}`);
      try {
        await provider.waitForTransaction(event.transactionHash, CONFIRM_BLOCKS);
        await notifyBackend(currentUUID, tokenAddr, value, event.transactionHash);
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
        for (const evt of events) {
          const { transactionHash, args } = evt;
          const receipt = await provider.getTransactionReceipt(transactionHash);
          if (receipt && receipt.confirmations >= CONFIRM_BLOCKS) {
            await notifyBackend(currentUUID, tokenAddr, args.value, transactionHash);
          }
        }
        console.log(`📜 回溯了 ${events.length} 笔历史充值`);
      } catch (e) {
        console.warn('回溯历史事件失败:', e.message);
      }
    })();
  }

  // 启动监听（外部调用）
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
      currentDepositAddr = await getDepositAddress(uuid);
      console.log('充值地址:', currentDepositAddr);
      SUPPORTED_TOKENS.forEach(watchToken);
      watching = true;
    } catch (e) {
      console.error('启动监听失败:', e);
    }
  }

  // 暴露接口
  window.YYCardPostDeposit = {
    start: start,
    isReady: () => ready
  };
})();
