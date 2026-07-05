// ==================== 登录状态检查（公共模块） ====================
// 每个页面引入，未登录自动跳转登录页
(async function() {
    if (sessionStorage.getItem('yy_logged_in') === '1') return;

    let retries = 0;
    while (typeof supabase === 'undefined' && retries < 50) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
    }

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase SDK 未加载，跳转登录页');
        window.location.replace('/ycardy/');
        return;
    }

    try {
        const client = supabase.createClient(
            window.YYCardConfig.SUPABASE_URL,
            window.YYCardConfig.SUPABASE_ANON_KEY
        );
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            window.location.replace('/ycardy/');
            return;
        }
        sessionStorage.setItem('yy_logged_in', '1');
    } catch (e) {
        console.error('登录检查失败:', e);
        window.location.replace('/ycardy/');
    }
})();
