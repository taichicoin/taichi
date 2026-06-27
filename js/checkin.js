// ========== 签到模块（区分电报/谷歌用户） ==========
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
        background: #1a1a1e; /* 深色高级底 */
        border-radius: 0px !important; /* 强制完全直角 */
        padding: 28px 32px; 
        width: 86%; max-width: 340px; 
        color: #f5f5f7; 
        box-shadow: 0 16px 48px rgba(0,0,0,0.6); 
        border: 1px solid rgba(255,255,255,0.06); 
        position: relative;
        text-align: left; 
        display: flex; flex-direction: column;
      }

      /* 顶部标题与关闭按钮 */
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

      /* 核心积分展示区 */
      .score-area {
        display: flex; align-items: baseline; justify-content: space-between;
        background: rgba(255,255,255,0.03);
        padding: 16px 20px; margin-bottom: 20px;
        border-left: 3px solid #f0ad4e; /* 左侧金边点缀 */
      }
      .score-number {
        font-size: 3.4rem; font-weight: 800; line-height: 1;
        background: linear-gradient(135deg, #f7dc6f, #f0ad4e);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      }
      .score-label {
        font-size: 1rem; color: #8e8e93; letter-spacing: 1px;
      }

      /* 信息列表 */
      .info-row {
        display: flex; justify-content: space-between;
        font-size: 0.9rem; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .info-row:last-child { border-bottom: none; margin-bottom: 16px; }
      .info-label { color: #8e8e93; }
      .info-value { color: #e5e5ea; }
      .status-green { color: #34c759; font-weight: 500;}
      .status-gray { color: #ff453a; font-weight: 500;}

      /* 底部操作区 */
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

      /* 针对非TG用户的提示框样式 */
      .notice-box { text-align: center; padding: 20px 0; }
      .notice-box p { color: #8e8e93; margin: 10px 0 20px 0; }
      .notice-box .secondary-btn { padding: 10px 30px; flex: none; }
    `;
    document.head.appendChild(s);
  }

  function createUI() {
    injectStyles();
    const tryAppend = () => {
      const container = document.querySelector('.action-buttons');
      if (container && !checkinBtn) {
        checkinBtn = document.createElement('button');
        checkinBtn.className = 'btn';
        checkinBtn.textContent = '📅 签到';
        checkinBtn.style.cssText = 'background:#f0ad4e;color:#000;border-radius:0;';
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
    checkinBtn.disabled = false;
    if (!hasTelegram) {
      checkinBtn.textContent = '📅 签到';
    } else if (state.canCheckin) {
      checkinBtn.textContent = '📅 签到';
    } else if (state.waitHours > 0) {
      checkinBtn.textContent = `⏳ ${state.waitHours}h后`;
    } else {
      checkinBtn.textContent = '📅 已签到';
    }
  }

  function openModal() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'checkin-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const hasTelegram = auth.currentProfile && auth.currentProfile.telegram_id;

    if (!hasTelegram) {
      // 谷歌用户提示，保持直角高级感
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

    // 电报用户高级感弹窗
    const lastStr = state.lastTime ? new Date(state.lastTime).toLocaleString('zh-CN', { hour12: false }) : '--';
    const statusText = state.canCheckin ? '可签到' : '冷却中';
    const statusClass = state.canCheckin ? 'status-green' : 'status-gray';
    const btnText = state.canCheckin ? '立即签到' : '已签到';

    modal.innerHTML = `
      <div class="checkin-box">
        <div class="checkin-header">
          <h3>📅 每日签到</h3>
          <button id="modal-close" class="checkin-close-icon">✕</button>
        </div>

        <div class="score-area">
          <span class="score-number">${state.totalPoints}</span>
          <span class="score-label">积 分</span>
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

    // 绑定关闭按钮
    document.getElementById('modal-close').onclick = () => modal.remove();
    document.getElementById('modal-close-alt').onclick = () => modal.remove();

    // 签到逻辑
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
