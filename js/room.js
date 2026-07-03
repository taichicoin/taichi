// ==================== 房间/备战页面 ====================
window.YYCardRoom = (function() {
    let overlay = null;

    function createUI(mode) {
        const profile = window.YYCardAuth?.currentProfile || {};
        const div = document.createElement('div');
        div.id = 'room-overlay';
        div.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;
            background:linear-gradient(135deg,#0a0f1c,#1a2a4a,#0f1b2e);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:'Segoe UI',Roboto,sans-serif;color:#f0f0f0;
        `;

        // 顶线
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f5d76e,#f0b34b,#f5d76e);';
        div.appendChild(line);

        // 返回按钮
        const backBtn = document.createElement('button');
        backBtn.textContent = '← 返回';
        backBtn.style.cssText = 'position:absolute;top:20px;left:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f0f0f0;padding:10px 20px;border-radius:30px;font-size:1rem;cursor:pointer;z-index:10;';
        backBtn.onclick = close;
        div.appendChild(backBtn);

        // 内容
        const content = document.createElement('div');
        content.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6vh;';

        const tag = document.createElement('div');
        tag.textContent = mode || '排位赛';
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

        // 按钮组
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'position:absolute;bottom:15vh;display:flex;gap:20px;';

        // 开始匹配按钮（id 与原大厅按钮相同，确保音效生效）
        const startBtn = document.createElement('button');
        startBtn.id = 'start-match-btn';   // 音效监听的就是这个id
        startBtn.textContent = '⚡ 开始匹配';
        startBtn.style.cssText = 'background:linear-gradient(135deg,#f5d76e,#f0b34b);color:#0a0f1c;border:none;padding:16px 40px;border-radius:40px;font-size:1.2rem;font-weight:bold;cursor:pointer;box-shadow:0 8px 30px rgba(245,215,110,0.3);letter-spacing:1px;';
        startBtn.onclick = startMatch;
        btnGroup.appendChild(startBtn);

        // 取消匹配按钮（房间内专用）
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'room-cancel-btn';
        cancelBtn.textContent = '取消匹配';
        cancelBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#f0f0f0;padding:16px 30px;border-radius:40px;font-size:1rem;cursor:pointer;';
        cancelBtn.onclick = cancelMatch;
        btnGroup.appendChild(cancelBtn);

        div.appendChild(btnGroup);

        return div;
    }

    function open(mode) {
        if (overlay) return;
        overlay = createUI(mode);
        document.body.appendChild(overlay);
        if (!document.getElementById('room-anim')) {
            const s = document.createElement('style');
            s.id = 'room-anim';
            s.textContent = '@keyframes room-glow{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:0.8;transform:scale(1.03)}}';
            document.head.appendChild(s);
        }
        // 启动战斗视图监听（进入战斗自动关闭）
        watchBattle();
    }

    function close() {
        cancelMatch();  // 先取消匹配（如果有）
        if (overlay) { overlay.remove(); overlay = null; }
    }

    async function startMatch() {
        const btn = document.getElementById('start-match-btn');
        const statusEl = document.getElementById('room-status-text');
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = '⏳ 匹配中...';
        btn.style.opacity = '0.6';
        if (statusEl) statusEl.textContent = '正在寻找对手...';

        try {
            // 调用原有匹配模块
            if (window.YYCardMatchmaking?.start) {
                await window.YYCardMatchmaking.start();
            } else {
                throw new Error('匹配模块未就绪');
            }
        } catch (e) {
            console.error(e);
            recoverButton();
        }

        // 兜底：10秒后如果还在房间且未进入战斗，恢复按钮
        setTimeout(() => {
            if (btn && btn.disabled && document.getElementById('room-overlay')) {
                recoverButton();
            }
        }, 10000);
    }

    function cancelMatch() {
        if (window.YYCardMatchmaking?.cancel) {
            window.YYCardMatchmaking.cancel();
        }
        recoverButton();
    }

    function recoverButton() {
        const btn = document.getElementById('start-match-btn');
        const statusEl = document.getElementById('room-status-text');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '⚡ 开始匹配';
            btn.style.opacity = '1';
        }
        if (statusEl) statusEl.textContent = '准备就绪';
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

    // 初始化：将大厅的匹配按钮替换为“排位赛”入口
    function init() {
        const oldBtn = document.getElementById('start-match-btn');
        if (!oldBtn) return;

        // 隐藏原来的匹配按钮，不让它直接触发匹配
        oldBtn.style.display = 'none';

        // 创建新的入口按钮
        const entryBtn = document.createElement('button');
        entryBtn.id = 'ranked-entry-btn';
        entryBtn.textContent = '⚡ 排位赛';
        entryBtn.className = 'btn-primary';  // 复用同样的圆形样式
        entryBtn.style.cssText = oldBtn.style.cssText;  // 继承位置大小等
        entryBtn.onclick = () => {
            const profile = window.YYCardAuth?.currentProfile;
            if (!profile?.username) {
                if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
                else alert('请先设置游戏ID');
                return;
            }
            open('排位赛');
        };

        // 插入到原按钮后面（或替换）
        oldBtn.parentNode.appendChild(entryBtn);
    }

    return { open, close, init };
})();
