// /js/assetspage/lang.js —— 资产页面独立语言包（完整版）
(function () {
  const supabase = window.supabase;

  const translations = {
    // 通用
    loading: { zh: '加载中...', en: 'Loading...' },
    login_fail: { zh: '登录失败，请返回重试', en: 'Login failed, please go back and try again' },
    module_not_loaded: { zh: '资产模块未加载（assets.js 缺失）', en: 'Assets module not loaded (assets.js missing)' },
    page_crash: { zh: '页面崩溃', en: 'Page crashed' },
    please_login: { zh: '请先登录', en: 'Please login first' },
    network_error: { zh: '网络错误', en: 'Network error' },
    network_timeout: { zh: '请求超时，请检查网络后重试', en: 'Request timeout, please check network and retry' },
    render_error: { zh: '渲染异常', en: 'Render exception' },
    unknown_error: { zh: '未知错误', en: 'Unknown error' },
    timeout: { zh: '超时', en: 'Timeout' },
    cancel: { zh: '取消', en: 'Cancel' },
    copy: { zh: '复制', en: 'Copy' },
    copied: { zh: '已复制', en: 'Copied' },
    view: { zh: '查看', en: 'View' },
    to: { zh: '至', en: 'to' },
    submit: { zh: '提交', en: 'Submit' },
    processing: { zh: '处理中...', en: 'Processing...' },
    success: { zh: '成功', en: 'Success' },
    fail: { zh: '失败', en: 'Failed' },
    amount: { zh: '数量', en: 'Amount' },
    token: { zh: '币种', en: 'Token' },
    balance_load_error: { zh: '余额加载失败', en: 'Balance load failed' },

    // 资产页主界面
    assets_title: { zh: '资产', en: 'Assets' },
    deposit: { zh: '充币', en: 'Deposit' },
    withdraw: { zh: '提币', en: 'Withdraw' },
    self_deposit: { zh: '手动上账', en: 'Manual Deposit' },
    bill: { zh: '账单', en: 'Bills' },

    // 监听状态
    watch_active: { zh: '自动监听已开启', en: 'Auto-watch active' },
    watch_inactive: { zh: '监听未启动', en: 'Watch inactive' },
    watch_init: { zh: '监听初始化中...', en: 'Watch initializing...' },

    // 账单模块 (billviews.js)
    no_records: { zh: '暂无记录', en: 'No records' },
    bill_title: { zh: '历史账单', en: 'Transaction History' },
    auth_failed: { zh: '无法获取认证信息，请重新登录', en: 'Authentication failed, please login again' },
    load_failed: { zh: '加载失败', en: 'Load failed' },

    // 手动上账模块 (selfdeposit.js)
    self_deposit_title: { zh: '手动上账', en: 'Manual Deposit' },
    select_token: { zh: '选择币种', en: 'Select Token' },
    select_token_placeholder: { zh: '请选择币种', en: 'Select token' },
    tx_hash_label: { zh: '交易哈希（每行一个，可批量）', en: 'Transaction Hash (one per line, supports batch)' },
    invalid_hash: { zh: '请输入有效的交易哈希（每行一个，0x开头+64位）', en: 'Please enter valid transaction hash (one per line, starts with 0x + 64 chars)' },
    checking_records: { zh: '正在检查记录...', en: 'Checking records...' },
    already_processed: { zh: '该充值已处理，请勿重复提交', en: 'This deposit has already been processed, do not submit again' },
    validating_onchain: { zh: '正在进行链上验证...', en: 'Validating on-chain...' },
    submitting: { zh: '验证通过，提交中...', en: 'Verification passed, submitting...' },
    deposit_success: { zh: '上账成功', en: 'Deposit successful' },
    deposit_failed: { zh: '上账失败', en: 'Deposit failed' },
    backend: { zh: '后端', en: 'Backend' },
    process_complete: { zh: '处理完成', en: 'Processing complete' },
    success_count: { zh: '成功', en: 'Success' },
    fail_count: { zh: '失败', en: 'Failed' },
    count_unit: { zh: '笔', en: '' },
    tx_not_found: { zh: '交易不存在或未确认', en: 'Transaction not found or unconfirmed' },
    tx_failed: { zh: '链上交易失败', en: 'On-chain transaction failed' },
    no_transfer_to_your_address: { zh: '未找到转入你的充值地址的有效记录', en: 'No valid transfer to your deposit address found' },
    no_deposit_address: { zh: '未找到充值地址，请先在资产页面点击充币生成', en: 'Deposit address not found, please generate one in assets page first' },
    query_core_failed: { zh: '查询核心资料失败', en: 'Failed to query core info' },
    node_connected: { zh: '手动上账验证节点已连接', en: 'Manual deposit verification node connected' },
    node_unavailable: { zh: '节点不可用', en: 'Node unavailable' },
    no_node: { zh: '无法连接区块链节点，请稍后重试', en: 'Unable to connect to blockchain node, please try later' },
    check_duplicate_failed: { zh: '查重失败', en: 'Duplicate check failed' },

    // 提现模块 (withdraw.js)
    withdraw_title: { zh: '提币', en: 'Withdraw' },
    min_withdraw_hint: { zh: '最低提现金额 {min} {symbol}（服务费 {fee} + 最低到账 {receive}）', en: 'Minimum withdrawal {min} {symbol} (fee {fee} + min receive {receive})' },
    withdraw_address: { zh: '提现地址', en: 'Withdraw Address' },
    available: { zh: '可用', en: 'Available' },
    max: { zh: '最大', en: 'Max' },
    fee_label: { zh: '服务费', en: 'Fee' },
    estimate_arrival: { zh: '预计到账', en: 'Estimated Arrival' },
    withdraw_btn: { zh: '提现', en: 'Withdraw' },
    fill_all_fields: { zh: '请填写完整信息', en: 'Please fill in all fields' },
    invalid_address: { zh: '无效的提现地址', en: 'Invalid withdrawal address' },
    unsupported_token: { zh: '不支持的币种', en: 'Unsupported token' },
    invalid_amount: { zh: '无效的数量', en: 'Invalid amount' },
    withdraw_success: { zh: '提现成功！实际到账: {actual} TEST，交易哈希: {tx}', en: 'Withdrawal successful! Actual amount: {actual} TEST, tx hash: {tx}' },
    withdraw_fail: { zh: '提现失败: {error}', en: 'Withdrawal failed: {error}' },
    query_balance_failed: { zh: '查询余额失败', en: 'Balance query failed' },

    // 充值监听模块 (postdeposit.js)
    watch_ready: { zh: '监听模块就绪，使用节点:', en: 'Watch module ready, using node:' },
    all_nodes_unavailable: { zh: '所有RPC节点不可用', en: 'All RPC nodes unavailable' },
    read_deposit_addr_failed: { zh: '读取充值地址失败', en: 'Failed to read deposit address' },
    deposit_submitted: { zh: '充值已提交后端', en: 'Deposit submitted to backend' },
    backend_process_failed: { zh: '后端处理失败', en: 'Backend processing failed' },
    notify_backend_failed: { zh: '通知后端失败', en: 'Failed to notify backend' },
    deposit_detected: { zh: '🔔 检测到充值', en: '🔔 Deposit detected' },
    process_deposit_event_failed: { zh: '处理充值事件失败', en: 'Failed to process deposit event' },
    found_historical_deposits: { zh: '📜 找到 {n} 笔历史充值', en: '📜 Found {n} historical deposits' },
    historical_scan_complete: { zh: '✅ 回溯处理完成', en: '✅ Historical scan completed' },
    historical_scan_failed: { zh: '回溯历史事件失败', en: 'Historical event scan failed' },
    start_watch_failed: { zh: '启动监听失败', en: 'Failed to start watch' },
    already_watching: { zh: '已在监听中', en: 'Already watching' },
    deposit_address_label: { zh: '充值地址', en: 'Deposit address' }
  };

  let currentLang = 'zh';

  function t(key, replacements) {
    const trans = translations[key];
    if (!trans) return key;
    let text = trans[currentLang] || trans['en'] || key;
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  }

  async function setLang(lang) {
    if (lang === currentLang) return;
    currentLang = lang;
    localStorage.setItem('assets_lang', lang);
    try {
      const user = window.YYCardAuth?.currentUser;
      if (user && supabase) {
        await supabase.from('profiles').update({ language: lang }).eq('id', user.id);
        if (window.YYCardAuth.currentProfile) {
          window.YYCardAuth.currentProfile.language = lang;
        }
      }
    } catch (e) {
      console.warn('语言写入数据库失败:', e);
    }
    if (window.refreshAssets) {
      await window.refreshAssets();
    }
  }

  function getLang() {
    return currentLang;
  }

  async function init() {
    const cached = localStorage.getItem('assets_lang');
    if (cached === 'zh' || cached === 'en') currentLang = cached;
    try {
      const profile = window.YYCardAuth?.currentProfile;
      if (profile && profile.language) {
        currentLang = profile.language;
        localStorage.setItem('assets_lang', currentLang);
      }
    } catch (e) {
      console.warn('读取语言设置失败:', e);
    }
    return currentLang;
  }

  window.YYCardAssetsLang = { t, setLang, getLang, init };
})();
