// ========== 签到模块（稳定版：从 auth 拿电报 ID） ==========
window.YYCardCheckin = (function() {
  const CHECKIN_WORKER_URL = 'https://checkin-worker.nnsvp1.workers.dev';
  const supabase = window.supabase;
  const auth = window.YYCardAuth;   // 直接拿当前登录档案

  let checkinBtn, modal;
  let state = { canCheckin: false, totalPoints: 0, waitHours: 0, lastTime: null };

  function injectStyles() {
    if (document.getElementById('checkin-style')) return;
    const s = document.createElement('style');
    s.id = 'checkin-style';
    s.textContent = `
      .checkin-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; justify-content: center; }
      .checkin-box { background: rgba(255,255,255,0.2); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 20px; padding: 24px; width: 85%; max-width: 340px; color: #1a1a2e; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.4); }
      .checkin-box h3 { margin-top: 0; color: #0f3460; }
      .checkin-points { font-size: 2em; font-weight: bold; color: #e94560; margin: 10px 0; }
      .checkin-detail { color: #333; font-size: 0.9em; margin: 8px 0; }
      .checkin-status { font-size: 1.1em; margin: 12px 0; color: #0f3460; }
      .checkin-btn { background: #e94560; border: none; border-radius: 10px; padding: 12px 24px; font-size: 1em; margin-top: 12px; color: white; cursor: pointer; font-weight: bold; box-shadow: 0 4px 12px rgba(233,69,96,0.4); }
      .checkin-btn:disabled { background: #aaa; box-shadow: none; color: #ddd; cursor: not-allowed; }
      .checkin-close-btn { background: transparent; border: none; color: #555; margin-top: 10px; font-size: 0.9em; cursor: pointer; }
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
        checkinBtn.style.cssText = 'background:#f0ad4e;color:#000;';
        checkinBtn.onclick = openModal;
        container.appendChild(checkinBtn);
        fetchStatus();
      } else if (!container) {
        setTimeout(tryAppend, 300);
      }
    };
    tryAppend();
  }

  // 直接从 auth 拿电报 ID，不再查 profiles 表
  async function fetchStatus() {
    const profile = auth.currentProfile;
    if (!profile || !profile.telegram_id) return;

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
    if (state.canCheckin) {
      checkinBtn.disabled = false;
      checkinBtn.textContent = '📅 签到';
    } else if (state.waitHours > 0) {
      checkinBtn.disabled = true;
      checkinBtn.textContent = `⏳ ${state.waitHours}h后`;
    } else {
      checkinBtn.disabled = true;
      checkinBtn.textContent = '📅 暂不可用';
    }
  }

  function openModal() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'checkin-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const lastStr = state.lastTime ? new Date(state.lastTime).toLocaleString() : '从未签到';
    modal.innerHTML = `
      <div class="checkin-box">
        <h3>📅 每日签到</h3>
        <div class="checkin-points">${state.totalPoints} 积分</div>
        <div class="checkin-detail">上次签到：${lastStr}</div>
        <div class="checkin-status">${state.canCheckin ? '✅ 可以签到' : '⏳ 冷却中'}</div>
        <button id="modal-do" class="checkin-btn" ${state.canCheckin ? '' : 'disabled'}>${state.canCheckin ? '立即签到' : '已签到'}</button>
        <br>
        <button id="modal-close" class="checkin-close-btn">关闭</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modal-close').onclick = () => modal.remove();
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
            openModal();  // 重新打开显示最新积分
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
