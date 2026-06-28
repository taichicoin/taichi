// 认证与用户档案管理
window.YYCardAuth = {
    currentUser: null,
    currentProfile: null,
    retryCount: 0,

    log(msg, isError = false) {
        console.log(msg);
        const panel = document.getElementById('debug-panel');
        if (panel) {
            const line = document.createElement('div');
            line.className = isError ? 'error-msg' : 'success-msg';
            line.textContent = (isError ? '❌ ' : '✅ ') + msg;
            panel.appendChild(line);
            panel.scrollTop = panel.scrollHeight;
        }
    },

    async init() {
        this.log('🚀 开始认证初始化...');
        const MAX = window.YYCardConfig.MAX_RETRY_COUNT;
        const supabase = window.supabase;

        const isTelegram = !!(window.Telegram?.WebApp?.initData);

        if (isTelegram) {
            this.log('📱 检测到 Telegram 环境');
            const tg = window.Telegram.WebApp;
            const tgUser = tg.initDataUnsafe?.user;
            if (!tgUser) {
                this.log('❌ 无法获取 Telegram 用户信息', true);
                return false;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                this.log('🔄 无本地会话，通过 initData 验证...');
                try {
                    const res = await fetch(`${window.YYCardConfig.SUPABASE_URL}/functions/v1/telegram-simple-auth`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            initData: tg.initData,
                            api_key: 'sk_MyGame_2026_tg_checkin_!@#QwErTy'
                        })
                    });
                    const body = await res.json();
                    if (body.error) {
                        this.log(`Telegram 登录失败: ${body.error}`, true);
                        return false;
                    }
                    await supabase.auth.setSession({
                        access_token: body.access_token,
                        refresh_token: body.refresh_token
                    });
                    this.log('✅ Telegram 自动登录成功');
                } catch (err) {
                    this.log(`Telegram 登录异常: ${err.message}`, true);
                    return false;
                }
            } else {
                this.log('✅ 从本地存储恢复 Telegram 会话');
            }
        }

        let user = null;
        let userError = null;

        while (this.retryCount < MAX) {
            try {
                const { data } = await supabase.auth.getUser();
                user = data.user;
                userError = null;
                if (user) break;
            } catch (err) {
                userError = err;
                this.log(`第${this.retryCount+1}次获取用户失败: ${err.message}`, true);
            }
            this.retryCount++;
            if (this.retryCount < MAX) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (!user) {
            if (isTelegram) {
                this.log('Telegram 环境下未获取到用户，刷新页面', true);
                window.location.reload();
            } else {
                this.log('未登录或会话过期，跳转登录页', true);
                window.location.href = window.YYCardConfig.LOGIN_PAGE_URL;
            }
            return false;
        }

        this.currentUser = user;
        this.log(`当前用户: ${user.email}`);

        const profile = await this.ensureProfile();
        if (!profile) return false;

        this.currentProfile = profile;
        return true;
    },

    async ensureProfile() {
        const supabase = window.supabase;
        const user = this.currentUser;
        const DEFAULT_AVATAR = window.YYCardConfig.DEFAULT_AVATAR;

        let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError && profileError.code === 'PGRST116') {
            this.log('首次登录，创建用户档案...');
            const { data: newProfile, error: createErr } = await supabase
                .from('profiles')
                .insert({
                    id: user.id,
                    username: '',   // ← 修复点：给 username 一个空字符串，满足非空约束
                    display_name: user.user_metadata?.full_name || user.user_metadata?.first_name || user.email,
                    avatar_url: user.user_metadata?.avatar_url || DEFAULT_AVATAR,
                    rename_card_count: 1,
                    telegram_id: user.user_metadata?.telegram_id || null
                })
                .select('*')
                .single();

            if (createErr) {
                this.log(`档案创建失败: ${createErr.message}`, true);
                return null;
            }
            profile = newProfile;
            this.log('初始档案创建完成，已赠送1张改名卡');
        } else if (profileError) {
            this.log(`档案操作失败: ${profileError.message}`, true);
            return null;
        }

        this.log(`档案已加载`);
        return profile;
    },

    async signOut() {
        await window.supabase.auth.signOut();
        window.location.href = window.YYCardConfig.LOGIN_PAGE_URL;
    }
};

console.log('✅ auth.js 加载完成');
