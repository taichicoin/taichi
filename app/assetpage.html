---
permalink: /ycardy/assetpage
---
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, viewport-fit=cover">
    <title>资产 · YY Card</title>

    <meta name="theme-color" content="#1e293b">
    <link rel="stylesheet" href="/css/assets.css">
    <link rel="stylesheet" href="/css/app.css">

    <!-- Supabase SDK -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js"></script>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        if (typeof supabase === 'undefined') document.write('<script src="https://unpkg.com/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js"><\/script>');
    </script>
    <script>
        if (typeof supabase === 'undefined') document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.45.0/supabase.min.js"><\/script>');
    </script>

    <!-- 全局配置 + 认证 + 心跳 -->
    <script src="/js/config.js"></script>
    <script src="/js/auth.js"></script>
    <script src="/js/heartbeat.js"></script>
    <script>
        (function() {
            const params = new URLSearchParams(location.search);
            if (params.get('auth') === '1') {
                sessionStorage.setItem('yy_logged_in', '1');
                if (window.history?.replaceState) {
                    const cleanUrl = location.pathname + location.hash;
                    window.history.replaceState({}, document.title, cleanUrl);
                }
            } else if (window.YYCardAuth?.requireAuth) {
                window.YYCardAuth.requireAuth();
            } else if (sessionStorage.getItem('yy_logged_in') !== '1') {
                window.location.replace('/ycardy/');
            }
        })();
    </script>

    <!-- ★ 资产页面语言包 -->
    <script src="/js/assetspage/lang.js"></script>
</head>
<body>
    <!-- 初始为空，由 refreshAssets 填充 -->
    <div id="assets-area" style="min-height:100vh; padding-bottom:60px; display:flex; align-items:center; justify-content:center; font-size:18px; color:#888;"></div>

    <!-- 公共导航 -->
    <script src="/js/nav.js"></script>

    <!-- 基础工具 -->
    <script src="/js/utils.js"></script>
    <script src="/js/auth.js"></script>
    <script src="/js/ethers.umd.min.js"></script>

    <!-- 资产脚本 -->
    <script src="/js/assetspage/getdepositaddr.js"></script>
    <script src="/js/assetspage/postdeposit.js"></script>
    <script src="/js/assetspage/selfdeposit.js"></script>
    <script src="/js/assetspage/billviews.js"></script>
    <script src="/js/assetspage/withdraw.js"></script>
    <script src="/js/assetspage/assets.js"></script>
    <script src="/js/assetspage/coinlister/wood.js"></script>
    <script src="/js/assetspage/coinlister/stone.js"></script>
    <script src="/js/assetspage/coinlister/btc.js"></script>

    <script>
        (async function() {
            const container = document.getElementById('assets-area');
            const L = window.YYCardAssetsLang;

            try {
                const auth = window.YYCardAuth;
                if (!auth.currentUser) {
                    await auth.init();
                    if (!auth.currentUser) {
                        container.innerHTML = `<div style="padding:20px;text-align:center;color:#a00;">${L?.t('login_fail') || 'Login failed'}</div>`;
                        return;
                    }
                }
                sessionStorage.setItem('yy_logged_in', '1');

                if (L?.init) await L.init();

                if (window.YYCardHeartbeat && auth.currentUser) {
                    window.YYCardHeartbeat.startHeartbeat(auth.currentUser.id);
                }

                // 直接调用 refreshAssets，加载提示由它内部处理
                if (typeof window.refreshAssets === 'function') {
                    await window.refreshAssets();
                } else {
                    container.innerHTML = `<div style="padding:20px;text-align:center;color:#a00;">${L?.t('module_not_loaded') || 'Assets module not loaded'}</div>`;
                }
            } catch (err) {
                console.error('资产初始化失败:', err);
                container.innerHTML = `<div style="padding:20px;text-align:center;color:#a00;">${L?.t('page_crash') || 'Page crashed'}: ${err.message}</div>`;
            }

            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
            }
        })();
    </script>
</body>
</html>
