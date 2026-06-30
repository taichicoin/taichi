// js/tokenlister/wood.js
(function() {
  // 全局注册表
  if (!window.__YY_ASSETS__) window.__YY_ASSETS__ = [];

  window.__YY_ASSETS__.push({
    id: 'wood',
    name: 'Wood',
    icon: '/assets/logo/wood.png',
    price: null,    // 如果有价格可以填

    async fetchBalance() {
      const auth = window.YYCardAuth;
      const supabase = window.supabase;
      const profile = auth?.currentProfile;
      // 没有电报ID则余额为0（谷歌用户）
      if (!profile || !profile.telegram_id) return 0;

      const { data } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('telegram_id', profile.telegram_id)
        .maybeSingle();

      return data ? data.total_points : 0;
    }

    // 可选：如果将来需要特殊渲染，可以实现 render(balance)，返回 HTML 字符串
    // render(balance) {
    //   return `<div class="asset-item special-wood">...</div>`;
    // }
  });
})();
