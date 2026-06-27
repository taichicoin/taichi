// ========== 签到模块 (带弹窗) ==========
window.YYCardCheckin = (function() {
  const CHECKIN_WORKER_URL = 'https://checkin-worker.你的子域.workers.dev';

  // ---------- 工具：获取 Supabase 客户端和 token ----------
  function getSupabaseClient() {
    if (window.supabase) return window.supabase;
    if (typeof supabase !== 'undefined') return supabase;
    return null;
  }

  async function getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    return session.access_token;
  }

  // ---------- UI 元素 ----------
  let checkinBtn = null;
  let modal = null;
  let modalContent = null;

  // 状态
  let checkinState = {
    canCheckin: false,
    totalPoints: 0,
    waitHours: 0,
    lastTime: null
  };

  // ---------- 创建弹窗 CSS ----------
  function injectStyles() {
    if (document.getElementById('checkin-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'checkin-modal-style';
    style.textContent = `
      .checkin-modal-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); display: flex; align-items: center;
        justify-content: center; z-index: 9999;
      }
      .checkin-modal {
        background: #1e293b; border-radius: 16px; padding: 24px;
        width: 85%; max-width: 340px; color: #fff; text-align: center;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      }
      .checkin-modal h3 { margin-top: 0; }
      .checkin-points { font-size: 1.5em; font-weight: bold; color: #f0ad4e; }
      .checkin-detail { font-size: 0.9em; color: #ccc; margin: 8px 0; }
      .checkin-status { font-size: 1.2em; margin: 12px 0; }
      .checkin-modal button {
        background: #f0ad4e; border: none; border-radius: 8px;
        padding: 10px 24px; font-size: 1em; margin-top: 10px;
        cursor: pointer; color: #000;
      }
      .checkin-modal button:disabled {
        background: #555; color: #aaa; cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- 创建按钮 ----------
  function createUI() {
    injectStyles();

    const actionArea = document.querySelector('.action-buttons');
    if (!actionArea) return;

    checkinBtn = document.createElement('button');
    checkinBtn.className = 'btn';
    checkinBtn.textContent = '📅 签到';
    checkinBtn.style.cssText = 'background:#f0ad4e;color:#000;';
    checkinBtn.addEventListener('click', openModal);

    actionArea.appendChild(checkinBtn);
  }

  // ---------- 弹窗逻辑 ----------
  function openModal() {
    // 移除旧弹窗
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.className = 'checkin-modal-overlay';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modalContent = document.createElement('div');
    modalContent.className = 'checkin-modal';
    modal.appendChild(modalContent);

    renderModalContent();
    document.body.appendChild(modal);
  }

  function closeModal() {
    if (modal) modal.remove();
    modal = null;
  }

  // 渲染弹窗内容
  async function renderModalContent() {
    // 先展示加载
    modalContent.innerHTML = `<p>加载中...</p>`;
    await fetchStatus();  // 刷新状态
    if (!modalContent) return;  // 可能已关闭

    const { canCheckin, totalPoints, waitHours, lastTime } = checkinState;

    let statusHtml = '';
    let buttonHtml = '';

    if (canCheckin) {
      statusHtml = '✅ 今日尚未签到';
      buttonHtml = `<button id="do-checkin-btn">签到领积分</button>`;
    } else if (waitHours > 0) {
      statusHtml = `⏳ 冷却中，剩余约 ${waitHours} 小时`;
      buttonHtml = `<button disabled>冷却中</button>`;
    } else {
      // 从未签到或异常
      statusHtml = '📅 可签到';
      buttonHtml = `<button id="do-checkin-btn">签到领积分</button>`;
    }

    let lastTimeStr = '从未签到';
    if (lastTime) {
      const d = new Date(lastTime);
      lastTimeStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    modalContent.innerHTML = `
      <h3>📅 每日签到</h3>
      <div class="checkin-points">积分：${totalPoints}</div>
      <div class="checkin-detail">上次签到：${lastTimeStr}</div>
      <div class="checkin-status">${statusHtml}</div>
      ${buttonHtml}
      <button id="close-checkin-modal" style="background:transparent;color:#aaa;margin-top:8px;">关闭</button>
    `;

    // 绑定事件
    const doBtn = document.getElementById('do-checkin-btn');
    if (doBtn) {
      doBtn.addEventListener('click', performCheckin);
    }
    document.getElementById('close-checkin-modal').addEventListener('click', closeModal);
  }

  // 执行签到
  async function performCheckin() {
    const doBtn = document.getElementById('do-checkin-btn');
    if (doBtn) {
      doBtn.disabled = true;
      doBtn.textContent = '签到中...';
    }
    const token = await getAccessToken();
    if (!token) {
      alert('登录已过期，请重新进入');
      closeModal();
      return;
    }
    try {
      const res = await fetch(CHECKIN_WORKER_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        // 签到成功，刷新状态并重新渲染弹窗
        await fetchStatus();
        renderModalContent();
      } else {
        alert(data.message || '签到失败');
        closeModal();
      }
    } catch (e) {
      alert('网络错误');
      closeModal();
    }
  }

  // ---------- 获取签到状态 ----------
  async function fetchStatus() {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${CHECKIN_WORKER_URL}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      checkinState.canCheckin = data.can_checkin;
      checkinState.totalPoints = data.total_points;
      checkinState.waitHours = data.wait_hours || 0;
      checkinState.lastTime = data.last_checkin_time;
    } catch (e) {
      console.warn('签到状态查询失败:', e);
    }
  }

  // ---------- 对外接口 ----------
  return {
    init: async function() {
      createUI();
      // 可选：定时刷新状态，但弹窗打开时才刷新也可以
    }
  };
})();
