// ========== 大厅UI交互：高级感弹窗/下拉菜单 ==========
window.YYCardProfileUI = {
    // 存储当前打开的模态框/下拉菜单实例，方便关闭
    _currentModal: null,
    _dropdown: null,

    // 注入高级硬朗风格 CSS
    _injectStyles() {
        if (document.getElementById('profile-ui-style')) return;
        const s = document.createElement('style');
        s.id = 'profile-ui-style';
        s.textContent = `
            /* 深色硬朗直角风格 */
            .yy-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(6px);
                z-index: 99999; display: flex; align-items: center; justify-content: center;
            }
            .yy-modal-box {
                background: #1a1a1e; border-radius: 0px !important;
                padding: 30px 32px; width: 86%; max-width: 380px;
                box-shadow: 0 20px 48px rgba(0,0,0,0.8);
                border: 1px solid rgba(255,255,255,0.05);
                text-align: left; color: #f5f5f7;
            }
            .yy-modal-title { font-size: 1.2rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; }
            .yy-modal-sub { font-size: 0.9rem; color: #8e8e93; margin-bottom: 16px; }
            
            .yy-input { width: 100%; box-sizing: border-box; background: #2c2c2e; border: 1px solid rgba(255,255,255,0.1); padding: 14px 16px; color: white; font-size: 1rem; border-radius: 0px !important; outline: none; margin-bottom: 20px; }
            .yy-input:focus { border-color: #f0ad4e; }
            .yy-input::placeholder { color: #636366; }

            .yy-actions { display: flex; gap: 12px; }
            .yy-btn-main { flex: 1; background: #f0ad4e; border: none; padding: 14px 0; font-weight: 700; color: #1c1c1e; cursor: pointer; border-radius: 0px !important; transition: 0.2s; }
            .yy-btn-main:disabled { background: #3a3a3c; color: #636366; cursor: not-allowed; }
            .yy-btn-sec { flex: 0.5; background: transparent; border: 1px solid rgba(255,255,255,0.1); padding: 14px 0; color: #8e8e93; cursor: pointer; border-radius: 0px !important; }
            .yy-btn-sec:active { background: #2c2c2e; }

            /* 头像下拉菜单 */
            .yy-dropdown-overlay { position: fixed; z-index: 99998; background: transparent; top:0; left:0; width:100%; height:100%; }
            .yy-dropdown-box {
                position: absolute; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.06);
                box-shadow: 0 8px 24px rgba(0,0,0,0.6); border-radius: 0px !important;
                min-width: 150px; display: flex; flex-direction: column; padding: 8px 0;
                top: 75px; left: 20px;
            }
            .yy-dropdown-item {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 20px; color: #e5e5ea; font-size: 0.9rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            .yy-dropdown-item:last-child { border-bottom: none; color: #ff453a; }
            .yy-dropdown-item:hover { background: #2c2c2e; }
        `;
        document.head.appendChild(s);
    },

    // 更新UI
    update() {
        const profile = window.YYCardAuth.currentProfile;
        const user = window.YYCardAuth.currentUser;
        if (!profile) return;

        const avatarSrc = profile.avatar_url || user?.user_metadata?.avatar_url || window.YYCardConfig.DEFAULT_AVATAR;
        
        // 更新展示
        const avatarImg = document.getElementById('lobby-avatar');
        if(avatarImg) {
            avatarImg.src = avatarSrc;
            avatarImg.style.cursor = 'pointer'; // 提示可点击
            avatarImg.onclick = (e) => {
                e.stopPropagation();
                this._toggleDropdown(avatarImg);
            };
        }

        document.getElementById('lobby-username').textContent = 
            profile.username || profile.display_name || user.email || '未设置ID';
        document.getElementById('lobby-wallet').textContent = 
            profile.wallet_address ? window.YYCardUtils.formatAddress(profile.wallet_address) : '未绑定钱包';
        document.getElementById('lobby-card-count').textContent = `改名卡：${profile.rename_card_count || 0}张`;

        const btn = document.getElementById('start-match-btn');
        btn.disabled = !profile.username;
        btn.textContent = profile.username ? '⚡ 开始匹配' : '请先设置游戏ID';

        // ⭐ 核心逻辑：首次登录（无username时）自动弹出起名框
        if (!profile.username && !this._isModalOpen) {
            this._showUsernameModal({ isFirstTime: true });
        }
    },

    // 切换下拉菜单
    _toggleDropdown(avatarEl) {
        if (this._dropdown) {
            this._dropdown.remove();
            this._dropdown = null;
            return;
        }
        this._dropdown = document.createElement('div');
        this._dropdown.className = 'yy-dropdown-overlay';
        this._dropdown.onclick = () => this._dropdown.remove(); // 点击空白处关闭

        const box = document.createElement('div');
        box.className = 'yy-dropdown-box';
        // 用 avatarEl 的坐标定位
        const rect = avatarEl.getBoundingClientRect();
        box.style.top = (rect.bottom + 10) + 'px';
        box.style.left = rect.left + 'px';
        box.style.minWidth = '160px';

        box.innerHTML = `
            <div class="yy-dropdown-item" id="dropdown-bind-wallet">💳 绑定钱包</div>
            <div class="yy-dropdown-item" id="dropdown-change-avatar">🖼️ 修改头像</div>
            <div class="yy-dropdown-item" id="dropdown-change-username">🔤 修改游戏ID</div>
            <div class="yy-dropdown-item" id="dropdown-logout">🚪 登出</div>
        `;
        
        this._dropdown.appendChild(box);
        document.body.appendChild(this._dropdown);

        // 下拉菜单内事件绑定
        document.getElementById('dropdown-bind-wallet').onclick = () => { this._onBindWallet(); this._dropdown.remove(); };
        document.getElementById('dropdown-change-avatar').onclick = () => { this._onChangeAvatar(); this._dropdown.remove(); };
        document.getElementById('dropdown-change-username').onclick = () => { this._showUsernameModal({ isFirstTime: false }); this._dropdown.remove(); };
        document.getElementById('dropdown-logout').onclick = () => { window.YYCardAuth.signOut(); };
    },

    // 绑定额外部事件（设定头像模态框、关闭等）
    bindEvents() {
        this._injectStyles();
        // 由于更新操作都在内部了，这里无需额外绑定像之前那么多的单独按钮
    },

    // ========== 弹出：设置/修改游戏ID 模态框 ==========
    _showUsernameModal({ isFirstTime = false }) {
        if (this._currentModal) return;
        this._isModalOpen = true;
        const profile = window.YYCardAuth.currentProfile;
        const utils = window.YYCardUtils;
        const config = window.YYCardConfig;
        const supabase = window.supabase;
        const auth = window.YYCardAuth;

        const cooldown = utils.calculateCooldown(profile?.username_last_modified, config.RENAME_COOLDOWN_DAYS);
        const hasCard = (profile?.rename_card_count || 0) >= 1;
        
        let subtitle = '请输入 1-7 位小写字母或数字';
        let canChange = true;
        let needCard = false;

        if (isFirstTime) {
            subtitle = '🔔 首次登录，请设置您的游戏ID';
        } else {
            if (!cooldown.canChange && !hasCard) {
                canChange = false;
                subtitle = `修改冷却中，剩余 ${cooldown.remainingDays} 天，暂无改名卡`;
            } else if (!cooldown.canChange && hasCard) {
                needCard = true;
                subtitle = `冷却中 (${cooldown.remainingDays}天)，本次修改将消耗 1 张改名卡`;
            } else {
                subtitle = '修改游戏ID，冷却将重置为 1 年';
            }
        }

        const modal = document.createElement('div');
        modal.className = 'yy-modal-overlay';
        modal.innerHTML = `
            <div class="yy-modal-box">
                <div class="yy-modal-title">${isFirstTime ? '🆔 创建游戏ID' : '🆔 修改游戏ID'}</div>
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

        // 如果是首次登录且不想设置，直接退出（登出）
        document.getElementById('modal-username-close').onclick = () => {
            modal.remove(); this._currentModal = null; this._isModalOpen = false;
            if (isFirstTime) auth.signOut(); 
        };

        document.getElementById('modal-username-save').onclick = async () => {
            const nameInput = document.getElementById('username-input');
            const name = nameInput.value.trim();
            if (!name) { alert('请输入游戏ID'); return; }
            if (!utils.isValidUsername(name)) { alert('格式错误，必须是1-7位小写字母或数字'); return; }

            const btn = document.getElementById('modal-username-save');
            btn.disabled = true; btn.textContent = '提交中...';

            const updateData = { username: name, username_last_modified: new Date().toISOString() };
            if (needCard) { updateData.rename_card_count = (profile.rename_card_count || 0) - 1; }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', auth.currentUser.id);

            if (error) {
                alert('设置失败: ' + error.message);
                btn.disabled = false; btn.textContent = '确认创建';
                return;
            }

            // 更新全局数据
            const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
            auth.currentProfile = data;
            
            modal.remove(); this._currentModal = null; this._isModalOpen = false;
            this.update(); // 刷新大厅界面
            
            if (isFirstTime) {
                auth.log(`首次设置用户名成功: ${name}`);
            } else if (needCard) {
                auth.log(`用户名修改成功: ${name}，剩余${data.rename_card_count}张改名卡`);
            } else {
                auth.log(`用户名修改成功: ${name}，冷却重置`);
            }
        };
    },

    // ========== 弹出：绑定钱包（直接复用当前界面逻辑，但优化UI在内部实现） ==========
    _onBindWallet() {
        const addr = prompt('请输入以太坊钱包地址 (0x开头，42位):');
        if (!addr) return;
        if (!window.YYCardUtils.isValidEthAddress(addr)) { alert('无效的以太坊地址'); return; }
        this._updateProfileField('wallet_address', addr, '钱包已绑定');
    },

    // ========== 触发：修改头像 ==========
    _onChangeAvatar() {
        // 直接调用原逻辑，无需改动，只需触发隐藏的 input。
        // 但建议把 fileInput 放到 UI 菜单里。
        if(!this._fileInput) {
            this._fileInput = document.createElement('input');
            this._fileInput.type = 'file';
            this._fileInput.accept = 'image/*';
            this._fileInput.style.display = 'none';
            document.body.appendChild(this._fileInput);
            this._fileInput.onchange = () => this._uploadAvatar(this._fileInput.files[0]);
        }
        this._fileInput.click();
    },

    async _uploadAvatar(file) {
        if (!file) return;
        const auth = window.YYCardAuth;
        const supabase = window.supabase;
        const utils = window.YYCardUtils;
        const config = window.YYCardConfig;

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

    // 通用更新字段方法
    async _updateProfileField(field, value, successMsg) {
        const auth = window.YYCardAuth;
        const supabase = window.supabase;
        const updateData = {};
        updateData[field] = value;

        const { error } = await supabase.from('profiles').update(updateData).eq('id', auth.currentUser.id);
        if (error) { alert('操作失败: ' + error.message); return false; }

        const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
        auth.currentProfile = data;
        this.update();
        if(successMsg) { alert(successMsg); auth.log(`${field}: ${value}`); }
        return true;
    }
};

console.log('✅ profile-ui.js 高级重构版加载完成');
