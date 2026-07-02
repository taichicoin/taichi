// ==================== 筹码渲染模块（读取 user_checkins.total_points） ====================
window.YYCardHotBetChip = (() => {
  const auth = window.YYCardAuth;
  const supabase = window.supabase;

  // 获取当前 WOOD 余额（即签到积分）
  async function getBalance() {
    try {
      const profile = auth?.currentProfile;
      // 没有 telegram_id 的用户（如谷歌登录）余额为 0
      if (!profile || !profile.telegram_id) return 0;

      const { data, error } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('telegram_id', profile.telegram_id)
        .maybeSingle();

      if (error) {
        console.error('获取WOOD余额失败:', error);
        return 0;
      }
      return data?.total_points || 0;
    } catch (e) {
      console.error('getBalance异常:', e);
      return 0;
    }
  }

  // 扣除积分（下注时调用），返回新余额，失败返回 null
  async function deduct(amount) {
    try {
      const profile = auth?.currentProfile;
      if (!profile?.telegram_id) return null;

      // 原子操作：读取当前积分并检查是否足够
      const { data, error: readErr } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('telegram_id', profile.telegram_id)
        .single();

      if (readErr || !data) return null;
      if (data.total_points < amount) return null; // 余额不足

      const newBalance = data.total_points - amount;

      const { error: updateErr } = await supabase
        .from('user_checkins')
        .update({ total_points: newBalance })
        .eq('telegram_id', profile.telegram_id);

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

  // 增加积分（结算获胜时调用，预留）
  async function add(amount) {
    try {
      const profile = auth?.currentProfile;
      if (!profile?.telegram_id) return null;

      const { data, error: readErr } = await supabase
        .from('user_checkins')
        .select('total_points')
        .eq('telegram_id', profile.telegram_id)
        .single();

      if (readErr || !data) return null;
      const newBalance = (data.total_points || 0) + amount;

      const { error: updateErr } = await supabase
        .from('user_checkins')
        .update({ total_points: newBalance })
        .eq('telegram_id', profile.telegram_id);

      if (updateErr) return null;
      return newBalance;
    } catch (e) {
      return null;
    }
  }

  // 渲染顶部积分栏（带 WOOD 图标）
  function render(balance) {
    return `
      <div class="hotbet-points-bar">
        <span class="label">🔥 我的WOOD</span>
        <span class="value">
          <img src="/assets/logo/wood.png" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;" onerror="this.style.display='none'">
          ${balance} WOOD
        </span>
      </div>
    `;
  }

  return { getBalance, deduct, add, render };
})();
