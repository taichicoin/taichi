// /js/assetspage/lang.js —— 资产页面独立语言包
(function () {
  const supabase = window.supabase;

  // 资产专属翻译字典
  const translations = {
    loading: { zh: '加载中...', en: 'Loading...' },
    login_fail: { zh: '登录失败，请返回重试', en: 'Login failed, please go back and try again' },
    module_not_loaded: { zh: '资产模块未加载', en: 'Assets module not loaded' },
    page_crash: { zh: '页面崩溃', en: 'Page crashed' },
    assets_title: { zh: '资产', en: 'Assets' },
    deposit: { zh: '充币', en: 'Deposit' },
    withdraw: { zh: '提币', en: 'Withdraw' },
    bill: { zh: '账单', en: 'Bills' },
    history: { zh: '历史记录', en: 'History' },
    network: { zh: '网络', en: 'Network' },
    confirm: { zh: '确认', en: 'Confirm' },
    cancel: { zh: '取消', en: 'Cancel' },
    balance: { zh: '余额', en: 'Balance' },
    no_records: { zh: '暂无记录', en: 'No records' },
    processing: { zh: '处理中...', en: 'Processing...' },
    success: { zh: '成功', en: 'Success' },
    fail: { zh: '失败', en: 'Failed' },
    token: { zh: '代币', en: 'Token' },
    amount: { zh: '数量', en: 'Amount' },
    address: { zh: '地址', en: 'Address' },
    copy: { zh: '复制', en: 'Copy' },
    copied: { zh: '已复制', en: 'Copied' },
    submit_hash: { zh: '提交哈希', en: 'Submit Hash' },
    hash_placeholder: { zh: '请输入交易哈希', en: 'Enter transaction hash' },
    withdraw_address: { zh: '提现地址', en: 'Withdraw Address' },
    withdraw_amount: { zh: '提现数量', en: 'Withdraw Amount' },
    withdraw_all: { zh: '全部提现', en: 'Withdraw All' },
    fee: { zh: '手续费', en: 'Fee' },
    arrive: { zh: '到账', en: 'Arrival' },
    wood: { zh: '木头', en: 'WOOD' },
    stone: { zh: '石头', en: 'STONE' },
    btc: { zh: '比特币', en: 'BTC' },
    deposit_title: { zh: '充值', en: 'Deposit' },
    withdraw_title: { zh: '提现', en: 'Withdraw' },
    bill_title: { zh: '账单', en: 'Bills' },
    history_title: { zh: '历史记录', en: 'History' }
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
