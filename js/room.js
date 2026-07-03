// ==================== 房间/备战页面模块 ====================
window.YYCardRoom = (function() {
    let roomOverlay = null;

    function createRoomUI(modeName) {
        const profile = window.YYCardAuth?.currentProfile || {};
        const overlay = document.createElement('div');
        overlay.id = 'room-overlay';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;
            background:linear-gradient(135deg,#0a0f1c,#1a2a4a,#0f1b2e);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:'Segoe UI',Roboto,sans-serif;color:#f0f0f0;
        `;

        // 顶部装饰线
        const topLine = document.createElement('div');
        topLine.style.cssText = `
            position:absolute;top:0;left:0;right:0;height:4px;
            background:linear-gradient(90deg,#f5d76e,#f0b34b,#f5d76e);
        `;
        overlay.appendChild(topLine);

        // 返回按钮
        const backBtn = document.createElement('button');
        backBtn.textContent = '← 返回';
        backBtn.style.cssText = `
            position:absolute;top:20px;left:20px;
            background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
            color:#f0f0f0;padding:10px 20px;border-radius:30px;font-size:1rem;cursor:pointer;z-index:10;
        `;
        backBtn.onclick = closeRoom;
        overlay.appendChild(backBtn);

        // 主内容区
        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6vh;';

        const modeTag = document.createElement('div');
        modeTag.textContent = modeName;
        modeTag.style.cssText = `
            background:linear-gradient(135deg,#f5d76e,#f0b34b);
            color:#0a0f1c;padding:8px 30px;border-radius:30px;
            font-size:1rem;font-weight:bold;letter-spacing:2px;text-transform:uppercase;
        `;
        content.appendChild(modeTag);

        // 头像
        const avatarWrapper = document.createElement('div');
        avatarWrapper.style.cssText = `
            position:relative;width:35vw;height:35vw;max-width:180px;max-height:180px;
            border-radius:50%;border:3px solid #f5d76e;
            box-shadow:0 0 40px rgba(245,215,110,0.3);overflow:hidden;
        `;
        const avatarImg = document.createElement('img');
        avatarImg.src = profile.avatar_url || '/assets/default-avatar.png';
        avatarImg.onerror = () => { avatarImg.src = '/assets/default-avatar.png'; };
        avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        avatarWrapper.appendChild(avatarImg);

        const glowRing = document.createElement('div');
        glowRing.style.cssText = `
            position:absolute;top:-8px;left:-8px;right:-8px;bottom:-8px;
            border-radius:50%;border:2px solid rgba(245,215,110,0.3);
            animation:room-glow-pulse 2s ease-in-out infinite;
        `;
        avatarWrapper.appendChild(glowRing);
        content.appendChild(avatarWrapper);

        const nameEl = document.createElement('div');
        nameEl.textContent = profile.display_name || profile.username || '玩家';
        nameEl.style.cssText = 'font-size:1.6rem;font-weight:bold;color:#f5d76e;text-shadow:0 0 20px rgba(245,215,110,0.4);';
        content.appendChild(nameEl);

        const statusEl = document.createElement('div');
        statusEl.id = 'room-status-text';
        statusEl.textContent = '准备就绪';
        statusEl.style.cssText = 'font-size:0.9rem;color:#8e8e93;letter-spacing:1px;';
        content.appendChild(statusEl);

        overlay.appendChild(content);

        // 开始按钮
        const startBtn = document.createElement('button');
        startBtn.id = 'room-start-btn';
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = `
            position:absolute;bottom:15vh;left:50%;transform:translateX(-50%);
            background:linear-gradient(135deg,#f5d76e,#f0b34b);color:#0a0f1c;
            border:none;padding:16px 60px;border-radius:40px;font-size:1.2rem;
            font-weight:bold;cursor:pointer;box-shadow:0 8px 30px rgba(245,215,110,0.3);
            letter-spacing:1px;
        `;
        startBtn.onclick = startMatchFromRoom;
        overlay.appendChild(startBtn);

        return overlay;
    }

    function openRoom(modeName) {
        if (roomOverlay) return;
        roomOverlay = createRoomUI(modeName);
        document.body.appendChild(roomOverlay);
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
    }

    function closeRoom() {
        if (roomOverlay) {
            roomOverlay.remove();
            roomOverlay = null;
        }
        // 只取消匹配，不重置大厅按钮
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

        try {
            if (window.YYCardMatchmaking?.start) {
                await window.YYCardMatchmaking.start();
            } else {
                throw new Error('匹配模块未就绪');
            }
        } catch (e) {
            console.error('匹配失败:', e);
            if (btn) {
                btn.disabled = false;
                btn.textContent = '⚡ 开始匹配';
                btn.style.opacity = '1';
            }
            if (statusEl) statusEl.textContent = '匹配失败，请重试';
        }

        // 10 秒后若仍无响应则恢复按钮
        setTimeout(() => {
            if (btn && btn.disabled && document.getElementById('room-overlay')) {
                btn.disabled = false;
                btn.textContent = '⚡ 开始匹配';
                btn.style.opacity = '1';
                if (statusEl) statusEl.textContent = '准备就绪';
            }
        }, 10000);
    }

    function init() {
        const matchBtn = document.getElementById('start-match-btn');
        if (!matchBtn) return;

        // 替换点击事件：点击进入房间，由房间内的按钮触发匹配
        matchBtn.onclick = () => {
            const hasUsername = window.YYCardAuth?.currentProfile?.username;
            if (!hasUsername) {
                // 使用 toast 或 alert 提示
                if (window.YYCardShop?.toast) {
                    window.YYCardShop.toast('请先设置游戏ID', true);
                } else {
                    alert('请先设置游戏ID');
                }
                return;
            }
            openRoom('排位赛');
        };

        // 监听战斗进入，自动关闭房间（无需改动 battle.js）
        const battleObserver = new MutationObserver(() => {
            const battleView = document.getElementById('battle-view');
            if (battleView && battleView.style.display === 'block') {
                closeRoom();
            }
        });
        const battleView = document.getElementById('battle-view');
        if (battleView) {
            battleObserver.observe(battleView, { attributes: true, attributeFilter: ['style'] });
        }
    }

    return { openRoom, closeRoom, init };
})();
