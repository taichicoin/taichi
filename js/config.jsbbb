// Supabase 配置 + 全局常量
window.YYCardConfig = {
    SUPABASE_URL: 'https://sznjaotjoljaiawbvfro.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_iN3D88OfHeUre4ddCaDH7g_rlsQ8LGN',
    LOGIN_PAGE_URL: 'https://taichicoin.xyz/yycard/signup',
    DEFAULT_AVATAR: '/yycard/assets/default-avatar.png',
    RENAME_COOLDOWN_DAYS: 365,
    AVATAR_COOLDOWN_DAYS: 15,
    MAX_RETRY_COUNT: 3,
    MATCHMAKING_TIMEOUT_MS: 60000, // 60秒
    MAX_PLAYERS: 8
};

// 初始化 Supabase 客户端
window.supabase = window.supabase.createClient(
    window.YYCardConfig.SUPABASE_URL,
    window.YYCardConfig.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

console.log('✅ config.js 加载完成');
