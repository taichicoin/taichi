// ==================== 筹码渲染模块（读取 user_checkins.total_points，支持电报/谷歌） ====================
window.YYCardHotBetChip = (() => {
  const auth = window.YYCardAuth;
  const supabase = window.supabase;

  // 获取当前 WOOD 余额（支持所有登录用户）
  async function getBalance() {
    try {
      const user = auth?.currentUser;
      if (!user) return 0; // 未登录

      // 1. 优先通过 user_id 查询
      let { data } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) return data.total_points || 0;

      // 2. 回退：电报用户可能还没填充 user_id，尝试通过 telegram_id 查询
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
    } catch (e) {
      console.error('getBalance异常:', e);
      return 0;
    }
  }

  // 扣除积分（前端预留，使用 user_id 操作）
  async function deduct(amount) {
    try {
      const user = auth?.currentUser;
      if (!user) return null;

      const { data, error: readErr } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('user_id', user.id)
        .single();

      if (readErr || !data) return null;
      if (data.total_points < amount) return null;

      const newBalance = data.total_points - amount;
      const { error: updateErr } = await supabase
        .from('user_checkins')
        .update({ total_points: newBalance })
        .eq('user_id', user.id);

      if (updateErr) {
        console.error('扣除WOOD失败:', updateErr);
        return null;
      }
      return newBalance;
    } catch (e) {
      console.error('deduct异常:', e);
      return null;
    }
  }

  // 增加积分（预留，使用 user_id）
  async function add(amount) {
    try {
      const user = auth?.currentUser;
      if (!user) return null;

      const { data, error: readErr } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('user_id', user.id)
        .single();

      if (readErr || !data) return null;
      const newBalance = (data.total_points || 0) + amount;

      const { error: updateErr } = await supabase
        .from('user_checkins')
        .update({ total_points: newBalance })
        .eq('user_id', user.id);

      if (updateErr) return null;
      return newBalance;
    } catch (e) {
      return null;
    }
  }

  // 渲染顶部积分栏
  function render(balance) {
    return `
      <div class="hotbet-points-bar">
        <span class="label">
          <img src="/assets/logo/chip.png" style="width:35px;height:35px;vertical-align:middle;margin-right:4px;" onerror="this.style.display='none'">
          ${_t('hotbet_my_points')}
        </span>
        <span class="value">${balance} WOOD</span>
      </div>
    `;
  }

  return { getBalance, deduct, add, render };
})();
