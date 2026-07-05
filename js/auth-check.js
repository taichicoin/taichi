// ==================== 登录状态检查（公共模块） ====================
// 用法：每个页面在 <head> 中引入此脚本，未登录会自动跳转到登录页
(async function() {
    // 快速检查：如果已标记登录成功，跳过
    if (sessionStorage.getItem('yy_logged_in') === '1') return;

    // 等待 Supabase SDK 加载（如果页面还没加载完）
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
        // 标记已通过检查，本次会话不再重复验证
        sessionStorage.setItem('yy_logged_in', '1');
    } catch (e) {
        console.error('登录检查失败:', e);
        window.location.replace('/ycardy/');
    }
})();
