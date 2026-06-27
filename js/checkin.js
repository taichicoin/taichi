// ========== 签到模块（完全独立，自动等待 UI） ==========
window.YYCardCheckin = (function() {
  // 🔧 改成你自己的 Worker 地址
  const CHECKIN_WORKER_URL = 'https://checkin-worker.你的子域.workers.dev';

  let checkinBtn, modal;
  let state = { canCheckin: false, totalPoints: 0, waitHours: 0, lastTime: null };

  // 获取 Supabase 客户端和 token
  function getSupabaseClient() {
    if (window.supabase) return window.supabase;
    if (typeof supabase !== 'undefined') return supabase;
    return null;
  }
  async function getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    return session.access_token;
  }

  // 注入弹窗样式
  function injectStyles() {
    if (document.getElementById('checkin-style')) return;
    const s = document.createElement('style');
    s.id = 'checkin-style';
    s.textContent = `
      .checkin-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center}
      .checkin-box{background:#1e293b;border-radius:16px;padding:24px;width:85%;max-width:340px;color:#fff;text-align:center}
      .checkin-box h3{margin-top:0}
      .checkin-points{font-size:1.8em;color:#f0ad4e}
      .checkin-btn{background:#f0ad4e;border:none;border-radius:8px;padding:10px 24px;font-size:1em;margin-top:12px;color:#000;cursor:pointer}
      .checkin-btn:disabled{background:#555;color:#aaa}
    `;
    document.head.appendChild(s);
  }

  // 创建按钮（等待 .action-buttons 出现）
  function createUI() {
    injectStyles();
    function tryAppend() {
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
        setTimeout(tryAppend, 300);  // 容器还没渲染，300ms 后重试
      }
    }
    tryAppend();
  }

  // 查询签到状态
  async function fetchStatus() {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${CHECKIN_WORKER_URL}/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      state.canCheckin = data.can_checkin;
      state.totalPoints = data.total_points;
      state.waitHours = data.wait_hours || 0;
      state.lastTime = data.last_checkin_time;
      updateBtn();
    } catch (e) {}
  }

  // 更新按钮文字与状态
  function updateBtn() {
    if (!checkinBtn) return;
    if (state.canCheckin) {
      checkinBtn.disabled = false;
      checkinBtn.textContent = '📅 签到';
      checkinBtn.style.backgroundColor = '#f0ad4e';
    } else if (state.waitHours > 0) {
      checkinBtn.disabled = true;
      checkinBtn.textContent = `⏳ ${state.waitHours}h后`;
      checkinBtn.style.backgroundColor = '#666';
    } else {
      checkinBtn.disabled = true;
      checkinBtn.textContent = '📅 暂不可用';
      checkinBtn.style.backgroundColor = '#666';
    }
  }

  // 打开签到弹窗
  function openModal() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'checkin-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const box = document.createElement('div');
    box.className = 'checkin-box';
    const lastStr = state.lastTime ? new Date(state.lastTime).toLocaleString() : '从未签到';
    box.innerHTML = `
      <h3>📅 每日签到</h3>
      <div class="checkin-points">${state.totalPoints} 积分</div>
      <div style="color:#ccc;margin:8px 0;">上次签到：${lastStr}</div>
      <div id="modal-status">${state.canCheckin ? '✅ 可以签到' : '⏳ 冷却中'}</div>
      <button id="modal-do" class="checkin-btn" ${state.canCheckin ? '' : 'disabled'}>
        ${state.canCheckin ? '立即签到' : '已签到'}
      </button>
      <button class="checkin-btn" style="background:transparent;color:#aaa;margin-top:8px;" id="modal-close">关闭</button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('modal-close').onclick = () => modal.remove();
    if (state.canCheckin) {
      document.getElementById('modal-do').onclick = async () => {
        const token = await getAccessToken();
        if (!token) return alert('登录过期');
        document.getElementById('modal-do').disabled = true;
        document.getElementById('modal-do').textContent = '签到中...';
        try {
          const res = await fetch(CHECKIN_WORKER_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) {
            await fetchStatus();
            modal.remove();
            openModal();  // 刷新弹窗显示最新状态
          } else {
            alert(data.message || '签到失败');
            document.getElementById('modal-do').disabled = false;
            document.getElementById('modal-do').textContent = '立即签到';
          }
        } catch (e) {
          alert('网络错误');
          document.getElementById('modal-do').disabled = false;
          document.getElementById('modal-do').textContent = '立即签到';
        }
      };
    }
  }

  return {
    init: function() {
      createUI();
    }
  };
})();
