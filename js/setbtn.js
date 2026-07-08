// /js/setbtn.js —— 设置按钮（语言切换功能）
window.YYCardSettings = (function() {
    'use strict';

    let supabase = null;
    let currentLang = 'en'; // 默认中文

    // 图标 SVG
    const settingsSvg = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor"
                d="M19.14,12.94a7.48,7.48,0,0,0,.05-.94,7.48,7.48,0,0,0-.05-.94l2.03-1.58a.5.5,0,0,0,.12-.64l-1.92-3.32a.5.5,0,0,0-.6-.22l-2.39.96a7.14,7.14,0,0,0-1.63-.94l-.36-2.54A.5.5,0,0,0,13.9,2H10.1a.5.5,0,0,0-.49.42L9.25,4.96a7.14,7.14,0,0,0-1.63.94L5.23,4.94a.5.5,0,0,0-.6.22L2.71,8.48a.5.5,0,0,0,.12.64l2.03,1.58a7.48,7.48,0,0,0-.05.94,7.48,7.48,0,0,0,.05.94L2.83,14.16a.5.5,0,0,0-.12.64l1.92,3.32a.5.5,0,0,0,.6.22l2.39-.96a7.14,7.14,0,0,0,1.63.94l.36,2.54a.5.5,0,0,0,.49.42h3.8a.5.5,0,0,0,.49-.42l.36-2.54a7.14,7.14,0,0,0,1.63-.94l2.39.96a.5.5,0,0,0,.6-.22l1.92-3.32a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
        </svg>`;

    // 刷新面板中的语言显示
    function updateLangDisplay() {
        const langTextEl = document.getElementById('lang-text-display');
        if (langTextEl) {
            langTextEl.textContent = currentLang === 'zh' ? '中文' : 'English';
        }
    }

    // 切换语言
    async function toggleLanguage() {
        if (!supabase) return;

        const auth = window.YYCardAuth;
        if (!auth || !auth.currentUser) {
            console.warn('未登录，无法切换语言');
            return;
        }

        const newLang = currentLang === 'zh' ? 'en' : 'zh';
        const userId = auth.currentUser.id;

        const { error } = await supabase
            .from('profiles')
            .update({ language: newLang })
            .eq('id', userId);

        if (error) {
            console.error('语言更新失败:', error);
            return;
        }

        // 更新本地状态
        currentLang = newLang;
        if (auth.currentProfile) {
            auth.currentProfile.language = newLang;
        }

        // 更新显示
        updateLangDisplay();
        console.log('语言已切换为', newLang);
    }

    // 初始化
    function init(supabaseClient, container) {
        supabase = supabaseClient;

        // 读取当前语言（优先从已登录用户的 profile 中获取）
        const auth = window.YYCardAuth;
        if (auth && auth.currentProfile && auth.currentProfile.language) {
            currentLang = auth.currentProfile.language;
        }

        // 使用工厂创建设置按钮，面板内容包含语言切换
        const { btn, overlay } = window.YYCardSideBtn.createWithPanel({
            iconSvg: settingsSvg,
            text: '设置',
            title: '游戏设置',
            panelId: 'settings-panel',   // 方便查找
            contentHtml: `
                <div class="settings-item" id="lang-switch-btn">
                    <span>语言设置</span>
                    <span id="lang-text-display" style="opacity:0.8">${currentLang === 'zh' ? '中文' : 'English'}</span>
                </div>
                <!-- 其他设置项可后续添加 -->
            `,
            appendTo: container
        });

        // 绑定语言切换事件
        const langSwitchBtn = overlay.querySelector('#lang-switch-btn');
        if (langSwitchBtn) {
            langSwitchBtn.addEventListener('click', toggleLanguage);
        }

        // 每次打开面板时，同步语言显示（防止其他位置修改了语言）
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // 关闭面板，不处理
            }
        });
        // 更稳健：观察面板打开，更新显示
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.target === overlay && mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (overlay.classList.contains('active')) {
                        // 从全局状态同步语言，并更新显示
                        if (auth && auth.currentProfile && auth.currentProfile.language) {
                            currentLang = auth.currentProfile.language;
                        }
                        updateLangDisplay();
                    }
                }
            });
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

        return { btn, overlay };
    }

    return { init };
})();
