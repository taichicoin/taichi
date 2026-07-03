// ==================== 房间/备战页面模块（安全初始化） ====================
window.YYCardRoom = (function() {
    let roomOverlay = null;

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

        const topLine = document.createElement('div');
        topLine.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 4px;
            background: linear-gradient(90deg, #f5d76e, #f0b34b, #f5d76e);
        `;
        overlay.appendChild(topLine);

        const backBtn = document.createElement('button');
        backBtn.textContent = '← 返回';
        backBtn.style.cssText = `
            position: absolute;
            top: 20px; left: 20px;
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

        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6vh;
        `;

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
        `;
        content.appendChild(modeTag);

        const avatarWrapper = document.createElement('div');
        avatarWrapper.style.cssText = `
            position: relative;
            width: 35vw; max-width: 180px;
            height: 35vw; max-height: 180px;
            border-radius: 50%;
            border: 3px solid #f5d76e;
            box-shadow: 0 0 40px rgba(245, 215, 110, 0.3);
            overflow: hidden;
        `;
        const avatarImg = document.createElement('img');
        const profile = window.YYCardAuth?.currentProfile;
        avatarImg.src = profile?.avatar_url || '/assets/default-avatar.png';
        avatarImg.onerror = () => { avatarImg.src = '/assets/default-avatar.png'; };
        avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        avatarWrapper.appendChild(avatarImg);

        const glowRing = document.createElement('div');
        glowRing.style.cssText = `
            position: absolute;
            top: -8px; left: -8px; right: -8px; bottom: -8px;
            border-radius: 50%;
            border: 2px solid rgba(245,215,110,0.3);
            animation: room-glow-pulse 2s ease-in-out infinite;
        `;
        avatarWrapper.appendChild(glowRing);
        content.appendChild(avatarWrapper);

        const nameEl = document.createElement('div');
        nameEl.textContent = profile?.display_name || profile?.username || '玩家';
        nameEl.style.cssText = 'font-size:1.6rem;font-weight:bold;color:#f5d76e;';
        content.appendChild(nameEl);

        const statusEl = document.createElement('div');
        statusEl.id = 'room-status-text';
        statusEl.textContent = '准备就绪';
        statusEl.style.cssText = 'font-size:0.9rem;color:#8e8e93;';
        content.appendChild(statusEl);
        overlay.appendChild(content);

        const startBtn = document.createElement('button');
        startBtn.id = 'room-start-btn';
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = `
            position: absolute; bottom: 15vh;
            left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #f5d76e, #f0b34b);
            color: #0a0f1c; border: none;
            padding: 16px 60px; border-radius: 40px;
            font-size: 1.2rem; font-weight: bold;
            cursor: pointer; box-shadow: 0 8px 30px rgba(245,215,110,0.3);
        `;
        startBtn.onclick = startMatchFromRoom;
        overlay.appendChild(startBtn);

        if (!document.getElementById('room-anim-style')) {
            const style = document.createElement('style');
            style.id = 'room-anim-style';
            style.textContent = `
                @keyframes room-glow-pulse {
                    0%,100%{opacity:0.3;transform:scale(1);}
                    50%{opacity:0.8;transform:scale(1.03);}
                }
            `;
            document.head.appendChild(style);
        }
        return overlay;
    }

    function openRoom(modeName) {
        if (roomOverlay) return;
        roomOverlay = createRoomUI(modeName);
        document.body.appendChild(roomOverlay);
    }

    function closeRoom() {
        if (roomOverlay) {
            roomOverlay.remove();
            roomOverlay = null;
        }
        if (window.YYCardMatchmaking) {
            window.YYCardMatchmaking.cancel();
        }
    }

    async function startMatchFromRoom() {
        const btn = document.getElementById('room-start-btn');
        const statusEl = document.getElementById('room-status-text');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ 匹配中...';
            btn.style.opacity = '0.6';
        }
        if (statusEl) statusEl.textContent = '正在寻找对手...';

        // 监听战斗进入，自动关闭房间
        const battleObserver = new MutationObserver(() => {
            const battleView = document.getElementById('battle-view');
            if (battleView && battleView.style.display === 'block') {
                closeRoom();
                battleObserver.disconnect();
            }
        });
        const battleView = document.getElementById('battle-view');
        if (battleView) {
            battleObserver.observe(battleView, { attributes: true, attributeFilter: ['style'] });
        }

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
                battleObserver.disconnect();
            }
        }

        // 兜底恢复按钮
        setTimeout(() => {
            if (btn && btn.disabled) {
                btn.disabled = false;
                btn.textContent = '⚡ 开始匹配';
                btn.style.opacity = '1';
            }
        }, 10000);
    }

    // 安全初始化：延迟执行，确保依赖模块已存在
    function init() {
        // 不再修改 start-match-btn 的 onclick，而是通过轮询等待按钮出现后修改
        const tryInit = () => {
            const matchBtn = document.getElementById('start-match-btn');
            if (matchBtn && window.YYCardAuth?.currentProfile?.username) {
                matchBtn.onclick = () => openRoom('排位赛');
            } else {
                setTimeout(tryInit, 200);
            }
        };
        tryInit();
    }

    return { openRoom, closeRoom, init };
})();
