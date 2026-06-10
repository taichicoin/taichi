// 认证与用户档案管理
window.YYCardAuth = {
    currentUser: null,
    currentProfile: null,
    retryCount: 0,

    // 调试日志
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

    // 初始化认证（带重试）
    async init() {
        this.log('🚀 开始认证初始化...');
        const MAX = window.YYCardConfig.MAX_RETRY_COUNT;
        const supabase = window.supabase;

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
                this.log(`第${this.retryCount+1}次会话校验异常: ${err.message}`, true);
            }
            this.retryCount++;
            if (this.retryCount < MAX) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (userError || !user) {
            this.log(`会话校验失败，重试${MAX}次后仍未获取到用户，跳转登录页`, true);
            window.location.href = window.YYCardConfig.LOGIN_PAGE_URL;
            return false;
        }

        this.currentUser = user;
        this.log(`当前用户: ${user.email}`);

        // 加载或创建档案
        const profile = await this.ensureProfile();
        if (!profile) return false;

        this.currentProfile = profile;
        return true;
    },

    // 确保 profiles 记录存在
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
                    display_name: user.user_metadata?.full_name || user.email,
                    avatar_url: user.user_metadata?.avatar_url || DEFAULT_AVATAR,
                    rename_card_count: 1
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

    // 登出
    async signOut() {
        await window.supabase.auth.signOut();
        window.location.href = window.YYCardConfig.LOGIN_PAGE_URL;
    }
};

console.log('✅ auth.js 加载完成');
