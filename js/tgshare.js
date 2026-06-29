// ========== 邀请分享模块（TG环境强制绑定，分享弹窗显示邀请码） ==========
window.YYCardTgShare = (function() {
  const supabase = window.supabase;
  const auth = window.YYCardAuth;

  const BIND_WORKER_URL = 'https://bind-code-worker.nnsvp1.workers.dev';
  const BOT_USERNAME = 'YYCARDbot';

  let isInit = false;
  let currentSelfCode = null;
  let currentInviterCode = null;

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
        <h3>📤 我的邀请</h3>
        <div style="margin: 16px 0; color: #e5e5ea;">
          <div style="font-size: 0.9rem; color: #8e8e93; margin-bottom: 8px;">邀请链接</div>
          <div id="share-link-text" style="background: #2c2c2e; padding: 10px; word-break: break-all; font-size: 0.85rem; border: 1px solid #3a3a3c;">
            https://t.me/${BOT_USERNAME}?start=${currentSelfCode}
          </div>
          <div style="font-size: 0.9rem; color: #8e8e93; margin: 16px 0 8px;">我的邀请码</div>
          <div style="background: #2c2c2e; padding: 10px; font-size: 1.2rem; font-weight: 700; text-align: center; border: 1px solid #3a3a3c;">
            ${currentSelfCode}
          </div>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <button id="copy-share-link" class="main-btn" style="flex:1;">复制邀请链接</button>
          <button id="close-share-modal" class="secondary-btn" style="flex:0.5;">关闭</button>
        </div>
        <p id="copy-status" style="color:#34c759; font-size:0.8rem; margin-top:8px; display:none;">✅ 已复制到剪贴板</p>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('close-share-modal').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    document.getElementById('copy-share-link').onclick = () => {
      const link = `https://t.me/${BOT_USERNAME}?start=${currentSelfCode}`;
      navigator.clipboard.writeText(link).then(() => {
        const status = document.getElementById('copy-status');
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 2000);
      }).catch(() => {
        prompt('手动复制链接:', link);
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

    if (!isRealTelegramUser()) {
      shareBtn.textContent = '📤 邀请（需TG）';
    } else {
      shareBtn.textContent = currentSelfCode ? `📤 邀请 (${currentSelfCode})` : '📤 绑定后分享';
    }
  }

  function createShareButton() {
    if (document.getElementById('invite-share-btn')) return;
    const container = document.querySelector('.action-buttons');
    if (!container) {
      setTimeout(createShareButton, 500);
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'invite-share-btn';
    btn.className = 'btn';
    btn.textContent = '📤 邀请（需TG）';
    btn.style.cssText = 'background:#34c759; color:#fff; border-radius:0;';
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
