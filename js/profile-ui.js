// ========== 终极必杀版：无圆角黑金菜单 + 强制起名 + 永不遮挡签到按钮 ==========
window.YYCardProfileUI = {
    _dropdown: null,
    _currentModal: null,
    _isFirstTimeModal: false,
    _fileInput: null,

    _injectStyles() {
        if (document.getElementById('profile-ui-advanced-styles')) return;
        const s = document.createElement('style');
        s.id = 'profile-ui-advanced-styles';
        s.textContent = `
            /* ===== 【核心绝杀】绝不干涉原有checkin.js，用CSS把签到按钮强行提到最高层级 ===== */
            .action-buttons .btn {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                z-index: 999999999 !important; /* 比任何弹窗都高 */
                margin: 0 !important;
                border-radius: 0px !important;
                background: #f0ad4e !important;
                color: #000 !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
            }

            /* ===== 头像强制突破点击拦截 ===== */
            #lobby-avatar {
                pointer-events: auto !important; 
                cursor: pointer !important;
            }

            /* ===== 无圆角深色硬朗黑金 UI ===== */
            .yy-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); z-index: 99999; display: flex; align-items: center; justify-content: center; }
            .yy-modal-box { background: #1a1a1e; border-radius: 0px !important; padding: 28px 32px; width: 86%; max-width: 380px; box-shadow: 0 16px 48px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.06); text-align: left; color: #f5f5f7; }
            .yy-modal-title { font-size: 1.1rem; font-weight: 600; letter-spacing: 1px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .yy-modal-sub { font-size: 0.9rem; color: #8e8e93; margin-bottom: 16px; }
            .yy-input { width: 100%; box-sizing: border-box; background: #2c2c2e; border: 1px solid rgba(255,255,255,0.08); padding: 14px 16px; color: white; font-size: 1rem; border-radius: 0px !important; outline: none; margin-bottom: 20px; }
            .yy-input:focus { border-color: #f0ad4e; }
            .yy-actions { display: flex; gap: 12px; }
            .yy-btn-main { flex: 1; background: #f0ad4e; border: none; padding: 14px 0; font-weight: 700; color: #1c1c1e; cursor: pointer; border-radius: 0px !important; }
            .yy-btn-main:disabled { background: #3a3a3c; color: #636366; cursor: not-allowed; }
            .yy-btn-sec { flex: 0.5; background: transparent; border: 1px solid rgba(255,255,255,0.1); padding: 14px 0; color: #8e8e93; cursor: pointer; border-radius: 0px !important; }

            .yy-dropdown-overlay { position: fixed; z-index: 99998; top:0; left:0; width:100%; height:100%; background: transparent; }
            .yy-dropdown-box { position: absolute; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 8px 24px rgba(0,0,0,0.6); border-radius: 0px !important; min-width: 150px; display: flex; flex-direction: column; padding: 6px 0; }
            .yy-dropdown-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; color: #e5e5ea; font-size: 0.9rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.03); }
            .yy-dropdown-item:last-child { border-bottom: none; color: #ff453a; }
            .yy-dropdown-item:hover { background: #2c2c2e; }
        `;
        document.head.appendChild(s);
    },

    update() {
        const profile = window.YYCardAuth.currentProfile;
        const user = window.YYCardAuth.currentUser;
        if (!profile) return;

        const avatarSrc = profile.avatar_url || user?.user_metadata?.avatar_url || window.YYCardConfig.DEFAULT_AVATAR;
        const avatarImg = document.getElementById('lobby-avatar');
        if(avatarImg) avatarImg.src = avatarSrc;

        document.getElementById('lobby-username').textContent = profile.username || profile.display_name || user.email || '未设置ID';
        document.getElementById('lobby-wallet').textContent = profile.wallet_address ? window.YYCardUtils.formatAddress(profile.wallet_address) : '未绑定钱包';
        document.getElementById('lobby-card-count').textContent = `改名卡：${profile.rename_card_count || 0}张`;

        const btn = document.getElementById('start-match-btn');
        btn.disabled = !profile.username;
        btn.textContent = profile.username ? '⚡ 开始匹配' : '请先设置游戏ID';

        // 【核心恢复】没名字就必须强制弹窗，让他填名字！
        if (!profile.username && !this._isFirstTimeModal) {
            this._showUsernameModal({ isFirstTime: true });
        }
    },

    bindEvents() {
        this._injectStyles();
        // 绑定头像点击事件
        const avatar = document.getElementById('lobby-avatar');
        if (avatar) {
            avatar.onclick = (e) => {
                e.stopPropagation();
                this._toggleDropdown(avatar);
            };
        }
    },

    _toggleDropdown(avatarEl) {
        if (this._dropdown) { this._dropdown.remove(); this._dropdown = null; return; }
        const overlay = document.createElement('div');
        overlay.className = 'yy-dropdown-overlay';
        overlay.onclick = () => { overlay.remove(); this._dropdown = null; };

        const box = document.createElement('div');
        box.className = 'yy-dropdown-box';
        const rect = avatarEl.getBoundingClientRect();
        box.style.top = (rect.bottom + 8) + 'px';
        box.style.left = (rect.left - 20) + 'px';

        box.innerHTML = `
            <div class="yy-dropdown-item" data-action="change-username">🔤 修改游戏ID</div>
            <div class="yy-dropdown-item" data-action="bind-wallet">💳 绑定钱包</div>
            <div class="yy-dropdown-item" data-action="change-avatar">🖼️ 修改头像</div>
            <div class="yy-dropdown-item" data-action="logout">🚪 退出登录</div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        this._dropdown = overlay;

        box.querySelector('[data-action="change-username"]').onclick = () => { this._showUsernameModal({ isFirstTime: false }); overlay.remove(); };
        box.querySelector('[data-action="bind-wallet"]').onclick = () => { this._showBindWalletModal(); overlay.remove(); };
        box.querySelector('[data-action="change-avatar"]').onclick = () => { this._onChangeAvatar(); overlay.remove(); };
        box.querySelector('[data-action="logout"]').onclick = () => { window.YYCardAuth.signOut(); };
    },

    // ================= 1. 修改/创建游戏ID 弹窗 =================
    _showUsernameModal({ isFirstTime = false }) {
        if (this._currentModal) return;
        this._isFirstTimeModal = isFirstTime;
        const profile = window.YYCardAuth.currentProfile;
        const utils = window.YYCardUtils;
        const supabase = window.supabase;
        const auth = window.YYCardAuth;

        // 恢复冷却/改名卡判断逻辑
        const cooldown = utils.calculateCooldown(profile?.username_last_modified, window.YYCardConfig.RENAME_COOLDOWN_DAYS);
        const hasCard = (profile?.rename_card_count || 0) >= 1;
        let subtitle = '请输入 1-7 位小写字母或数字';
        let canChange = true;
        let needCard = false;

        if (isFirstTime) {
            subtitle = '🔔 首次登录，请设置您的专属游戏ID';
        } else {
            if (!cooldown.canChange && !hasCard) {
                canChange = false;
                subtitle = `修改冷却中（剩余 ${cooldown.remainingDays} 天），暂无改名卡`;
            } else if (!cooldown.canChange && hasCard) {
                needCard = true;
                subtitle = `冷却中（剩余 ${cooldown.remainingDays} 天），本次将消耗 1 张改名卡`;
            } else {
                subtitle = '修改后将重置冷却时间为 1 年';
            }
        }

        const modal = document.createElement('div');
        modal.className = 'yy-modal-overlay';
        modal.innerHTML = `
            <div class="yy-modal-box">
                <div class="yy-modal-title">
                    <span>${isFirstTime ? '🆔 创建ID' : '🆔 修改ID'}</span>
                    <span style="cursor:pointer;color:#8e8e93;font-size:1rem;" id="modal-username-close-alt">✕</span>
                </div>
                <div class="yy-modal-sub">${subtitle}</div>
                <input class="yy-input" id="username-input" type="text" placeholder="输入1-7位小写字母或数字" maxlength="7" ${!canChange ? 'disabled' : ''}>
                <div class="yy-actions">
                    <button class="yy-btn-main" id="modal-username-save" ${!canChange ? 'disabled' : ''}>${isFirstTime ? '确认创建' : '确认修改'}</button>
                    <button class="yy-btn-sec" id="modal-username-close">${isFirstTime ? '退出游戏' : '关闭'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this._currentModal = modal;

        const closeHandler = () => { modal.remove(); this._currentModal = null; this._isFirstTimeModal = false; if (isFirstTime) auth.signOut(); };
        document.getElementById('modal-username-close').onclick = closeHandler;
        document.getElementById('modal-username-close-alt').onclick = closeHandler;

        document.getElementById('modal-username-save').onclick = async () => {
            const nameInput = document.getElementById('username-input');
            const name = nameInput.value.trim();
            if (!name || !utils.isValidUsername(name)) { alert('格式错误，请输入1-7位小写字母或数字'); return; }

            const btn = document.getElementById('modal-username-save');
            btn.disabled = true; btn.textContent = '提交中...';

            const updateData = { username: name, username_last_modified: new Date().toISOString() };
            if (needCard) updateData.rename_card_count = (profile.rename_card_count || 0) - 1;

            const { error } = await supabase.from('profiles').update(updateData).eq('id', auth.currentUser.id);
            if (error) { alert('设置失败: ' + error.message); btn.disabled = false; return; }

            const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
            auth.currentProfile = data;
            modal.remove(); this._currentModal = null; this._isFirstTimeModal = false;
            this.update(); 
        };
    },

    // ================= 2. 绑定钱包 =================
    _showBindWalletModal() {
        if (this._currentModal) return;
        const modal = document.createElement('div');
        modal.className = 'yy-modal-overlay';
        modal.innerHTML = `
            <div class="yy-modal-box">
                <div class="yy-modal-title"><span>💳 绑定钱包</span><span style="cursor:pointer;color:#8e8e93;font-size:1rem;" id="modal-wallet-close-alt">✕</span></div>
                <div class="yy-modal-sub">请输入以太坊钱包地址 (0x开头，42位)</div>
                <input class="yy-input" id="wallet-input" type="text" placeholder="0x...">
                <div class="yy-actions">
                    <button class="yy-btn-main" id="modal-wallet-save">确认绑定</button>
                    <button class="yy-btn-sec" id="modal-wallet-close">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this._currentModal = modal;

        const closeModal = () => { modal.remove(); this._currentModal = null; };
        document.getElementById('modal-wallet-close').onclick = closeModal;
        document.getElementById('modal-wallet-close-alt').onclick = closeModal;

        document.getElementById('modal-wallet-save').onclick = async () => {
            const addr = document.getElementById('wallet-input').value.trim();
            if (!addr || !window.YYCardUtils.isValidEthAddress(addr)) { alert('无效的以太坊地址'); return; }
            const btn = document.getElementById('modal-wallet-save');
            btn.disabled = true; btn.textContent = '绑定中...';
            await this._updateProfileField('wallet_address', addr, '钱包已绑定');
            btn.disabled = false; btn.textContent = '确认绑定'; closeModal();
        };
    },

    // ================= 3. 修改头像 =================
    _onChangeAvatar() {
        if(!this._fileInput) {
            this._fileInput = document.createElement('input');
            this._fileInput.type = 'file'; this._fileInput.accept = 'image/*';
            this._fileInput.style.display = 'none';
            document.body.appendChild(this._fileInput);
            this._fileInput.onchange = (e) => this._uploadAvatar(e.target.files[0]);
        }
        this._fileInput.click();
    },

    async _uploadAvatar(file) {
        if (!file) return;
        const auth = window.YYCardAuth; const supabase = window.supabase;
        const utils = window.YYCardUtils; const config = window.YYCardConfig;
        const cooldown = utils.calculateCooldown(auth.currentProfile?.avatar_last_modified, config.AVATAR_COOLDOWN_DAYS);
        if (!cooldown.canChange) { alert('头像每15天只能修改一次'); return; }

        const ext = file.name.split('.').pop();
        const path = `${auth.currentUser.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
        if (upErr) { alert('上传失败: ' + upErr.message); return; }

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        await this._updateProfileField('avatar_url', urlData.publicUrl, '头像更新成功');
        await this._updateProfileField('avatar_last_modified', new Date().toISOString(), null);
    },

    async _updateProfileField(field, value, successMsg) {
        const auth = window.YYCardAuth; const supabase = window.supabase;
        const updateData = {}; updateData[field] = value;
        const { error } = await supabase.from('profiles').update(updateData).eq('id', auth.currentUser.id);
        if (error) { alert('操作失败: ' + error.message); return false; }
        const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
        auth.currentProfile = data; this.update(); if(successMsg) alert(successMsg); return true;
    }
};
console.log('✅ 终极无伤版修复：强制起名恢复 + 签到按钮永远顶在最上面！');
