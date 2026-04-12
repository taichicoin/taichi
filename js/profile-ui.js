// 大厅UI交互：用户名、钱包、头像
window.YYCardProfileUI = {
    // 更新UI
    update() {
        const profile = window.YYCardAuth.currentProfile;
        const user = window.YYCardAuth.currentUser;
        if (!profile) return;

        const avatarSrc = profile.avatar_url || user?.user_metadata?.avatar_url || window.YYCardConfig.DEFAULT_AVATAR;
        document.getElementById('lobby-avatar').src = avatarSrc;
        document.getElementById('lobby-username').textContent = 
            profile.username || profile.display_name || user.email;
        document.getElementById('lobby-wallet').textContent = 
            profile.wallet_address ? window.YYCardUtils.formatAddress(profile.wallet_address) : '未绑定钱包';
        document.getElementById('lobby-card-count').textContent = `改名卡：${profile.rename_card_count || 0}张`;

        const btn = document.getElementById('start-match-btn');
        btn.disabled = !profile.username;
        btn.textContent = profile.username ? '⚡ 开始匹配' : '请先设置游戏ID';
    },

    // 绑定事件
    bindEvents() {
        const self = this;
        const supabase = window.supabase;
        const auth = window.YYCardAuth;
        const utils = window.YYCardUtils;
        const config = window.YYCardConfig;

        // 登出
        document.getElementById('logout-btn').onclick = () => auth.signOut();

        // 设置用户名
        document.getElementById('set-username-btn').onclick = async () => {
            const profile = auth.currentProfile;
            const isFirstSet = !profile.username;
            const cooldown = utils.calculateCooldown(profile.username_last_modified, config.RENAME_COOLDOWN_DAYS);
            const hasCard = (profile.rename_card_count || 0) >= 1;

            if (!isFirstSet && !cooldown.canChange && !hasCard) {
                alert(`距离上次改名还有${cooldown.remainingDays}天冷却，暂无改名卡，无法修改用户名`);
                return;
            }

            let useCardConfirm = false;
            if (!isFirstSet && !cooldown.canChange && hasCard) {
                useCardConfirm = confirm(`距离上次改名还有${cooldown.remainingDays}天冷却，本次修改将消耗1张改名卡，是否继续？`);
                if (!useCardConfirm) return;
            }

            const name = prompt('请输入1-7位小写字母或数字的游戏ID:');
            if (!name) return;
            if (!utils.isValidUsername(name)) {
                alert('格式错误，必须是1-7位小写字母或数字');
                return;
            }

            const updateData = {
                username: name,
                username_last_modified: new Date().toISOString()
            };

            if (!isFirstSet && !cooldown.canChange && useCardConfirm) {
                updateData.rename_card_count = (profile.rename_card_count || 0) - 1;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', auth.currentUser.id);

            if (error) {
                alert('设置失败: ' + error.message);
                return;
            }

            const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
            auth.currentProfile = data;
            self.update();

            if (isFirstSet) {
                auth.log(`首次设置用户名成功: ${name}`);
                alert('用户名设置成功！');
            } else if (useCardConfirm) {
                auth.log(`用户名修改成功: ${name}，已消耗1张改名卡`);
                alert(`用户名修改成功！已消耗1张改名卡，剩余${data.rename_card_count}张`);
            } else {
                auth.log(`用户名修改成功: ${name}，冷却已重置`);
                alert('用户名修改成功！下次免费修改需等待1年');
            }
        };

        // 绑定钱包
        document.getElementById('bind-wallet-btn').onclick = async () => {
            const addr = prompt('请输入以太坊钱包地址 (0x开头，42位):');
            if (!addr) return;
            if (!utils.isValidEthAddress(addr)) {
                alert('无效的以太坊地址');
                return;
            }
            const { error } = await supabase
                .from('profiles')
                .update({ wallet_address: addr })
                .eq('id', auth.currentUser.id);
            if (error) {
                alert('绑定失败: ' + error.message);
                return;
            }
            const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
            auth.currentProfile = data;
            self.update();
            auth.log(`钱包已绑定: ${utils.formatAddress(addr)}`);
        };

        // 修改头像
        const avatarModal = document.getElementById('avatar-modal');
        const fileInput = document.getElementById('avatar-file-input');
        const statusDiv = document.getElementById('upload-status');
        const warnDiv = document.getElementById('cooldown-warning');

        document.getElementById('change-avatar-btn').onclick = () => {
            const cooldown = utils.calculateCooldown(auth.currentProfile?.avatar_last_modified, config.AVATAR_COOLDOWN_DAYS);
            warnDiv.textContent = cooldown.canChange ? '' : `冷却中，剩余 ${utils.formatRemaining(cooldown.remaining)}`;
            avatarModal.style.display = 'flex';
            fileInput.value = '';
            statusDiv.innerHTML = '';
        };

        document.getElementById('upload-avatar-btn').onclick = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            const cooldown = utils.calculateCooldown(auth.currentProfile?.avatar_last_modified, config.AVATAR_COOLDOWN_DAYS);
            if (!cooldown.canChange) {
                alert('头像每15天只能修改一次');
                return;
            }

            const ext = file.name.split('.').pop();
            const path = `${auth.currentUser.id}_${Date.now()}.${ext}`;
            statusDiv.innerHTML = '上传中...';

            const { error: upErr } = await supabase.storage
                .from('avatars')
                .upload(path, file, { upsert: true });

            if (upErr) {
                statusDiv.innerHTML = '上传失败: ' + upErr.message;
                return;
            }

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            const newAvatarUrl = urlData.publicUrl;

            const { error: updateErr } = await supabase
                .from('profiles')
                .update({
                    avatar_url: newAvatarUrl,
                    avatar_last_modified: new Date().toISOString()
                })
                .eq('id', auth.currentUser.id);

            if (updateErr) {
                statusDiv.innerHTML = '头像保存失败: ' + updateErr.message;
                return;
            }

            avatarModal.style.display = 'none';
            const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
            auth.currentProfile = newProfile;
            self.update();
            auth.log('头像更新成功，新地址: ' + newAvatarUrl);
        };

        document.getElementById('cancel-avatar-btn').onclick = () => {
            avatarModal.style.display = 'none';
        };
    }
};

console.log('✅ profile-ui.js 加载完成');
