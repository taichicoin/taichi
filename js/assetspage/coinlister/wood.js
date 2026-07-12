// js/tokenlister/wood.js
(function() {
  // 全局注册表
  if (!window.__YY_ASSETS__) window.__YY_ASSETS__ = [];

  window.__YY_ASSETS__.push({
    id: 'WOOD',
    name: 'WOOD',
    icon: '/assets/logo/wood.png',
    price: '$0',

    async fetchBalance() {
      const auth = window.YYCardAuth;
      const supabase = window.supabase;
      const user = auth?.currentUser;
      if (!user) return 0; // 未登录

      // 1. 优先通过 user_id 查询
      let { data } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) return data.total_points || 0;

      // 2. 回退：电报用户可能还未填充 user_id，尝试通过 telegram_id 查询
      const profile = auth.currentProfile;
      if (profile?.telegram_id) {
        ({ data } = await supabase
          .from('user_checkins')
          .select('total_points')
          .eq('telegram_id', profile.telegram_id)
          .maybeSingle());
        if (data) return data.total_points || 0;
      }

      // 3. 谷歌用户可能只有 google_email
      if (user.email) {
        ({ data } = await supabase
          .from('user_checkins')
          .select('total_points')
          .eq('google_email', user.email)
          .maybeSingle());
        if (data) return data.total_points || 0;
      }

      return 0;
    }
  });
})();
