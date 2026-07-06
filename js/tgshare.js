// ========== 邀请分享模块（令牌底图版，复用签到组件样式） ==========
window.YYCardTgShare = (function() {
  const supabase = window.supabase;
  const auth = window.YYCardAuth;

  const BIND_WORKER_URL = 'https://bind-code-worker.nnsvp1.workers.dev';
  const BOT_USERNAME = 'YYCARDbot';
  const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

  let isInit = false;
  let currentSelfCode = null;
  let currentInviterCode = null;

  // 确保令牌按钮所需的 CSS 已注入（与签到模块共享样式）
  function ensureTokenStyles() {
    if (document.getElementById('token-btn-style')) return;
    const style = document.createElement('style');
    style.id = 'token-btn-style';
    style.textContent = `
      .yy-token-btn {
        position: relative; width: 138px; height: 112px;
        border: none; background: none; padding: 0;
        cursor: pointer; overflow: visible;
        animation: swing 6s ease-in-out infinite;
      }
      .token-bg {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: contain; user-select: none; pointer-events: none;
      }
      .token-light {
        position: absolute; left: 50%; top: 50%; width: 84px; height: 84px;
        transform: translate(-50%, -50%);
        background: radial-gradient(circle, rgba(255,220,120,.35), transparent 70%);
        animation: tokenGlow 2.6s infinite; pointer-events: none;
      }
      .token-content {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        justify-content: center; align-items: center; z-index: 5;
      }
      .token-title {
        margin-top: -10px; color: #F4D68A; font-size: 16px; font-weight: 700;
        letter-spacing: 2px; text-shadow: 0 2px 4px rgba(0,0,0,.8);
      }
      .token-status {
        margin-top: 10px; font-size: 22px; font-weight: 900;
        color: white; text-shadow: 0 3px 8px black;
      }
      .yy-token-btn.can .token-status { color: #FFD84F; }
      .yy-token-btn.done .token-status { color: #87d37c; }
      .yy-token-btn.cooldown .token-status { color: #bfc4ca; }

      @keyframes swing {
        0% { transform: rotate(-0.8deg); }
        50% { transform: rotate(.8deg); }
        100% { transform: rotate(-0.8deg); }
      }
      @keyframes tokenGlow {
        0% { opacity: .35; transform: translate(-50%, -50%) scale(.9); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
        100% { opacity: .35; transform: translate(-50%, -50%) scale(.9); }
      }
    `;
    document.head.appendChild(style);
  }

  function isRealTelegramUser() {
    if (!window.Telegram?.WebApp) return false;
    const profile = auth.currentProfile;
    if (!profile || !profile.telegram_id) return false;
    return true;
  }

  async function fetchUserCheckin() {
    const profile = auth.currentProfile;
    if (!profile || !profile.telegram_id) return null;

    const { data, error } = await supabase
      .from('user_checkins')
      .select('self_code, inviter_code, total_points')
      .eq('telegram_id', profile.telegram_id)
      .maybeSingle();

    if (error) {
      console.error('获取签到数据失败:', error);
      return null;
    }
    return data;
  }

  async function bindInvite(inviteCode) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('未登录');

    const res = await fetch(`${BIND_WORKER_URL}?token=${session.access_token}&invite_code=${inviteCode}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '绑定失败');
    return data;
  }

  function showForceBindModal(onSuccess) {
    const existing = document.querySelector('.force-bind-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'checkin-overlay force-bind-overlay';
    overlay.innerHTML = `
      <div class="checkin-box">
        <h3>🔗 绑定邀请码</h3>
        <p style="color:#8e8e93; margin: 12px 0; font-size:0.9rem;">
          首次使用需要绑定一个邀请码才能继续。<br>
          请向朋友索取，或输入创世邀请码。
        </p>
        <input id="force-invite-input" type="text" placeholder="请输入邀请码" 
               style="width:100%; padding:12px; background:#2c2c2e; border:1px solid #3a3a3c; 
                      color:#fff; border-radius:0; font-size:1rem; margin-bottom:20px;">
        <div style="display:flex; gap:12px;">
          <button id="force-confirm-bind" class="main-btn" style="flex:1;">确 定</button>
        </div>
        <p id="force-bind-error" style="color:#ff453a; font-size:0.8rem; margin-top:12px; display:none;"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('force-invite-input');
    const btn = document.getElementById('force-confirm-bind');
    const errMsg = document.getElementById('force-bind-error');

    btn.onclick = async () => {
      const code = input.value.trim();
      if (!code) {
        errMsg.textContent = '请输入邀请码';
        errMsg.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = '绑定中...';
      errMsg.style.display = 'none';

      try {
        const result = await bindInvite(code);
        currentSelfCode = result.self_code;
        currentInviterCode = code;
        overlay.remove();
        if (onSuccess) onSuccess(result);
        updateShareButton();
      } catch (err) {
        errMsg.textContent = err.message;
        errMsg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '确 定';
      }
    };

    input.focus();
  }

  function showShareModal() {
    const overlay = document.createElement('div');
    overlay.className = 'checkin-overlay';
    overlay.innerHTML = `
      <div class="checkin-box">
        <h3> 邀请好友</h3>
        
        <!-- 应用链接 -->
        <div style="margin: 16px 0 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="color:#8e8e93; font-size:0.9rem;">应用链接</span>
            <button id="copy-bot-link" style="background: none; border: none; color: #8e8e93; font-size: 1.4rem; cursor: pointer; padding: 4px;">📋</button>
          </div>
          <div style="background: #2c2c2e; padding: 10px; margin-top: 6px; word-break: break-all; font-size: 0.85rem; border: 1px solid #3a3a3c;">
            ${BOT_LINK}
          </div>
          <span id="copy-link-status" style="display: none; color: #34c759; font-size: 0.8rem;">已复制</span>
        </div>

        <!-- 我的邀请码 -->
        <div style="margin: 12px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="color:#8e8e93; font-size:0.9rem;">我的邀请码</span>
            <button id="copy-invite-code" style="background: none; border: none; color: #8e8e93; font-size: 1.4rem; cursor: pointer; padding: 4px;">📋</button>
          </div>
          <div style="background: #2c2c2e; padding: 10px; margin-top: 6px; font-size: 1.2rem; font-weight: 700; text-align: center; border: 1px solid #3a3a3c;">
            ${currentSelfCode}
          </div>
          <span id="copy-code-status" style="display: none; color: #34c759; font-size: 0.8rem;">已复制</span>
        </div>

        <p style="color:#636366; font-size:0.75rem; margin: 16px 0 8px; text-align: center;">
          需要被邀请用户手动输入邀请码
        </p>

        <button id="close-share-modal" class="secondary-btn" style="width: 100%; margin-top: 4px;">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('close-share-modal').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    document.getElementById('copy-bot-link').onclick = () => {
      navigator.clipboard.writeText(BOT_LINK).then(() => {
        const status = document.getElementById('copy-link-status');
        status.style.display = 'inline';
        setTimeout(() => { status.style.display = 'none'; }, 1500);
      }).catch(() => {
        prompt('手动复制链接：', BOT_LINK);
      });
    };

    document.getElementById('copy-invite-code').onclick = () => {
      navigator.clipboard.writeText(currentSelfCode).then(() => {
        const status = document.getElementById('copy-code-status');
        status.style.display = 'inline';
        setTimeout(() => { status.style.display = 'none'; }, 1500);
      }).catch(() => {
        prompt('手动复制邀请码：', currentSelfCode);
      });
    };
  }

  function shareMyLink() {
    if (!isRealTelegramUser()) return;
    if (!currentSelfCode) {
      showForceBindModal(() => shareMyLink());
      return;
    }
    showShareModal();
  }

  function updateShareButton() {
    const shareBtn = document.getElementById('invite-share-btn');
    if (!shareBtn) return;
    const status = shareBtn.querySelector('.token-status');
    if (!status) return;

    shareBtn.classList.remove('can', 'done', 'cooldown');
    if (!isRealTelegramUser()) {
      status.textContent = '分享';
    } else if (currentSelfCode) {
      status.textContent = '邀请';
      shareBtn.classList.add('can');
    } else {
      status.textContent = '绑定';
    }
  }

  function createShareButton() {
    if (document.getElementById('invite-share-btn')) return;
    const container = document.querySelector('.action-buttons');
    if (!container) {
      setTimeout(createShareButton, 500);
      return;
    }

    ensureTokenStyles(); // 注入样式

    const btn = document.createElement('button');
    btn.id = 'invite-share-btn';
    btn.className = 'yy-token-btn';
    btn.innerHTML = `
      <img class="token-bg" src="/assets/logo/share.png" onerror="this.style.display='none'">
      <div class="token-light"></div>
      <div class="token-content">
        <div class="token-title">邀请好友</div>
        <div class="token-status">分享</div>
      </div>
    `;
    btn.onclick = shareMyLink;
    container.appendChild(btn);
  }

  async function handleStartParam() {
    if (!isRealTelegramUser()) return;

    let retries = 0;
    while (!window.Telegram?.WebApp?.initDataUnsafe && retries < 20) {
      await new Promise(r => setTimeout(r, 100));
      retries++;
    }

    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (!startParam) return;

    const data = await fetchUserCheckin();
    if (data && data.inviter_code) {
      currentSelfCode = data.self_code;
      currentInviterCode = data.inviter_code;
      return;
    }

    try {
      console.log('🔄 通过 start_param 自动绑定...');
      const result = await bindInvite(startParam);
      currentSelfCode = result.self_code;
      currentInviterCode = startParam;
      console.log('✅ 自动绑定成功');
      updateShareButton();
    } catch (err) {
      console.warn('自动绑定失败:', err.message);
    }
  }

  async function init() {
    if (isInit) return;
    isInit = true;

    createShareButton();
    updateShareButton();

    if (!isRealTelegramUser()) {
      console.log('⏭️ 非电报用户，跳过邀请绑定');
      return;
    }

    const data = await fetchUserCheckin();
    if (data) {
      currentSelfCode = data.self_code;
      currentInviterCode = data.inviter_code;
    }

    await handleStartParam();

    if (!currentInviterCode) {
      setTimeout(() => {
        showForceBindModal((result) => {
          console.log('✅ 强制绑定完成，你的邀请码是:', result.self_code);
        });
      }, 500);
    }
  }

  return {
    init,
    getSelfCode: async () => currentSelfCode || (await fetchUserCheckin())?.self_code || null,
    getInviterCode: async () => currentInviterCode || (await fetchUserCheckin())?.inviter_code || null,
    showBindIfNeeded: () => {
      if (!isRealTelegramUser()) return;
      if (!currentInviterCode) showForceBindModal();
    }
  };
})();
