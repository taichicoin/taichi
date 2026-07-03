// ==================== 房间/备战页面模块 ====================
window.YYCardRoom = (function() {
    let overlay = null;

    function createUI() {
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

        // 返回按钮
        const back = document.createElement('button');
        back.textContent = '← 返回';
        back.style.cssText = 'position:absolute;top:20px;left:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f0f0f0;padding:10px 20px;border-radius:30px;font-size:1rem;cursor:pointer;z-index:10;';
        back.onclick = close;
        div.appendChild(back);

        // 内容
        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6vh;';

        const tag = document.createElement('div');
        tag.textContent = '排位赛';
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

        // 开始匹配按钮
        const startBtn = document.createElement('button');
        startBtn.id = 'room-start-btn';
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = 'position:absolute;bottom:15vh;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f5d76e,#f0b34b);color:#0a0f1c;border:none;padding:16px 60px;border-radius:40px;font-size:1.2rem;font-weight:bold;cursor:pointer;box-shadow:0 8px 30px rgba(245,215,110,0.3);letter-spacing:1px;';
        startBtn.onclick = startMatch;
        div.appendChild(startBtn);

        return div;
    }

    function open() {
        if (overlay) return;
        overlay = createUI();
        document.body.appendChild(overlay);
        if (!document.getElementById('room-anim')) {
            const s = document.createElement('style');
            s.id = 'room-anim';
            s.textContent = '@keyframes room-glow{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:0.8;transform:scale(1.03)}}';
            document.head.appendChild(s);
        }
    }

    function close() {
        if (overlay) { overlay.remove(); overlay = null; }
        window.YYCardMatchmaking?.cancel();
    }

    async function startMatch() {
        const btn = document.getElementById('room-start-btn');
        const status = document.getElementById('room-status-text');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 匹配中...'; btn.style.opacity = '0.6'; }
        if (status) status.textContent = '正在寻找对手...';

        try {
            await window.YYCardMatchmaking?.start();
        } catch (e) {
            console.error(e);
            if (btn) { btn.disabled = false; btn.textContent = '⚡ 开始匹配'; btn.style.opacity = '1'; }
            if (status) status.textContent = '匹配失败，请重试';
        }

        // 10秒后若还在房间且按钮未恢复，则恢复
        setTimeout(() => {
            if (btn && btn.disabled && document.getElementById('room-overlay')) {
                btn.disabled = false;
                btn.textContent = '⚡ 开始匹配';
                btn.style.opacity = '1';
                if (status) status.textContent = '准备就绪';
            }
        }, 10000);
    }

    // 自动关闭房间：当战斗视图显示时
    function watchBattle() {
        const battleView = document.getElementById('battle-view');
        if (!battleView) return;
        const obs = new MutationObserver(() => {
            if (battleView.style.display === 'block') close();
        });
        obs.observe(battleView, { attributes: true, attributeFilter: ['style'] });
    }

    function init() {
        const matchBtn = document.getElementById('start-match-btn');
        if (!matchBtn) return;

        // 把大厅原来的匹配按钮改造成“排位赛”入口
        matchBtn.textContent = '⚡ 排位赛';
        matchBtn.disabled = false; // 由 initApp 中 profileUI.update 控制，这里先解除禁用，内部判断
        matchBtn.onclick = () => {
            const profile = window.YYCardAuth?.currentProfile;
            if (!profile?.username) {
                // 没设置游戏ID则提醒
                if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
                else alert('请先设置游戏ID');
                return;
            }
            open();
        };

        watchBattle();
    }

    return { open, close, init };
})();
