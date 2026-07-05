<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>登录 · YY Card</title>

    <!-- 公共配置 -->
    <script src="/js/config.js"></script>

    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Roboto, sans-serif;
            background: #0b0f1c url('/assets/default-avatar.png') center center / cover no-repeat;
            background-image: linear-gradient(145deg, rgba(11, 15, 28, 0.85) 0%, rgba(26, 31, 51, 0.85) 100%),
                              url('/assets/default-avatar.png');
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #f0f0f0;
        }
        .login-box {
            max-width: 420px;
            background: rgba(20, 28, 48, 0.9);
            backdrop-filter: blur(12px);
            border-radius: 32px;
            padding: 40px 24px;
            text-align: center;
            border: 1px solid rgba(255,215,0,0.3);
        }
        .logo {
            font-size: 3.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #f5d76e, #ffb347);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            margin-bottom: 40px;
        }
        .btn-google {
            background: #fff;
            color: #1e1e2f;
            border: none;
            padding: 16px 24px;
            border-radius: 60px;
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            box-shadow: 0 8px 0 #0a0e17;
            cursor: pointer;
            width: 100%;
            transition: 0.2s;
        }
        .btn-google:active {
            transform: translateY(2px);
            box-shadow: 0 4px 0 #0a0e17;
        }
        .footer { margin-top: 32px; opacity: 0.7; font-size: 0.9rem; }
        .loading-text { margin-top: 24px; opacity: 0.8; }
        #log-panel {
            max-width: 420px;
            margin: 10px auto;
            background: rgba(0,0,0,0.7);
            border-radius: 12px;
            padding: 12px;
            font-size: 0.75rem;
            color: #7bffb1;
            text-align: left;
            max-height: 180px;
            overflow-y: auto;
            display: none;
        }
        #log-panel div {
            margin: 4px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 2px;
        }
        .log-error { color: #ff7b7b; }
    </style>
</head>
<body>

<div style="display: flex; flex-direction: column; align-items: center; width: 100%;">

    <div class="login-box" id="login-box">
        <div class="logo">⚔️ YY Card</div>
        <button class="btn-google" id="google-login-btn">
            <span style="font-size:1.8rem;">G</span> 使用 Google 登录
        </button>
        <div class="footer">山海经 · 西游 · 三国</div>
    </div>

    <div class="loading-text" id="loading-text" style="display:none;">
        🔄 正在检测登录状态...
    </div>

    <div id="log-panel"></div>

</div>

<script>
    const logPanel = document.getElementById('log-panel');
    function pageLog(msg, isError = false) {
        logPanel.style.display = 'block';
        const line = document.createElement('div');
        line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        if (isError) line.className = 'log-error';
        logPanel.appendChild(line);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // 动态加载 Supabase SDK，直到 createClient 可用
    async function ensureSupabase() {
        const CDN_LIST = [
            'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js',
            'https://unpkg.com/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.45.0/supabase.min.js'
        ];

        for (const url of CDN_LIST) {
            // 如果当前已经可用，直接返回
            if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
                pageLog('✅ createClient 已就绪');
                return true;
            }

            pageLog('尝试加载: ' + url.split('/').pop());
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                // 加载后稍等一会儿让脚本初始化
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                pageLog('加载失败: ' + e.message, true);
            }
        }

        if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
            return true;
        }

        pageLog('❌ 所有 CDN 均未提供 createClient', true);
        return false;
    }

    (async function() {
        pageLog('🚀 开始加载 SDK');

        const ok = await ensureSupabase();
        if (!ok) {
            document.getElementById('loading-text').style.display = 'block';
            document.getElementById('loading-text').textContent = '❌ 系统加载失败，请刷新重试';
            return;
        }

        if (!window.YYCardConfig) {
            pageLog('❌ 配置未加载', true);
            return;
        }

        let supabaseClient;
        try {
            supabaseClient = supabase.createClient(
                window.YYCardConfig.SUPABASE_URL,
                window.YYCardConfig.SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true,
                    }
                }
            );
            pageLog('✅ 客户端创建成功');
        } catch (e) {
            pageLog('❌ 创建客户端失败: ' + e.message, true);
            return;
        }

        // 检查 session
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                pageLog('✅ 已登录，跳转到 game.html');
                window.location.replace('game.html');
                return;
            }
            pageLog('ℹ️ 未登录，显示登录按钮');
        } catch (e) {
            pageLog('⚠️ session 检测异常: ' + e.message, true);
        }

        document.getElementById('loading-text').style.display = 'none';
        document.getElementById('login-box').style.display = '';

        const btn = document.getElementById('google-login-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            pageLog('🖱️ 点击登录');
            btn.disabled = true;
            btn.textContent = '⏳ 跳转中...';

            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.YYCardConfig.LOGIN_PAGE_URL
                }
            });

            if (error) {
                pageLog('❌ 登录失败: ' + error.message, true);
                alert('登录失败: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'G  使用 Google 登录';
            } else {
                pageLog('✅ 已发起 OAuth');
            }
        });

        pageLog('👆 等待用户操作');
    })();
</script>

</body>
</html>
