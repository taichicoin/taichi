// ==================== 房间/备战页面模块 ====================
window.YYCardRoom = (function() {
    let overlay = null;
    let currentMode = '';

    function createUI(modeName) {
        const profile = window.YYCardAuth?.currentProfile || {};
        const div = document.createElement('div');
        div.id = 'room-overlay';
        div.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;
            background:linear-gradient(135deg,#0a0f1c,#1a2a4a,#0f1b2e);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:'Segoe UI',Roboto,sans-serif;color:#f0f0f0;
        `;

        // 装饰线
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f5d76e,#f0b34b,#f5d76e);';
        div.appendChild(line);

        // 返回按钮（关闭房间）
        const back = document.createElement('button');
        back.textContent = '← 返回';
        back.style.cssText = 'position:absolute;top:20px;left:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f0f0f0;padding:10px 20px;border-radius:30px;font-size:1rem;cursor:pointer;z-index:10;';
        back.onclick = close;
        div.appendChild(back);

        // 内容
        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6vh;';

        const tag = document.createElement('div');
        tag.textContent = modeName;
        tag.style.cssText = 'background:linear-gradient(135deg,#f5d76e,#f0b34b);color:#0a0f1c;padding:8px 30px;border-radius:30px;font-size:1rem;font-weight:bold;letter-spacing:2px;';
        content.appendChild(tag);

        // 头像
        const avatarWrap = document.createElement('div');
        avatarWrap.style.cssText = 'position:relative;width:35vw;height:35vw;max-width:180px;max-height:180px;border-radius:50%;border:3px solid #f5d76e;box-shadow:0 0 40px rgba(245,215,110,0.3);overflow:hidden;';
        const img = document.createElement('img');
        img.src = profile.avatar_url || '/assets/default-avatar.png';
        img.onerror = () => img.src = '/assets/default-avatar.png';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        avatarWrap.appendChild(img);

        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;top:-8px;left:-8px;right:-8px;bottom:-8px;border-radius:50%;border:2px solid rgba(245,215,110,0.3);animation:room-glow 2s ease-in-out infinite;';
        avatarWrap.appendChild(ring);
        content.appendChild(avatarWrap);

        const nameEl = document.createElement('div');
        nameEl.textContent = profile.display_name || profile.username || '玩家';
        nameEl.style.cssText = 'font-size:1.6rem;font-weight:bold;color:#f5d76e;text-shadow:0 0 20px rgba(245,215,110,0.4);';
        content.appendChild(nameEl);

        const statusEl = document.createElement('div');
        statusEl.id = 'room-status-text';
        statusEl.textContent = '准备就绪';
        statusEl.style.cssText = 'font-size:0.9rem;color:#8e8e93;letter-spacing:1px;';
        content.appendChild(statusEl);

        div.appendChild(content);

        // 按钮区
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'position:absolute;bottom:15vh;left:50%;transform:translateX(-50%);display:flex;gap:20px;';

        // 开始匹配按钮
        const startBtn = document.createElement('button');
        startBtn.id = 'room-start-btn';
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = 'background:linear-gradient(135deg,#f5d76e,#f0b34b);color:#0a0f1c;border:none;padding:16px 40px;border-radius:40px;font-size:1.2rem;font-weight:bold;cursor:pointer;box-shadow:0 8px 30px rgba(245,215,110,0.3);letter-spacing:1px;';
        startBtn.onclick = startMatch;
        btnContainer.appendChild(startBtn);

        // 取消匹配按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'room-cancel-btn';
        cancelBtn.textContent = '取消匹配';
        cancelBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f0f0f0;padding:12px 20px;border-radius:30px;font-size:0.9rem;cursor:pointer;';
        cancelBtn.onclick = cancelMatch;
        btnContainer.appendChild(cancelBtn);

        div.appendChild(btnContainer);

        return div;
    }

    function open(modeName) {
        if (overlay) return;
        currentMode = modeName || '排位赛';
        overlay = createUI(currentMode);
        document.body.appendChild(overlay);
        if (!document.getElementById('room-anim')) {
            const s = document.createElement('style');
            s.id = 'room-anim';
            s.textContent = '@keyframes room-glow{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:0.8;transform:scale(1.03)}}';
            document.head.appendChild(s);
        }
        watchBattle();
    }

    function close() {
        if (overlay) { overlay.remove(); overlay = null; }
        // 如果正在匹配，也取消
        window.YYCardMatchmaking?.cancel();
    }

    async function startMatch() {
        const startBtn = document.getElementById('room-start-btn');
        const cancelBtn = document.getElementById('room-cancel-btn');
        const status = document.getElementById('room-status-text');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = '⏳ 匹配中...'; startBtn.style.opacity = '0.6'; }
        if (cancelBtn) cancelBtn.style.display = 'inline-block'; // 显示取消按钮（其实一直都在）
        if (status) status.textContent = '正在寻找对手...';

        try {
            await window.YYCardMatchmaking?.start();
        } catch (e) {
            console.error(e);
            if (startBtn) { startBtn.disabled = false; startBtn.textContent = '⚡ 开始匹配'; startBtn.style.opacity = '1'; }
            if (status) status.textContent = '匹配失败，请重试';
        }
    }

    function cancelMatch() {
        window.YYCardMatchmaking?.cancel();
        const startBtn = document.getElementById('room-start-btn');
        const status = document.getElementById('room-status-text');
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = '⚡ 开始匹配'; startBtn.style.opacity = '1'; }
        if (status) status.textContent = '已取消匹配';
    }

    function watchBattle() {
        const battleView = document.getElementById('battle-view');
        if (!battleView) return;
        const obs = new MutationObserver(() => {
            if (battleView.style.display === 'block') {
                close();
                obs.disconnect();
            }
        });
        obs.observe(battleView, { attributes: true, attributeFilter: ['style'] });
    }

    return { open, close };
})();
