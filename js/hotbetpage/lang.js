// ==================== 热点预测语言包（支持全局 Lang 和数据库设置） ====================
(function() {
  // 如果全局语言管理器已存在，则向其注册翻译，不再创建独立实例
  if (window.YYCardLang && window.YYCardLang.register) {
    window.YYCardLang.register({
      // ---------- 通用 ----------
      loading:             { zh: '加载中...', en: 'Loading...' },
      no_data:             { zh: '暂无数据', en: 'No data' },
      please_login:        { zh: '请先登录', en: 'Please login first' },
      network_error:       { zh: '网络错误，请稍后重试', en: 'Network error, please try again later.' },
      unknown_error:       { zh: '未知错误', en: 'Unknown error' },

      // ---------- 分类标签 ----------
      cat_worldcup:        { zh: '⚽ 世界杯', en: '⚽ World Cup' },
      cat_crypto:          { zh: '₿ 加密货币', en: '₿ Crypto' },
      cat_esports:         { zh: ' 电竞', en: ' Esports' },
      cat_sports:          { zh: ' 体育', en: ' Sports' },
      category_not_available: { zh: '该分类开发中...', en: 'Category under development...' },

      // ---------- 子导航 ----------
      filter_hot:          { zh: ' 热门', en: ' Hot' },
      filter_live:         { zh: ' 进行中', en: ' Live' },
      filter_upcoming:     { zh: ' 即将到来', en: ' Upcoming' },
      filter_mybets:       { zh: ' 我的预测', en: ' My Bets' },

      // ---------- 事件卡片 ----------
      status_upcoming:     { zh: '即将开始', en: 'Upcoming' },
      status_live:         { zh: '进行中', en: 'Live' },
      status_ended:        { zh: '已结束', en: 'Ended' },
      event_no_options:    { zh: '暂无选项', en: 'No options' },
      event_bet_btn:       { zh: '下注', en: 'Bet' },
      event_bet_end:       { zh: '已截止', en: 'Ended' },
      event_bet_deadline:  { zh: '下注截止', en: 'Bet Deadline' },
      event_base_pool:     { zh: '基础奖池', en: 'Base Pool' },
      event_total_pool:    { zh: '总奖池', en: 'Total Pool' },
      event_match_time:    { zh: '比赛', en: 'Match' },
      no_events:           { zh: '暂无预测事件', en: 'No prediction events' },
      tbd:                 { zh: '待定', en: 'TBD' },
      no_limit:            { zh: '无限制', en: 'No limit' },
      bet_not_started:     { zh: '下注尚未开始', en: 'Betting has not started yet' },
      bet_module_not_loaded: { zh: '下注模块未加载，请刷新页面', en: 'Bet module not loaded, please refresh' },

      // ---------- 倒计时 ----------
      countdown_ended:     { zh: '已截止', en: 'Ended' },
      calculating:         { zh: '计算中...', en: 'Calculating...' },
      day:                 { zh: '天', en: 'd ' },
      hour:                { zh: '时', en: 'h ' },
      minute:              { zh: '分', en: 'm ' },
      second:              { zh: '秒', en: 's ' },

      // ---------- 我的预测 ----------
      mybets_all:          { zh: '全部', en: 'All' },
      mybets_pending:      { zh: '待开奖', en: 'Pending' },
      mybets_won:          { zh: '中奖', en: 'Won' },
      mybets_lost:         { zh: '未中奖', en: 'Lost' },
      mybets_no_records:   { zh: '暂无下注记录', en: 'No bet records' },
      mybets_unknown_event: { zh: '未知事件', en: 'Unknown Event' },
      mybets_unknown_option: { zh: '未知选项', en: 'Unknown Option' },
      mybets_pending_status: { zh: '未开奖', en: 'Pending' },
      mybets_won_status:   { zh: '中奖', en: 'Won' },
      mybets_lost_status:  { zh: '未中奖', en: 'Lost' },
      mybets_selected:     { zh: '选择', en: 'Selected' },
      mybets_bet_amount:   { zh: '下注金额', en: 'Bet Amount' },
      mybets_profit:       { zh: '收益', en: 'Profit' },
      mybets_not_loaded:   { zh: '预测记录模块未加载', en: 'Prediction records module not loaded' },

      // ---------- 下注模块 ----------
      wcbet_please_login:  { zh: '请先登录', en: 'Please login first' },
      wcbet_balance_too_low: { zh: '积分不足，最低下注 {min} WOOD，请先签到', en: 'Insufficient points, minimum bet is {min} WOOD, please check in first' },
      wcbet_prompt:        { zh: '下注金额（余额：{balance} WOOD，最低 {min} WOOD）', en: 'Bet amount (Balance: {balance} WOOD, min {min} WOOD)' },
      wcbet_min_bet:       { zh: '最低下注 {min} WOOD', en: 'Minimum bet is {min} WOOD' },
      wcbet_insufficient_balance: { zh: '积分不足', en: 'Insufficient points' },
      wcbet_confirm:       { zh: '确认用 {amount} WOOD 下注？', en: 'Confirm bet with {amount} WOOD?' },
      wcbet_token_expired: { zh: '授权过期，请重新登录', en: 'Authorization expired, please login again' },
      wcbet_success:       { zh: '✅ 下注成功！余额：{balance} WOOD', en: '✅ Bet successful! Balance: {balance} WOOD' },
      wcbet_fail:          { zh: '❌ 失败：{message}', en: '❌ Failed: {message}' },
      event_bet_upcoming:  { zh: '即将开始', en: 'Upcoming' },
      wcbet_network_error: { zh: '网络错误，请稍后重试', en: 'Network error, please try again later' },

      // ---------- 筹码栏 ----------
      hotbet_my_points:    { zh: '筹码', en: 'CHIPS' }
    });

    // 全局 t 函数已就绪，无需再创建
    return;
  }

  // ---------- 独立运行模式（无全局 YYCardLang 时） ----------
  const translations = {
    // ... 与上面完全相同的翻译对象，复制一份即可
    loading:             { zh: '加载中...', en: 'Loading...' },
    no_data:             { zh: '暂无数据', en: 'No data' },
    please_login:        { zh: '请先登录', en: 'Please login first' },
    network_error:       { zh: '网络错误，请稍后重试', en: 'Network error, please try again later.' },
    unknown_error:       { zh: '未知错误', en: 'Unknown error' },
    cat_worldcup:        { zh: '⚽ 世界杯', en: '⚽ World Cup' },
    cat_crypto:          { zh: '₿ 加密货币', en: '₿ Crypto' },
    cat_esports:         { zh: ' 电竞', en: ' Esports' },
    cat_sports:          { zh: ' 体育', en: ' Sports' },
    category_not_available: { zh: '该分类开发中...', en: 'Category under development...' },
    filter_hot:          { zh: ' 热门', en: ' Hot' },
    filter_live:         { zh: ' 进行中', en: ' Live' },
    filter_upcoming:     { zh: ' 即将到来', en: ' Upcoming' },
    filter_mybets:       { zh: ' 我的预测', en: ' My Bets' },
    status_upcoming:     { zh: '即将开始', en: 'Upcoming' },
    status_live:         { zh: '进行中', en: 'Live' },
    status_ended:        { zh: '已结束', en: 'Ended' },
    event_no_options:    { zh: '暂无选项', en: 'No options' },
    event_bet_btn:       { zh: '下注', en: 'Bet' },
    event_bet_end:       { zh: '已截止', en: 'Ended' },
    event_bet_deadline:  { zh: '下注截止', en: 'Bet Deadline' },
    event_base_pool:     { zh: '基础奖池', en: 'Base Pool' },
    event_total_pool:    { zh: '总奖池', en: 'Total Pool' },
    event_match_time:    { zh: '比赛', en: 'Match' },
    no_events:           { zh: '暂无预测事件', en: 'No prediction events' },
    tbd:                 { zh: '待定', en: 'TBD' },
    no_limit:            { zh: '无限制', en: 'No limit' },
    bet_not_started:     { zh: '下注尚未开始', en: 'Betting has not started yet' },
    bet_module_not_loaded: { zh: '下注模块未加载，请刷新页面', en: 'Bet module not loaded, please refresh' },
    countdown_ended:     { zh: '已截止', en: 'Ended' },
    calculating:         { zh: '计算中...', en: 'Calculating...' },
    day:                 { zh: '天', en: 'd ' },
    hour:                { zh: '时', en: 'h ' },
    minute:              { zh: '分', en: 'm ' },
    second:              { zh: '秒', en: 's ' },
    mybets_all:          { zh: '全部', en: 'All' },
    mybets_pending:      { zh: '待开奖', en: 'Pending' },
    mybets_won:          { zh: '中奖', en: 'Won' },
    mybets_lost:         { zh: '未中奖', en: 'Lost' },
    mybets_no_records:   { zh: '暂无下注记录', en: 'No bet records' },
    mybets_unknown_event: { zh: '未知事件', en: 'Unknown Event' },
    mybets_unknown_option: { zh: '未知选项', en: 'Unknown Option' },
    mybets_pending_status: { zh: '未开奖', en: 'Pending' },
    mybets_won_status:   { zh: '中奖', en: 'Won' },
    mybets_lost_status:  { zh: '未中奖', en: 'Lost' },
    mybets_selected:     { zh: '选择', en: 'Selected' },
    mybets_bet_amount:   { zh: '下注金额', en: 'Bet Amount' },
    mybets_profit:       { zh: '收益', en: 'Profit' },
    mybets_not_loaded:   { zh: '预测记录模块未加载', en: 'Prediction records module not loaded' },
    wcbet_please_login:  { zh: '请先登录', en: 'Please login first' },
    wcbet_balance_too_low: { zh: '积分不足，最低下注 {min} WOOD，请先签到', en: 'Insufficient points, minimum bet is {min} WOOD, please check in first' },
    wcbet_prompt:        { zh: '下注金额（余额：{balance} WOOD，最低 {min} WOOD）', en: 'Bet amount (Balance: {balance} WOOD, min {min} WOOD)' },
    wcbet_min_bet:       { zh: '最低下注 {min} WOOD', en: 'Minimum bet is {min} WOOD' },
    wcbet_insufficient_balance: { zh: '积分不足', en: 'Insufficient points' },
    wcbet_confirm:       { zh: '确认用 {amount} WOOD 下注？', en: 'Confirm bet with {amount} WOOD?' },
    wcbet_token_expired: { zh: '授权过期，请重新登录', en: 'Authorization expired, please login again' },
    wcbet_success:       { zh: '✅ 下注成功！余额：{balance} WOOD', en: '✅ Bet successful! Balance: {balance} WOOD' },
    wcbet_fail:          { zh: '❌ 失败：{message}', en: '❌ Failed: {message}' },
    event_bet_upcoming:  { zh: '即将开始', en: 'Upcoming' },
    wcbet_network_error: { zh: '网络错误，请稍后重试', en: 'Network error, please try again later' },
    hotbet_my_points:    { zh: '筹码', en: 'CHIPS' }
  };

  let currentLang = localStorage.getItem('hotbet_lang') || 'zh';

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

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('hotbet_lang', lang);
    // 如果全局管理器存在，也同步过去
    if (window.YYCardLang && window.YYCardLang.setLang) {
      window.YYCardLang.setLang(lang);
    } else {
      if (window.YYCardHotBet?.refresh) window.YYCardHotBet.refresh();
    }
  }

  function getLang() {
    return currentLang;
  }

  // 初始化：尝试从数据库读取语言设置
  async function init() {
    try {
      const user = window.YYCardAuth?.currentUser;
      if (user && window.supabase) {
        const { data, error } = await window.supabase
          .from('user_settings')
          .select('language')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data?.language && !error) {
          currentLang = data.language;
          localStorage.setItem('hotbet_lang', currentLang);
        }
      }
    } catch (e) {
      console.warn('读取语言设置失败，使用本地缓存', e);
    }
    // 确保全局 t 函数可用
    window._t = t;
    return currentLang;
  }

  // 将独立实例暴露出去（兼容旧代码中可能直接引用 YYCardHotBetLang 的地方）
  window.YYCardHotBetLang = { t, setLang, getLang, init };
  window._t = t;
})();
