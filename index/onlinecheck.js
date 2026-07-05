window.YYCardOnlineCheck = (function () {

  const MAX_ONLINE = 200;

  async function getOnlineCount(supabase) {
    if (!supabase) return 999;

    try {
      const { count, error } = await supabase
        .from('online_users')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', new Date(Date.now() - 120000).toISOString());

      if (error) return 0;
      return count || 0;

    } catch (e) {
      return 0;
    }
  }

  // 关键修改：增加 onUpdate 回调参数
  async function waitUntilAvailable(supabase, onUpdate) {
    while (true) {
      const now = await getOnlineCount(supabase);
      
      // 每次查询后都通知 loading.js 当前人数和最大人数
      if (typeof onUpdate === 'function') {
        onUpdate(now, MAX_ONLINE);
      }
      
      if (now < MAX_ONLINE) return now; // 有空位就通过
      
      // 满员就等 2 秒再查
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return {
    getOnlineCount,
    waitUntilAvailable,
    MAX_ONLINE
  };

})();
