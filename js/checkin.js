// ========== 签到模块（积分实时显示） ==========
window.YYCardCheckin = (function() {
  const CHECKIN_WORKER_URL = 'https://checkin-worker.nnsvp1.workers.dev';
  const supabase = window.supabase;

  let checkinBtn, modal;
  let state = { canCheckin: false, totalPoints: 0, waitHours: 0, lastTime: null };

  // 注入弹窗样式
  function injectStyles() {
    if (document.getElementById('checkin-style')) return;
    const s = document.createElement('style');
    s.id = 'checkin-style';
    s.textContent = '.checkin-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center}.checkin-box{background:#1e293b;border-radius:16px;padding:24px;width:85%;max-width:340px;color:#fff;text-align:center}.checkin-box h3{margin-top:0}.checkin-points{font-size:1.8em;color:#f0ad4e}.checkin-btn{background:#f0ad4e;border:none;border-radius:8px;padding:10px 24px;font-size:1em;margin-top:12px;color:#000;cursor:pointer}.checkin-btn:disabled{background:#555;color:#aaa}';
    document.head.appendChild(s);
  }

  // 创建签到按钮（等待 .action-buttons 容器）
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
        fetchStatus(); // 立即获取一次状态
      } else if (!container) {
        setTimeout(tryAppend, 300);
      }
    };
    tryAppend();
  }

  // 获取最新积分和冷却状态
  async function fetchStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // 1. 拿到 telegram_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', session.user.id)
      .single();
    if (!profile?.telegram_id) return;

    // 2. 直接读签到表
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
    updateBtn(); // 更新按钮文字
  }

  // 更新按钮状态和文字
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

  // 打开签到弹窗
  function openModal() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'checkin-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const lastStr = state.lastTime
      ? new Date(state.lastTime).toLocaleString()
      : '从未签到';

    modal.innerHTML = `
      <div class="checkin-box">
        <h3>📅 每日签到</h3>
        <div class="checkin-points">${state.totalPoints} 积分</div>
        <div style="color:#ccc;margin:8px 0;">上次签到：${lastStr}</div>
        <div id="modal-status">${state.canCheckin ? '✅ 可以签到' : '⏳ 冷却中'}</div>
        <button id="modal-do" class="checkin-btn" ${state.canCheckin ? '' : 'disabled'}>
          ${state.canCheckin ? '立即签到' : '已签到'}
        </button>
        <button class="checkin-btn" style="background:transparent;color:#aaa;margin-top:8px;" id="modal-close">关闭</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modal-close').onclick = () => modal.remove();

    if (state.canCheckin) {
      document.getElementById('modal-do').onclick = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          alert('登录过期');
          return;
        }

        const btn = document.getElementById('modal-do');
        btn.disabled = true;
        btn.textContent = '签到中...';

        try {
          const res = await fetch(CHECKIN_WORKER_URL + '?token=' + session.access_token, {
            method: 'POST'
          });
          const data = await res.json();

          if (data.success) {
            // ✅ 签到成功，重新拉取数据库最新状态
            await fetchStatus();

            // 关闭当前弹窗，重新打开以显示最新积分
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
