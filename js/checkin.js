// ========== 签到模块 ==========
window.YYCardCheckin = (function() {
  // ---------- 配置（改成你自己的） ----------
  const CHECKIN_WORKER_URL = 'https://checkin-worker.你的子域.workers.dev';

  // ---------- 获取 Supabase 客户端和 session ----------
  function getSupabaseClient() {
    // 优先用全局变量（你的 auth.js 里可能有 window.supabase）
    if (window.supabase) return window.supabase;
    // 若没有，用 CDN 暴露的 supabase 对象（大厅 HTML 里已加载 SDK）
    if (typeof supabase !== 'undefined') return supabase;
    console.error('❌ Supabase 客户端未找到');
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
  let checkinInfo = null;   // 显示积分/倒计时
  let checkinPanel = null;  // 可选弹出面板

  // 状态
  let checkinState = {
    canCheckin: false,
    totalPoints: 0,
    waitHours: 0,
    lastTime: null
  };

  // ---------- 初始化 UI（在大厅里插入签到按钮） ----------
  function createUI() {
    // 在 action-buttons 区域添加签到入口
    const actionArea = document.querySelector('.action-buttons');
    if (!actionArea) return;

    // 签到按钮
    checkinBtn = document.createElement('button');
    checkinBtn.className = 'btn';
    checkinBtn.textContent = '📅 签到';
    checkinBtn.style.cssText = 'background:#f0ad4e;color:#000;';

    // 签到信息条（放在按钮下方）
    checkinInfo = document.createElement('div');
    checkinInfo.style.cssText = 'font-size:0.85em;color:#ddd;margin-top:4px;text-align:center;';

    actionArea.appendChild(checkinBtn);
    actionArea.appendChild(checkinInfo);

    // 事件绑定
    checkinBtn.addEventListener('click', handleCheckin);
  }

  // ---------- 查询签到状态 ----------
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
      updateUI();
    } catch (e) {
      console.warn('签到状态查询失败:', e);
    }
  }

  // ---------- 执行签到 ----------
  async function handleCheckin() {
    if (!checkinState.canCheckin) return;
    checkinBtn.disabled = true;
    checkinBtn.textContent = '⏳ 签到中...';
    const token = await getAccessToken();
    if (!token) {
      checkinBtn.disabled = false;
      updateUI();
      return;
    }
    try {
      const res = await fetch(CHECKIN_WORKER_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(`签到成功！获得 ${data.points_added} 积分`);
        // 重新查询状态
        await fetchStatus();
      } else {
        alert(data.message || '签到失败');
        checkinBtn.disabled = false;
        updateUI();
      }
    } catch (e) {
      alert('网络错误，请重试');
      checkinBtn.disabled = false;
      updateUI();
    }
  }

  // ---------- 刷新 UI ----------
  function updateUI() {
    if (!checkinBtn || !checkinInfo) return;
    if (checkinState.canCheckin) {
      checkinBtn.disabled = false;
      checkinBtn.textContent = '📅 签到';
      checkinBtn.style.backgroundColor = '#f0ad4e';
      checkinInfo.textContent = `当前积分：${checkinState.totalPoints}`;
    } else if (checkinState.waitHours > 0) {
      checkinBtn.disabled = true;
      checkinBtn.textContent = `⏳ 冷却中 ${checkinState.waitHours}h`;
      checkinBtn.style.backgroundColor = '#666';
      checkinInfo.textContent = `还剩约 ${checkinState.waitHours} 小时`;
    } else {
      // 从未签到过，但状态却是 canCheckin false？可能是查询失败
      checkinBtn.disabled = true;
      checkinBtn.textContent = '📅 暂不可用';
      checkinInfo.textContent = '';
    }
  }

  // ---------- 对外接口 ----------
  return {
    init: async function() {
      createUI();
      await fetchStatus();
      // 定期刷新（1分钟一次，保持倒计时准确）
      setInterval(fetchStatus, 60000);
    }
  };
})();
