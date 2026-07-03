// ==================== 房间/备战页面模块 ====================
window.YYCardRoom = (function() {
    let roomOverlay = null;

    // 创建房间页面 DOM
    function createRoomUI(modeName = '排位赛') {
        const overlay = document.createElement('div');
        overlay.id = 'room-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 2000;
            background: linear-gradient(135deg, #0a0f1c 0%, #1a2a4a 50%, #0f1b2e 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', Roboto, sans-serif;
            color: #f0f0f0;
        `;

        // 顶部装饰线
        const topLine = document.createElement('div');
        topLine.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #f5d76e, #f0b34b, #f5d76e);
        `;
        overlay.appendChild(topLine);

        // 返回按钮
        const backBtn = document.createElement('button');
        backBtn.textContent = '← 返回';
        backBtn.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: #f0f0f0;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 1rem;
            cursor: pointer;
            z-index: 10;
        `;
        backBtn.onclick = closeRoom;
        overlay.appendChild(backBtn);

        // 主内容区
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6vh;
        `;

        // 模式名称标签
        const modeTag = document.createElement('div');
        modeTag.textContent = modeName;
        modeTag.style.cssText = `
            background: linear-gradient(135deg, #f5d76e, #f0b34b);
            color: #0a0f1c;
            padding: 8px 30px;
            border-radius: 30px;
            font-size: 1rem;
            font-weight: bold;
            letter-spacing: 2px;
            text-transform: uppercase;
        `;
        content.appendChild(modeTag);

        // 头像容器
        const avatarWrapper = document.createElement('div');
        avatarWrapper.style.cssText = `
            position: relative;
            width: 35vw;
            height: 35vw;
            max-width: 180px;
            max-height: 180px;
            border-radius: 50%;
            border: 3px solid #f5d76e;
            box-shadow: 0 0 40px rgba(245, 215, 110, 0.3), 0 0 80px rgba(245, 215, 110, 0.1);
            overflow: hidden;
        `;
        const avatarImg = document.createElement('img');
        const profile = window.YYCardAuth?.currentProfile;
        avatarImg.src = profile?.avatar_url || '/assets/default-avatar.png';
        avatarImg.onerror = () => { avatarImg.src = '/assets/default-avatar.png'; };
        avatarImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
        `;
        avatarWrapper.appendChild(avatarImg);

        // 头像外圈光环
        const glowRing = document.createElement('div');
        glowRing.style.cssText = `
            position: absolute;
            top: -8px;
            left: -8px;
            right: -8px;
            bottom: -8px;
            border-radius: 50%;
            border: 2px solid rgba(245, 215, 110, 0.3);
            animation: room-glow-pulse 2s ease-in-out infinite;
        `;
        avatarWrapper.appendChild(glowRing);
        content.appendChild(avatarWrapper);

        // 玩家名称
        const nameEl = document.createElement('div');
        nameEl.textContent = profile?.display_name || profile?.username || '玩家';
        nameEl.style.cssText = `
            font-size: 1.6rem;
            font-weight: bold;
            color: #f5d76e;
            text-shadow: 0 0 20px rgba(245, 215, 110, 0.4);
        `;
        content.appendChild(nameEl);

        // 状态文字
        const statusEl = document.createElement('div');
        statusEl.id = 'room-status-text';
        statusEl.textContent = '准备就绪';
        statusEl.style.cssText = `
            font-size: 0.9rem;
            color: #8e8e93;
            letter-spacing: 1px;
        `;
        content.appendChild(statusEl);

        overlay.appendChild(content);

        // 底部开始按钮
        const startBtn = document.createElement('button');
        startBtn.id = 'room-start-btn';
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = `
            position: absolute;
            bottom: 15vh;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #f5d76e, #f0b34b);
            color: #0a0f1c;
            border: none;
            padding: 16px 60px;
            border-radius: 40px;
            font-size: 1.2rem;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 8px 30px rgba(245, 215, 110, 0.3);
            transition: transform 0.15s, box-shadow 0.15s;
            letter-spacing: 1px;
        `;
        startBtn.onmouseenter = () => {
            startBtn.style.transform = 'translateX(-50%) scale(1.05)';
            startBtn.style.boxShadow = '0 12px 40px rgba(245, 215, 110, 0.5)';
        };
        startBtn.onmouseleave = () => {
            startBtn.style.transform = 'translateX(-50%) scale(1)';
            startBtn.style.boxShadow = '0 8px 30px rgba(245, 215, 110, 0.3)';
        };
        startBtn.onclick = startMatchFromRoom;
        overlay.appendChild(startBtn);

        return overlay;
    }

    // 打开房间页面
    function openRoom(modeName) {
        if (roomOverlay) return;
        roomOverlay = createRoomUI(modeName);
        document.body.appendChild(roomOverlay);
        // 添加动画关键帧
        if (!document.getElementById('room-anim-style')) {
            const style = document.createElement('style');
            style.id = 'room-anim-style';
            style.textContent = `
                @keyframes room-glow-pulse {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.03); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 关闭房间页面
    function closeRoom() {
        if (roomOverlay) {
            roomOverlay.remove();
            roomOverlay = null;
        }
        // 取消匹配（如果正在进行）
        if (window.YYCardMatchmaking) {
            window.YYCardMatchmaking.cancel();
        }
    }

    // 从房间开始匹配
    async function startMatchFromRoom() {
        const btn = document.getElementById('room-start-btn');
        const statusEl = document.getElementById('room-status-text');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ 匹配中...';
            btn.style.opacity = '0.6';
        }
        if (statusEl) {
            statusEl.textContent = '正在寻找对手...';
        }

        // 更新匹配状态显示
        const updateMatchStatus = () => {
            const matchStatus = document.getElementById('match-status');
            if (matchStatus && statusEl) {
                statusEl.textContent = matchStatus.textContent || '匹配中...';
            }
        };

        // 监听匹配状态变化
        const statusObserver = new MutationObserver(updateMatchStatus);
        const matchStatusEl = document.getElementById('match-status');
        if (matchStatusEl) {
            statusObserver.observe(matchStatusEl, { characterData: true, childList: true, subtree: true });
        }

        // 监听战斗进入，自动关闭房间
        const battleObserver = new MutationObserver(() => {
            const battleView = document.getElementById('battle-view');
            if (battleView && battleView.style.display === 'block') {
                closeRoom();
                battleObserver.disconnect();
                statusObserver.disconnect();
            }
        });
        const battleView = document.getElementById('battle-view');
        if (battleView) {
            battleObserver.observe(battleView, { attributes: true, attributeFilter: ['style'] });
        }

        // 调用原有匹配系统
        if (window.YYCardMatchmaking) {
            try {
                await window.YYCardMatchmaking.start();
            } catch (e) {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '⚡ 开始匹配';
                    btn.style.opacity = '1';
                }
                if (statusEl) statusEl.textContent = '匹配失败，请重试';
                statusObserver.disconnect();
                battleObserver.disconnect();
            }
        }

        // 兜底：10秒后恢复按钮（防止匹配系统无响应）
        setTimeout(() => {
            if (btn && btn.disabled) {
                btn.disabled = false;
                btn.textContent = '⚡ 开始匹配';
                btn.style.opacity = '1';
                if (statusEl && statusEl.textContent === '正在寻找对手...') {
                    statusEl.textContent = '准备就绪';
                }
            }
            statusObserver.disconnect();
        }, 10000);
    }

    // 初始化：替换大厅的匹配按钮行为
    function init() {
        const matchBtn = document.getElementById('start-match-btn');
        if (!matchBtn) return;

        // 保存原始点击事件
        const originalClick = matchBtn.onclick;

        // 替换为打开房间
        matchBtn.onclick = () => {
            openRoom('排位赛');
        };

        // 保留取消匹配按钮的功能（在房间内取消时也会触发）
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) {
            const originalCancel = cancelBtn.onclick;
            cancelBtn.onclick = () => {
                closeRoom();
                if (originalCancel) originalCancel();
            };
        }
    }

    return {
        openRoom,
        closeRoom,
        init
    };
})();
