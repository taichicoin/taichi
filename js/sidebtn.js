// /js/sidebtn.js —— 通用侧边按钮工厂（公告、设置、邮箱、帮助等复用）
(function () {
    'use strict';

    // 注入公共样式（只执行一次）
    if (!document.getElementById('sidebtn-common-style')) {
        const style = document.createElement('style');
        style.id = 'sidebtn-common-style';
        style.textContent = `
            /* ========= 通用侧边按钮 ========= */
            .genshin-side-btn {
                position: fixed;
                right: 20px;
                z-index: 1000;
                width: 72px;
                height: 94px;
                border-radius: 24px;
                background: linear-gradient(180deg, rgba(60,60,65,.55), rgba(18,18,20,.48));
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                border: 1px solid rgba(255,255,255,.08);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.12),
                            inset 0 -10px 15px rgba(0,0,0,.15),
                            0 10px 20px rgba(0,0,0,.28);
                display: flex;
                justify-content: flex-start;
                align-items: center;
                cursor: pointer;
                user-select: none;
                transition: 0.25s;
            }
            .genshin-side-btn:hover {
                transform: translateY(-2px);
                background: linear-gradient(180deg, rgba(70,70,75,.65), rgba(25,25,28,.55));
            }
            .genshin-side-btn:active {
                transform: scale(0.96);
            }
            .icon-wrap {
                width: 40px;          /* 58px * 0.7 ≈ 40px，缩小30% */
                height: 40px;
                margin: 6px auto 0;   /* 顶部对齐，左右居中 */
                border-radius: 50%;
                background: radial-gradient(circle at 35% 28%, rgba(255,255,255,.10), rgba(255,255,255,0) 60%),
                            rgba(20,20,24,.55);
                border: 1px solid rgba(255,255,255,.06);
                display: flex;
                justify-content: center;
                align-items: center;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.08),
                            0 3px 10px rgba(0,0,0,.28);
            }
            .icon-wrap .icon {
                width: 24px;           /* 同步缩小图标尺寸 */
                height: 24px;
                color: white;
                opacity: 0.95;
                filter: drop-shadow(0 1px 2px rgba(0,0,0,.35));
            }
            .btn-text {
                position: absolute;
                bottom: 8px;
                width: 100%;
                text-align: center;
                color: #fff;
                font-size: 15px;
                font-weight: 600;
                letter-spacing: 1px;
                text-shadow: 0 1px 3px rgba(0,0,0,.45);
            }
            /* 面板容器（可复用） */
            .side-panel-overlay {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.4);
                backdrop-filter: blur(4px);
                z-index: 2000;
                justify-content: center;
                align-items: center;
            }
            .side-panel-overlay.active {
                display: flex;
            }
            .side-panel-content {
                width: 85%;
                max-width: 380px;
                min-height: 260px;
                background: rgba(20,20,30,0.95);
                backdrop-filter: blur(20px);
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
            .side-panel-content h3 {
                margin: 0 0 20px;
                font-size: 20px;
                color: #ffd76a;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .side-panel-content .close-btn {
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
            .side-panel-content .close-btn:hover {
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
    }

    // 按钮工厂
    window.YYCardSideBtn = {
        /**
         * 创建一个侧边按钮
         * @param {Object} options
         * @param {string} options.iconSvg - 图标 SVG 字符串 (viewBox 0 0 24 24)
         * @param {string} options.text - 按钮底部文字
         * @param {number} options.bottom - 距离底部位置（px），默认130（设置按钮位置），公告可放在230等
         * @param {Function} options.onClick - 点击事件处理函数
         * @returns {HTMLElement} 按钮 DOM
         */
        create: function(options) {
            const { iconSvg, text, bottom = 130, onClick } = options;

            const btn = document.createElement('div');
            btn.className = 'genshin-side-btn';
            btn.style.bottom = bottom + 'px';
            btn.innerHTML = `
                <div class="icon-wrap">
                    <div class="icon">${iconSvg}</div>
                </div>
                <div class="btn-text">${text}</div>
            `;
            if (onClick) {
                btn.addEventListener('click', onClick);
            }
            document.body.appendChild(btn);
            return btn;
        },

        /**
         * 快速创建一个带面板的按钮（例如设置、公告）
         * @param {Object} options
         * @param {string} options.iconSvg
         * @param {string} options.title - 面板标题
         * @param {string} options.contentHtml - 面板内容 HTML
         * @param {number} options.bottom
         */
        createWithPanel: function(options) {
            const { iconSvg, title, contentHtml, bottom, text } = options;

            // 创建面板
            const overlay = document.createElement('div');
            overlay.className = 'side-panel-overlay';
            overlay.innerHTML = `
                <div class="side-panel-content">
                    <h3>${title}
                        <span class="close-btn">✕</span>
                    </h3>
                    <div>${contentHtml}</div>
                </div>
            `;
            document.body.appendChild(overlay);

            const closeBtn = overlay.querySelector('.close-btn');
            const closePanel = () => overlay.classList.remove('active');
            closeBtn.addEventListener('click', closePanel);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closePanel();
            });

            // 创建按钮
            return this.create({
                iconSvg,
                text,
                bottom,
                onClick: () => overlay.classList.add('active')
            });
        }
    };
})();
