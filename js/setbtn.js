// /js/setbtn.js
// 可复用的设置按钮模块，调用 YYCardSettingsBtn.init() 即可在页面右下角生成
(function () {
    'use strict';

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
        .genshin-settings-btn {
            position: fixed;
            right: 20px;
            bottom: 130px;
            width: 72px;
            height: 96px;
            border-radius: 22px;
            background: rgba(20,20,25,.45);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255,255,255,.08);
            box-shadow: inset 0 1px rgba(255,255,255,.10), inset 0 -8px 15px rgba(0,0,0,.18), 0 8px 20px rgba(0,0,0,.28);
            display: flex;
            justify-content: flex-start;
            align-items: center;
            flex-direction: column;
            cursor: pointer;
            z-index: 1000;
            transition: .25s;
            user-select: none;
        }
        .genshin-settings-btn:hover {
            transform: translateY(-2px) scale(1.03);
            background: rgba(25,25,30,.55);
        }
        .genshin-settings-btn:active {
            transform: scale(.96);
        }
        .genshin-settings-btn .icon-circle {
            width: 50px;
            height: 50px;
            margin-top: 10px;
            border-radius: 50%;
            background: radial-gradient(circle at 35% 25%, rgba(255,255,255,.08), rgba(255,255,255,0) 60%), rgba(15,15,18,.55);
            border: 1px solid rgba(255,255,255,.08);
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: inset 0 2px rgba(255,255,255,.05), 0 4px 10px rgba(0,0,0,.25);
        }
        .genshin-settings-btn .icon {
            width: 28px;
            height: 28px;
            color: white;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
        }
        .genshin-settings-btn .btn-text {
            margin-top: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1px;
        }
        .genshin-settings-btn .text-cn {
            font-size: 13px;
            color: rgba(255,255,255,.9);
            font-weight: 500;
            text-shadow: 0 1px 2px rgba(0,0,0,.4);
        }
        .genshin-settings-btn .text-en {
            font-size: 9px;
            color: rgba(255,255,255,.55);
            letter-spacing: 0.6px;
            text-transform: uppercase;
        }

        /* 设置面板 */
        .settings-panel-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            backdrop-filter: blur(4px);
            z-index: 2000;
            justify-content: center;
            align-items: center;
        }
        .settings-panel-overlay.active {
            display: flex;
        }
        .settings-panel-content {
            width: 85%;
            max-width: 380px;
            min-height: 260px;
            background: rgba(20,20,30,0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 28px;
            border: 1px solid rgba(255,215,0,0.15);
            padding: 24px 20px;
            color: white;
            box-shadow: 0 25px 50px rgba(0,0,0,0.6);
            animation: panelIn 0.25s ease;
        }
        @keyframes panelIn {
            from { opacity: 0; transform: scale(0.92) translateY(20px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .settings-panel-content h3 {
            margin: 0 0 20px;
            font-size: 20px;
            color: #ffd76a;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .settings-panel-content .close-btn {
            margin-left: auto;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.08);
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.2s;
        }
        .settings-panel-content .close-btn:hover {
            background: rgba(255,255,255,0.2);
        }
        .settings-item {
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 15px;
            cursor: pointer;
        }
        .settings-item:last-child {
            border-bottom: none;
        }
        .settings-item .item-label {
            opacity: 0.85;
        }
        .settings-item .item-value {
            opacity: 0.6;
            font-size: 14px;
        }
        .settings-item:hover {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding-left: 8px;
            padding-right: 8px;
            margin-left: -8px;
            margin-right: -8px;
        }
    `;
    document.head.appendChild(style);

    // 创建按钮 DOM
    function createBtn() {
        const btn = document.createElement('div');
        btn.className = 'genshin-settings-btn';
        btn.innerHTML = `
            <div class="icon-circle">
                <svg viewBox="0 0 24 24" class="icon">
                    <path fill="currentColor" d="M19.14,12.94a7.48,7.48,0,0,0,.05-.94,7.48,7.48,0,0,0-.05-.94l2.03-1.58a.5.5,0,0,0,.12-.64l-1.92-3.32a.5.5,0,0,0-.6-.22l-2.39.96a7.14,7.14,0,0,0-1.63-.94l-.36-2.54A.5.5,0,0,0,13.9,2H10.1a.5.5,0,0,0-.49.42L9.25,4.96a7.14,7.14,0,0,0-1.63.94L5.23,4.94a.5.5,0,0,0-.6.22L2.71,8.48a.5.5,0,0,0,.12.64l2.03,1.58a7.48,7.48,0,0,0-.05.94,7.48,7.48,0,0,0,.05.94L2.83,14.16a.5.5,0,0,0-.12.64l1.92,3.32a.5.5,0,0,0,.6.22l2.39-.96a7.14,7.14,0,0,0,1.63.94l.36,2.54a.5.5,0,0,0,.49.42h3.8a.5.5,0,0,0,.49-.42l.36-2.54a7.14,7.14,0,0,0,1.63-.94l2.39.96a.5.5,0,0,0,.6-.22l1.92-3.32a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
                </svg>
            </div>
            <div class="btn-text">
                <span class="text-cn">设置</span>
                <span class="text-en">Settings</span>
            </div>
        `;
        document.body.appendChild(btn);
        return btn;
    }

    // 创建设置面板（模态框）
    function createPanel() {
        const overlay = document.createElement('div');
        overlay.className = 'settings-panel-overlay';
        overlay.innerHTML = `
            <div class="settings-panel-content">
                <h3>
                    ⚙️ 设置
                    <span class="close-btn">✕</span>
                </h3>
                <div class="settings-list">
                    <div class="settings-item" onclick="alert('音效设置')">
                        <span class="item-label">🔊 音效</span>
                        <span class="item-value">开启</span>
                    </div>
                    <div class="settings-item" onclick="alert('音乐设置')">
                        <span class="item-label">🎵 音乐</span>
                        <span class="item-value">开启</span>
                    </div>
                    <div class="settings-item" onclick="alert('震动设置')">
                        <span class="item-label">📳 震动</span>
                        <span class="item-value">关闭</span>
                    </div>
                    <div class="settings-item" onclick="alert('画质设置')">
                        <span class="item-label">🖥️ 画质</span>
                        <span class="item-value">高</span>
                    </div>
                    <div class="settings-item" onclick="alert('账号管理')">
                        <span class="item-label">👤 账号</span>
                        <span class="item-value">管理</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 关闭事件
        const closeBtn = overlay.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            overlay.classList.remove('active');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });

        return overlay;
    }

    // 初始化
    window.YYCardSettingsBtn = {
        init: function () {
            // 避免重复初始化
            if (document.querySelector('.genshin-settings-btn')) return;

            const btn = createBtn();
            const panel = createPanel();

            btn.addEventListener('click', () => {
                panel.classList.add('active');
            });

            // 战斗或匹配时隐藏按钮的控制权可以交给外部，这里只负责创建
        },
        show: function () {
            const btn = document.querySelector('.genshin-settings-btn');
            if (btn) btn.style.display = 'flex';
        },
        hide: function () {
            const btn = document.querySelector('.genshin-settings-btn');
            if (btn) btn.style.display = 'none';
        }
    };
})();
