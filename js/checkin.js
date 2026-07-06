// ========== 签到模块（令牌底图版） ==========
window.YYCardCheckin = (function() {
  const CHECKIN_WORKER_URL = 'https://checkin-worker.nnsvp1.workers.dev';
  const supabase = window.supabase;
  const auth = window.YYCardAuth;

  let checkinBtn, modal;
  let state = { canCheckin: false, totalPoints: 0, waitHours: 0, lastTime: null };

  function injectStyles() {
    if (document.getElementById('checkin-style')) return;
    const s = document.createElement('style');
    s.id = 'checkin-style';
    s.textContent = `
      /* 高级感硬朗直角弹窗样式 */
      .checkin-overlay { 
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        z-index: 9999; display: flex; align-items: center; justify-content: center; 
      }
      .checkin-box { 
        background: #1a1a1e;
        border-radius: 0px !important;
        padding: 28px 32px; 
        width: 86%; max-width: 340px; 
        color: #f5f5f7; 
        box-shadow: 0 16px 48px rgba(0,0,0,0.6); 
        border: 1px solid rgba(255,255,255,0.06); 
        position: relative;
        text-align: left; 
        display: flex; flex-direction: column;
      }
      .checkin-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .checkin-header h3 { 
        margin: 0; font-size: 1.1rem; font-weight: 600; letter-spacing: 1px; color: #ffffff; 
      }
      .checkin-close-icon { 
        background: transparent; border: none; color: #8e8e93; font-size: 1.4rem; cursor: pointer; padding: 0 4px;
      }
      .score-area {
        display: flex; align-items: baseline; justify-content: space-between;
        background: rgba(255,255,255,0.03);
        padding: 16px 20px; margin-bottom: 20px;
        border-left: 3px solid #f0ad4e;
      }
      .score-number {
        font-size: 3.4rem; font-weight: 800; line-height: 1;
        background: linear-gradient(135deg, #f7dc6f, #f0ad4e);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      }
      .score-label {
        font-size: 1rem; color: #8e8e93; letter-spacing: 1px;
      }
      .info-row {
        display: flex; justify-content: space-between;
        font-size: 0.9rem; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .info-row:last-child { border-bottom: none; margin-bottom: 16px; }
      .info-label { color: #8e8e93; }
      .info-value { color: #e5e5ea; }
      .status-green { color: #34c759; font-weight: 500;}
      .status-gray { color: #ff453a; font-weight: 500;}
      .checkin-actions {
        display: flex; gap: 12px; margin-top: 8px;
      }
      .main-btn {
        flex: 1; background: #f0ad4e; border: none; border-radius: 0px !important; 
        padding: 14px 0; font-size: 1rem; font-weight: 700; color: #1c1c1e; cursor: pointer;
        transition: opacity 0.2s;
      }
      .main-btn:disabled {
        background: #3a3a3c; color: #636366; cursor: not-allowed; opacity: 0.6;
      }
      .secondary-btn {
        flex: 0.5; background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 0px !important;
        padding: 14px 0; font-size: 0.9rem; color: #8e8e93; cursor: pointer; transition: background 0.2s;
      }
      .secondary-btn:active { background: #2c2c2e; }
      .notice-box { text-align: center; padding: 20px 0; }
      .notice-box p { color: #8e8e93; margin: 10px 0 20px 0; }
      .notice-box .secondary-btn { padding: 10px 30px; flex: none; }

      /* ========================== 令牌底图版签到按钮 ========================== */
      .yy-checkin-v3 {
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
      .yy-checkin-v3.can .token-status { color: #FFD84F; }
      .yy-checkin-v3.done .token-status { color: #87d37c; }
      .yy-checkin-v3.cooldown .token-status { color: #bfc4ca; }

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
    document.head.appendChild(s);
  }

  function createUI() {
    injectStyles();
    const tryAppend = () => {
      const container = document.querySelector('.action-buttons');
      if (container && !checkinBtn) {
        checkinBtn = document.createElement('button');
        checkinBtn.className = 'yy-checkin-v3';
        checkinBtn.id = 'yyCheckinBtn';
        checkinBtn.innerHTML = `
          <img class="token-bg" src="/assets/logo/checkin.png" onerror="this.style.display='none'">
          <div class="token-light"></div>
          <div class="token-content">
            <div class="token-title">每日签到</div>
            <div class="token-status">签到</div>
          </div>
        `;
        checkinBtn.onclick = openModal;
        container.appendChild(checkinBtn);
        fetchStatus();
      } else if (!container) {
        setTimeout(tryAppend, 300);
      }
    };
    tryAppend();
  }

  async function fetchStatus() {
    const profile = auth.currentProfile;
    if (!profile || !profile.telegram_id) {
      updateBtn();
      return;
    }

    const { data: checkin } = await supabase
      .from('user_checkins')
      .select('last_checkin_time, total_points')
      .eq('telegram_id', profile.telegram_id)
      .maybeSingle();

    const now = new Date();
    let lastTime = null, totalPoints = 0, can = true, waitHours = 0;

    if (checkin) {
      lastTime = checkin.last_checkin_time;
      totalPoints = checkin.total_points || 0;
      if (lastTime) {
        const diff = (now - new Date(lastTime)) / (1000 * 60 * 60);
        can = diff >= 24;
        if (!can) waitHours = Math.ceil(24 - diff);
      }
    }

    state = { canCheckin: can, totalPoints, waitHours, lastTime };
    updateBtn();
  }

  function updateBtn() {
    if (!checkinBtn) return;
    const hasTelegram = auth.currentProfile && auth.currentProfile.telegram_id;
    const status = checkinBtn.querySelector(".token-status");
    checkinBtn.classList.remove("can", "done", "cooldown");

    if (!hasTelegram) {
      status.textContent = "签到";
    } else if (state.canCheckin) {
      status.textContent = "领取";
      checkinBtn.classList.add("can");
    } else if (state.waitHours > 0) {
      status.textContent = state.waitHours + "h";
      checkinBtn.classList.add("cooldown");
    } else {
      status.textContent = "完成";
      checkinBtn.classList.add("done");
    }
  }

  function openModal() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'checkin-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const hasTelegram = auth.currentProfile && auth.currentProfile.telegram_id;

    if (!hasTelegram) {
      modal.innerHTML = `
        <div class="checkin-box notice-box">
          <h3 style="color:#fff; letter-spacing:1px; margin:0 0 16px;">📅 签到</h3>
          <p>请前往 Telegram 中启动并使用此功能</p>
          <button id="modal-close" class="secondary-btn">关闭</button>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('modal-close').onclick = () => modal.remove();
      return;
    }

    const lastStr = state.lastTime ? new Date(state.lastTime).toLocaleString('zh-CN', { hour12: false }) : '--';
    const statusText = state.canCheckin ? '可签到' : '冷却中';
    const statusClass = state.canCheckin ? 'status-green' : 'status-gray';
    const btnText = state.canCheckin ? '立即签到' : '已签到';

    modal.innerHTML = `
      <div class="checkin-box">
        <div class="checkin-header">
          <h3> 每日签到</h3>
          <button id="modal-close" class="checkin-close-icon">✕</button>
        </div>
        <div class="score-area">
          <span class="score-number">${state.totalPoints}</span>
          <span class="score-label">WOOD</span>
        </div>
        <div class="info-row">
          <span class="info-label">签到状态</span>
          <span class="info-value ${statusClass}">${statusText}</span>
        </div>
        <div class="info-row">
          <span class="info-label">上次签到</span>
          <span class="info-value">${lastStr}</span>
        </div>
        <div class="checkin-actions">
          <button id="modal-do" class="main-btn" ${state.canCheckin ? '' : 'disabled'}>${btnText}</button>
          <button id="modal-close-alt" class="secondary-btn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modal-close').onclick = () => modal.remove();
    document.getElementById('modal-close-alt').onclick = () => modal.remove();

    if (state.canCheckin) {
      document.getElementById('modal-do').onclick = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return alert('登录过期');
        const btn = document.getElementById('modal-do');
        btn.disabled = true;
        btn.textContent = '签到中...';
        try {
          const res = await fetch(CHECKIN_WORKER_URL + '?token=' + session.access_token, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            await fetchStatus();
            modal.remove();
            openModal();
          } else {
            alert(data.message || '签到失败');
            btn.disabled = false;
            btn.textContent = '立即签到';
          }
        } catch (err) {
          alert('网络错误：' + err.message);
          btn.disabled = false;
          btn.textContent = '立即签到';
        }
      };
    }
  }

  return { init: createUI };
})();
