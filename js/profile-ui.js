// ========== 大厅UI交互（中英双语版，移除修改头像，新增邮箱显示） ==========
window.YYCardProfileUI = {
    _dropdown: null,
    _currentModal: null,
    _avatarClickTarget: null,
    L: window.YYCardLobbyLang, // 语言包引用

    _injectStyles() {
        if (document.getElementById('profile-ui-advanced-styles')) return;
        const s = document.createElement('style');
        s.id = 'profile-ui-advanced-styles';
        s.textContent = `
            #lobby-avatar { pointer-events: none !important; }
            #avatar-click-target {
                position: absolute; cursor: pointer; z-index: 10;
                background: transparent; border-radius: 50%;
            }
            .yy-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
                z-index: 99999; display: flex; align-items: center; justify-content: center;
            }
            .yy-modal-box {
                background: #1a1a1e; border-radius: 0px !important;
                padding: 28px 32px; width: 86%; max-width: 380px;
                box-shadow: 0 16px 48px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.06);
                text-align: left; color: #f5f5f7; position: relative;
            }
            .yy-modal-title { font-size: 1.1rem; font-weight: 600; letter-spacing: 1px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .yy-modal-sub { font-size: 0.9rem; color: #8e8e93; margin-bottom: 16px; }
            .yy-input { width: 100%; box-sizing: border-box; background: #2c2c2e; border: 1px solid rgba(255,255,255,0.08); padding: 14px 16px; color: white; font-size: 1rem; border-radius: 0px !important; outline: none; margin-bottom: 20px; }
            .yy-input:focus { border-color: #f0ad4e; background: #333336; }
            .yy-input::placeholder { color: #636366; }
            .yy-actions { display: flex; gap: 12px; }
            .yy-btn-main { flex: 1; background: #f0ad4e; border: none; padding: 14px 0; font-weight: 700; color: #1c1c1e; cursor: pointer; border-radius: 0px !important; transition: 0.2s; }
            .yy-btn-main:disabled { background: #3a3a3c; color: #636366; cursor: not-allowed; }
            .yy-btn-sec { flex: 0.5; background: transparent; border: 1px solid rgba(255,255,255,0.1); padding: 14px 0; color: #8e8e93; cursor: pointer; border-radius: 0px !important; }
            .yy-btn-sec:active { background: #2c2c2e; }
            .yy-dropdown-overlay { position: fixed; z-index: 99998; top:0; left:0; width:100%; height:100%; background: transparent; }
            .yy-dropdown-box {
                position: absolute; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.06);
                box-shadow: 0 8px 24px rgba(0,0,0,0.6); border-radius: 0px !important;
                min-width: 150px; display: flex; flex-direction: column; padding: 6px 0;
            }
            .yy-dropdown-item {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 20px; color: #e5e5ea; font-size: 0.9rem; cursor: pointer;
                border-bottom: 1px solid rgba(255,255,255,0.03);
            }
            .yy-dropdown-item:last-child { border-bottom: none; color: #ff453a; }
            .yy-dropdown-item:hover { background: #2c2c2e; }
            .yy-dropdown-item.readonly {
                cursor: default;
                opacity: 0.6;
                pointer-events: none;
            }
        `;
        document.head.appendChild(s);
    },

    update() {
        const profile = window.YYCardAuth.currentProfile;
        const user = window.YYCardAuth.currentUser;
        const L = this.L;
        if (!profile) return;

        const avatarSrc = profile.avatar_url || user?.user_metadata?.avatar_url || window.YYCardConfig.DEFAULT_AVATAR;
        const avatarImg = document.getElementById('lobby-avatar');
        if (avatarImg) avatarImg.src = avatarSrc;

        document.getElementById('lobby-username').textContent =
            profile.username || profile.display_name || user.email || L.t('lobby_no_username');
        document.getElementById('lobby-wallet').textContent =
            profile.wallet_address ? window.YYCardUtils.formatAddress(profile.wallet_address) : L.t('lobby_no_wallet');
        document.getElementById('lobby-card-count').textContent =
            L.t('lobby_rename_cards', { count: profile.rename_card_count || 0 });

        const btn = document.getElementById('start-match-btn');
        btn.disabled = !profile.username;
        btn.textContent = profile.username ? L.t('match_btn_ready') : L.t('match_btn_no_id');

        if (!profile.username && !this._currentModal) {
            this._showUsernameModal({ isFirstTime: true });
        }

        this._updateAvatarClickTarget();
    },

    bindEvents() {
        this._injectStyles();
        this._createAvatarClickTarget();
    },

    _createAvatarClickTarget() {
        const avatarImg = document.getElementById('lobby-avatar');
        if (!avatarImg) return;
        if (document.getElementById('avatar-click-target')) return;
        const parent = avatarImg.parentNode;
        if (parent) parent.style.position = 'relative';
        const target = document.createElement('div');
        target.id = 'avatar-click-target';
        target.style.cssText = 'position: absolute; cursor: pointer; z-index: 10; background: transparent; border-radius: 50%;';
        if (parent) {
            parent.appendChild(target);
        } else {
            avatarImg.insertAdjacentElement('afterend', target);
        }
        this._avatarClickTarget = target;
        target.onclick = (e) => {
            e.stopPropagation();
            this._toggleDropdown(avatarImg);
        };
        this._updateAvatarClickTarget();
    },

    _updateAvatarClickTarget() {
        const target = this._avatarClickTarget || document.getElementById('avatar-click-target');
        const avatarImg = document.getElementById('lobby-avatar');
        if (!target || !avatarImg) return;
        const parent = avatarImg.parentNode;
        if (parent && !parent.style.position) parent.style.position = 'relative';
        target.style.left = avatarImg.offsetLeft + 'px';
        target.style.top = avatarImg.offsetTop + 'px';
        target.style.width = avatarImg.offsetWidth + 'px';
        target.style.height = avatarImg.offsetHeight + 'px';
    },

    _toggleDropdown(avatarEl) {
        if (this._dropdown) {
            this._dropdown.remove();
            this._dropdown = null;
            return;
        }
        const L = this.L;
        const auth = window.YYCardAuth;
        const overlay = document.createElement('div');
        overlay.className = 'yy-dropdown-overlay';
        overlay.onclick = () => { overlay.remove(); this._dropdown = null; };

        const box = document.createElement('div');
        box.className = 'yy-dropdown-box';
        const rect = avatarEl.getBoundingClientRect();
        box.style.top = (rect.bottom + 8) + 'px';
        box.style.left = (rect.left - 20) + 'px';

        // 构建用户邮箱文本
        const user = auth.currentUser;
        const profile = auth.currentProfile;
        let emailText = '';
        if (user?.email) {
            emailText = user.email;
        } else if (profile?.telegram_id) {
            emailText = `Telegram #${profile.telegram_id}`;
        } else {
            emailText = L.t('menu_no_email');   // 可在语言包中添加
        }
        const emailDisplay = L.t('menu_email_display', { email: emailText });

        const isTelegram = window.Telegram?.WebApp?.initData;
        const items = [
            { action: 'change-username', label: L.t('menu_change_username') },
            { action: 'bind-wallet',     label: L.t('menu_bind_wallet') },
            // 移除修改头像，替换为邮箱显示（只读）
            { action: 'show-email',      label: `📧 ${emailDisplay}`, readonly: true }
        ];
        if (!isTelegram) {
            items.push({ action: 'logout', label: L.t('menu_logout') });
        }

        box.innerHTML = items.map(item => {
            const cls = item.readonly ? 'yy-dropdown-item readonly' : 'yy-dropdown-item';
            return `<div class="${cls}" data-action="${item.action}">${item.label}</div>`;
        }).join('');
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        this._dropdown = overlay;

        // 绑定可点击事件（忽略只读邮箱项）
        const changeUsername = box.querySelector('[data-action="change-username"]');
        const bindWallet = box.querySelector('[data-action="bind-wallet"]');
        const logoutBtn = box.querySelector('[data-action="logout"]');

        if (changeUsername) {
            changeUsername.onclick = () => {
                this._showUsernameModal({ isFirstTime: false });
                overlay.remove();
                this._dropdown = null;
            };
        }
        if (bindWallet) {
            bindWallet.onclick = () => {
                this._showBindWalletModal();
                overlay.remove();
                this._dropdown = null;
            };
        }
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                overlay.remove();
                this._dropdown = null;
                const matchmaking = window.YYCardMatchmaking;
                auth.log('🔚 正在登出...');
                if (matchmaking?.leaveAndClean) await matchmaking.leaveAndClean();
                await auth.signOut();
                window.location.href = window.YYCardConfig.LOGIN_PAGE_URL;
            };
        }
    },

    // ---------- 以下弹窗保持不变，仅移除头像相关方法 ----------

    _showUsernameModal({ isFirstTime = false }) {
        // ... 与之前完全相同的代码 ...
    },

    _showBindWalletModal() {
        // ... 与之前完全相同的代码 ...
    },

    async _updateProfileField(field, value, successMsg) {
        const L = this.L;
        const auth = window.YYCardAuth;
        const supabase = window.supabase;
        const updateData = {}; updateData[field] = value;

        const { error } = await supabase.from('profiles').update(updateData).eq('id', auth.currentUser.id);
        if (error) { alert(L.t('wallet_fail', { message: error.message })); return false; }

        const { data } = await supabase.from('profiles').select('*').eq('id', auth.currentUser.id).single();
        auth.currentProfile = data;
        this.update();
        if (successMsg) alert(successMsg);
        return true;
    }
};

console.log('✅ 头像菜单已双语化，修改头像功能已替换为邮箱显示');
