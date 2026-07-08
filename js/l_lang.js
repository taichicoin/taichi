// /js/l_lang.js - 大厅语言包（中英双语，支持自动刷新 UI）
window.YYCardLobbyLang = (function() {
  const translations = {
    // ========== 用户信息 ==========
    lobby_no_username:       { zh: '未设置ID', en: 'No ID' },
    lobby_no_wallet:         { zh: '未绑定钱包', en: 'Not bound' },
    lobby_rename_cards:      { zh: '改名卡：{count}张', en: 'Rename Cards: {count}' },

    // ========== 匹配按钮 ==========
    match_btn_ready:         { zh: '⚡ 开始匹配', en: '⚡ Start Match' },
    match_btn_no_id:         { zh: '请先设置游戏ID', en: 'Please set game ID first' },
    match_entrance:          { zh: '匹配赛', en: 'Match' },

    // ========== 匹配房间标题与奖励 ==========
    room_title:              { zh: '排位竞技', en: 'Ranked Arena' },
    room_season:             { zh: 'Season 1', en: 'Season 1' },
    room_reward_today:       { zh: '今日奖励', en: 'Today' },
    room_reward_first:       { zh: '首胜奖励', en: 'First Win' },
    room_reward_streak:      { zh: '连胜奖励', en: 'Streak' },
    room_cancel_btn:         { zh: '取消匹配', en: 'Cancel' },

    // ========== 匹配房间状态（createRoom.js 使用） ==========
    room_no_name:             { zh: '未命名玩家', en: 'Unnamed Player' },
    room_status_ready:        { zh: '准备开始匹配', en: 'Ready to match' },
    room_status_searching:    { zh: '正在寻找对手...', en: 'Searching...' },
    room_status_expanding:    { zh: '匹配范围扩大...', en: 'Expanding search...' },
    room_status_waiting:      { zh: '等待其他玩家进入...', en: 'Waiting for players...' },
    room_status_high_active:  { zh: '正在匹配高活跃玩家...', en: 'Matching top players...' },
    room_match_success:       { zh: '⚡ 匹配成功！', en: '⚡ Match found!' },
    room_match_failed:        { zh: '匹配失败，请重试', en: 'Match failed, retry' },
    room_in_battle:           { zh: '正在对战中，无法进入匹配房间', en: 'In battle, cannot enter match room' },

    // ========== 右上角面板 ==========
    settings_btn_text:       { zh: '设置', en: 'Settings' },
    settings_title:          { zh: '游戏设置', en: 'Settings' },
    lang_setting:            { zh: '语言设置', en: 'Language' },
    sound_volume:            { zh: '音效音量', en: 'Sound Volume' },
    bgm:                     { zh: '背景音乐', en: 'BGM' },
    account_manage:          { zh: '账号管理', en: 'Account' },
    notice_btn_text:         { zh: '公告', en: 'Notice' },
    notice_title:            { zh: '最新公告', en: 'Announcements' },
    notice_new_version:      { zh: '新版本上线', en: 'New Version' },
    notice_ranked:           { zh: '排位赛开启', en: 'Ranked Open' },
    notice_new_card:         { zh: '新卡牌预告', en: 'New Card Preview' },
    mail_btn_text:           { zh: '邮件', en: 'Mail' },
    mail_title:              { zh: '游戏邮箱', en: 'Mailbox' },
    mail_system:             { zh: '系统邮件', en: 'System Mail' },
    mail_unread:             { zh: '3 封未读', en: '3 unread' },
    mail_reward:             { zh: '奖励领取', en: 'Claim Reward' },
    mail_battle_log:         { zh: '对战记录', en: 'Battle Log' },
    view_more:               { zh: '查看 ›', en: 'View ›' },
    adjust_more:             { zh: '调节 ›', en: 'Adjust ›' },
    on:                      { zh: '开启 ›', en: 'On ›' },

    // ========== 头像菜单 ==========
    menu_change_username:    { zh: ' 修改游戏ID', en: ' Change ID' },
    menu_bind_wallet:        { zh: ' 绑定钱包', en: ' Bind Wallet' },
    menu_change_avatar:      { zh: ' 修改头像', en: ' Change Avatar' },
    menu_logout:             { zh: ' 登出', en: ' Logout' },
    menu_email_label:        { zh: '邮箱：', en: 'Email: ' }

    
    // ========== 修改用户名弹窗 ==========
    username_title_create:   { zh: ' 创建ID', en: ' Create ID' },
    username_title_modify:   { zh: ' 修改ID', en: ' Modify ID' },
    username_first_time:     { zh: ' 首次登录，请设置您的专属游戏ID', en: ' First login, please set your unique game ID' },
    username_normal_sub:     { zh: '请输入 1-7 位小写字母或数字', en: 'Enter 1-7 lowercase letters or numbers' },
    username_cooldown_nocard:{ zh: '修改冷却中（剩余 {days} 天），暂无改名卡', en: 'Cooldown ({days} days left), no rename card' },
    username_cooldown_card:  { zh: '冷却中（剩余 {days} 天），本次将消耗 1 张改名卡', en: 'Cooldown ({days} days left), will use 1 rename card' },
    username_after_modify:   { zh: '修改后将重置冷却时间为 1 年', en: 'After change, cooldown resets to 1 year' },
    username_placeholder:    { zh: '输入1-7位小写字母或数字', en: '1-7 lowercase letters or numbers' },
    username_save_create:    { zh: '确认创建', en: 'Create' },
    username_save_modify:    { zh: '确认修改', en: 'Modify' },
    username_quit:           { zh: '退出游戏', en: 'Quit Game' },
    username_close:          { zh: '关闭', en: 'Close' },
    username_empty_err:      { zh: '请输入游戏ID', en: 'Please enter game ID' },
    username_format_err:     { zh: '格式错误，必须是1-7位小写字母或数字', en: 'Invalid format, must be 1-7 lowercase letters or numbers' },
    username_submitting:     { zh: '提交中...', en: 'Submitting...' },
    username_fail:           { zh: '设置失败: {message}', en: 'Failed: {message}' },

    // ========== 绑定钱包弹窗 ==========
    wallet_title:            { zh: ' 绑定钱包', en: ' Bind Wallet' },
    wallet_sub:              { zh: '请输入以太坊钱包地址 (0x开头，42位)', en: 'Enter Ethereum address (0x..., 42 chars)' },
    wallet_placeholder:      { zh: '0x...', en: '0x...' },
    wallet_save:             { zh: '确认绑定', en: 'Bind' },
    wallet_binding:          { zh: '绑定中...', en: 'Binding...' },
    wallet_empty_err:        { zh: '请输入钱包地址', en: 'Enter wallet address' },
    wallet_invalid_err:      { zh: '无效的以太坊地址', en: 'Invalid Ethereum address' },
    wallet_success:          { zh: '钱包已绑定', en: 'Wallet bound' },
    wallet_fail:             { zh: '操作失败: {message}', en: 'Operation failed: {message}' },

    // ========== 修改头像 ==========
    avatar_cooldown_err:     { zh: '头像每15天只能修改一次', en: 'Avatar can be changed every 15 days only' },
    avatar_upload_fail:      { zh: '上传失败: {message}', en: 'Upload failed: {message}' },
    avatar_update_success:   { zh: '头像更新成功', en: 'Avatar updated' },
  };

  function getLang() {
    const profile = window.YYCardAuth?.currentProfile;
    if (profile && profile.language) return profile.language;
    const saved = localStorage.getItem('lobby_lang');
    if (saved === 'zh' || saved === 'en') return saved;
    return 'zh'; // 默认中文
  }

  function t(key, params) {
    const lang = getLang();
    const entry = translations[key];
    if (!entry) return key;
    let text = entry[lang] || entry['en'] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  }

  // 自动更新所有带有 data-lobby-lang-key 的元素，以及特定 ID 的元素
  function applyLanguage() {
    // 1. 更新带有 data-lobby-lang-key 的元素
    document.querySelectorAll('[data-lobby-lang-key]').forEach(el => {
      const key = el.getAttribute('data-lobby-lang-key');
      if (key && translations[key]) {
        el.textContent = t(key);
      }
    });

    // 2. 更新已知的特殊元素（匹配房间标题等）
    const roomTitle = document.querySelector('.match-title');
    if (roomTitle) roomTitle.textContent = t('room_title');
    const seasonText = document.querySelector('.season-text');
    if (seasonText) seasonText.textContent = t('room_season');
    const cancelBtn = document.getElementById('cancel-match-btn');
    if (cancelBtn && cancelBtn.textContent !== '') {
      cancelBtn.textContent = t('room_cancel_btn');
    }
    // 匹配入口按钮文字
    const matchEntranceSpan = document.querySelector('.btn-match-text');
    if (matchEntranceSpan) matchEntranceSpan.textContent = t('match_entrance');
    // 奖励卡片
    document.querySelectorAll('.reward-card div').forEach((el, i) => {
      const keys = ['room_reward_today', 'room_reward_first', 'room_reward_streak'];
      if (i < keys.length) el.textContent = t(keys[i]);
    });
    // 设置面板内的语言显示
    const langDisplay = document.getElementById('lang-display');
    if (langDisplay) {
      langDisplay.textContent = getLang() === 'zh' ? '中文' : 'English';
    }
    // 更新用户信息区域（profileUI.update 会覆盖，但为了即时性也调一下）
    if (window.YYCardProfileUI && window.YYCardProfileUI.update) {
      window.YYCardProfileUI.update();
    }
  }

  function setLang(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    localStorage.setItem('lobby_lang', lang);
    // 如果用户已登录，可同步到数据库（由外部 toggleLanguage 处理）
    applyLanguage();
  }

  return { t, getLang, setLang, applyLanguage, translations };
})();
