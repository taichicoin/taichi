// js/selfdeposit.js
(function() {
  const SUPABASE_URL = window.YYCardConfig?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.YYCardConfig?.SUPABASE_ANON_KEY;
  const COLLECT_API = `${SUPABASE_URL}/functions/v1/collect`;

  const TOKEN_LIST = [
    {
      symbol: 'TEST',
      address: '0xa8d9bb561dab406a90ca1dcc0589edfbbcac1832',
      name: 'test测试'
    }
  ];

  const RPC_LIST = [
    'https://rpc.ankr.com/bsc_testnet_chapel',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org'
  ];

  let cachedDepositAddress = null;
  let provider = null;

  // 获取 RPC provider（多节点轮询）
  async function getProvider() {
    if (provider) return provider;
    for (const rpc of RPC_LIST) {
      try {
        const p = new ethers.providers.JsonRpcProvider(rpc);
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 4000))
        ]);
        provider = p;
        console.log('✅ 手动上账验证节点已连接:', rpc);
        return provider;
      } catch (e) {
        console.warn('节点不可用:', rpc, e.message);
      }
    }
    throw new Error('无法连接区块链节点，请稍后重试');
  }

  // ★ 从 core_info 表获取充值地址
  async function getUserDepositAddress() {
    if (cachedDepositAddress) return cachedDepositAddress;
    const user = window.YYCardAuth?.currentUser;
    if (!user?.id) throw new Error('请先登录');

    // 优先使用 supabase 客户端
    if (window.supabase) {
      const { data, error } = await window.supabase
        .from('core_info')
        .select('deposit_address')
        .eq('user_id', user.id)
        .single();
      if (error || !data?.deposit_address) throw new Error('未找到充值地址，请先在资产页面点击充币生成');
      cachedDepositAddress = data.deposit_address;
      return cachedDepositAddress;
    }

    // 回退到原生 fetch
    const token = window.YYCardAuth?.currentSession?.access_token || '';
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/core_info?user_id=eq.${encodeURIComponent(user.id)}&select=deposit_address`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!resp.ok) throw new Error('查询核心资料失败');
    const arr = await resp.json();
    if (!arr?.[0]?.deposit_address) throw new Error('未找到充值地址，请先在资产页面点击充币生成');
    cachedDepositAddress = arr[0].deposit_address;
    return cachedDepositAddress;
  }

  // 检查哈希是否已处理过（查 deposit_events）
  async function checkAlreadyProcessed(txHash) {
    try {
      if (window.supabase) {
        const { data, error } = await window.supabase
          .from('deposit_events')
          .select('tx_hash')  // 只查是否存在，不需要 created_at
          .eq('tx_hash', txHash)
          .maybeSingle();
        if (error) return null;
        return data; // 有记录就返回
      }
      const token = window.YYCardAuth?.currentSession?.access_token || '';
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/deposit_events?tx_hash=eq.${encodeURIComponent(txHash)}&select=tx_hash`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) return null;
      const arr = await resp.json();
      return arr?.[0] || null;
    } catch (e) {
      console.warn('查重失败', e);
      return null;
    }
  }

  // 本地链上验证
  async function validateDeposit(tokenAddr, txHash) {
    const p = await getProvider();

    const receipt = await p.getTransactionReceipt(txHash);
    if (!receipt) return { valid: false, error: '交易不存在或未确认' };
    if (receipt.status === 0) return { valid: false, error: '链上交易失败' };

    const depositAddr = await getUserDepositAddress();

    const tokenContract = new ethers.Contract(tokenAddr, [
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ], p);
    const iface = tokenContract.interface;
    let amount = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenAddr.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog(log);
        if (
          parsed.name === "Transfer" &&
          parsed.args.to.toLowerCase() === depositAddr.toLowerCase()
        ) {
          amount = parsed.args.value;
          break;
        }
      } catch (e) {}
    }

    if (!amount || amount.isZero()) {
      return { valid: false, error: '未找到转入你的充值地址的有效记录' };
    }

    return { valid: true, amount };
  }

  // 主弹窗
  function showSelfDepositModal() {
    const old = document.querySelector('.self-deposit-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'self-deposit-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10001;';

    const tokenOptions = TOKEN_LIST.map(t =>
      `<option value="${t.address}">${t.symbol} - ${t.name}</option>`
    ).join('');

    overlay.innerHTML = `
      <div style="background:white;color:#1e293b;max-width:420px;width:90%;padding:24px;border-radius:16px;text-align:left;">
        <h3 style="margin-bottom:16px;font-size:20px;"> 手动上账</h3>
        <label style="font-size:14px;font-weight:600;">选择币种</label>
        <select id="self-token-select" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;">
          ${tokenOptions}
        </select>
        <label style="font-size:14px;font-weight:600;">交易哈希（每行一个，可批量）</label>
        <textarea id="self-txhash-input" placeholder="0x..." rows="4" style="width:100%;padding:10px;margin:8px 0 16px;border-radius:8px;border:1px solid #ccc;font-size:14px;"></textarea>
        <div id="self-result" style="font-size:13px;color:#dc2626;margin-bottom:12px;white-space:pre-wrap;word-break:break-all;"></div>
        <div style="display:flex;gap:10px;">
          <button id="submit-self-btn" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:bold;">提交</button>
          <button id="close-self-btn" style="flex:1;padding:12px;background:#e5e7eb;color:#1e293b;border:none;border-radius:8px;font-weight:bold;">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#close-self-btn').onclick = () => overlay.remove();

    overlay.querySelector('#submit-self-btn').onclick = async () => {
      const token = document.getElementById('self-token-select').value;
      const rawHashes = document.getElementById('self-txhash-input').value;
      const resultDiv = document.getElementById('self-result');
      resultDiv.textContent = '';

      const hashes = rawHashes
        .split('\n')
        .map(h => h.trim())
        .filter(h => h.length === 66 && h.startsWith('0x'));

      if (hashes.length === 0) {
        resultDiv.textContent = '请输入有效的交易哈希（每行一个，0x开头+64位）';
        return;
      }

      const user = window.YYCardAuth?.currentUser;
      if (!user?.id) {
        resultDiv.textContent = '请先登录';
        return;
      }

      let accessToken = '';
      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        accessToken = session?.access_token || '';
      } catch (e) {}

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const hash of hashes) {
        resultDiv.style.color = '#666';
        resultDiv.textContent = `正在检查记录... (${results.length + 1}/${hashes.length})`;

        try {
          // ★ 先查是否已处理
          const already = await checkAlreadyProcessed(hash);
          if (already) {
            // 简单提示：已处理
            results.push(`⚠️ ${hash.slice(0, 10)}... 该充值已处理，请勿重复提交`);
            failCount++;
            continue;
          }

          resultDiv.textContent = `正在进行链上验证... (${results.length + 1}/${hashes.length})`;
          const validation = await validateDeposit(token, hash);
          if (!validation.valid) {
            failCount++;
            results.push(`❌ ${hash.slice(0, 10)}... ${validation.error}`);
            continue;
          }

          resultDiv.textContent = `验证通过，提交中... (${results.length + 1}/${hashes.length})`;
          const res = await fetch(COLLECT_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ user_uuid: user.id, token: token, tx_hash: hash })
          });

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (res.ok) {
              successCount++;
              results.push(`✅ ${hash.slice(0, 10)}... 上账成功`);
            } else {
              failCount++;
              results.push(`❌ ${hash.slice(0, 10)}... ${json.error || '上账失败'}`);
            }
          } else {
            const text = await res.text();
            if (res.ok) {
              successCount++;
              results.push(`✅ ${hash.slice(0, 10)}... 上账成功`);
            } else {
              failCount++;
              results.push(`❌ ${hash.slice(0, 10)}... 后端: ${text}`);
            }
          }
        } catch (e) {
          failCount++;
          results.push(`❌ ${hash.slice(0, 10)}... ${e.message}`);
        }
      }

      resultDiv.style.color = failCount === 0 ? '#16a34a' : '#dc2626';
      resultDiv.textContent = `处理完成：成功 ${successCount} 笔，失败 ${failCount} 笔\n` + results.join('\n');

      if (successCount > 0) {
        setTimeout(() => {
          overlay.remove();
          if (window.refreshAssets) window.refreshAssets();
        }, 2000);
      }
    };
  }

  window.showSelfDeposit = showSelfDepositModal;
})();
