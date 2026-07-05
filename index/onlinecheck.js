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

  async function waitUntilAvailable(supabase) {
    while (true) {
      const n = await getOnlineCount(supabase);
      if (n < MAX_ONLINE) return n;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return {
    getOnlineCount,
    waitUntilAvailable,
    MAX_ONLINE
  };

})();
