// ==================== 在线心跳 + 加载排队模块 (onlinecheck.js) ====================
window.YYCardOnlineCheck = (function() {
  const supabase = window.supabase;
  const maxOnline = 200;
  const queueThreshold = 190;
  const heartbeatIntervalMs = 20000;
  const checkIntervalMs = 5000;
  const loadDurationMs = 5000 + Math.random() * 5000; // 5~10秒进度条

  let heartbeatTimer = null;

  // ---------- 心跳（仅登录后调用）----------
  async function sendHeartbeat(userId) {
    if (!userId || !supabase) return;
    try {
      await supabase.from('online_users').upsert({
        user_id: userId,
        last_seen: new Date().toISOString()
      }, { onConflict: 'user_id' });
    } catch (e) {
      console.warn('心跳发送失败:', e);
    }
  }

  function startHeartbeat(userId) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sendHeartbeat(userId);
    heartbeatTimer = setInterval(() => sendHeartbeat(userId), heartbeatIntervalMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  // ---------- 获取在线人数（匿名可查）----------
  async function getOnlineCount() {
    if (!supabase) return 999;
    try {
      // 调用清理函数
      await supabase.rpc('cleanup_online_users');
      const { count, error } = await supabase
        .from('online_users')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', new Date(Date.now() - 120000).toISOString());
      if (error) throw error;
      return count || 0;
    } catch (e) {
      console.error('获取在线人数失败:', e);
      return 999;
    }
  }

  // ---------- 排队遮罩 UI ----------
  function createOverlay() {
    if (document.getElementById('queue-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'queue-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: #0b0f1c; z-index: 100000;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      color: white; font-family: sans-serif;
    `;
    overlay.innerHTML = `
      <div style="font-size: 28px; margin-bottom: 30px;">⚔️ YY Card</div>
      <div style="width: 80%; max-width: 300px; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; overflow: hidden; margin-bottom: 16px;">
        <div id="loading-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #f5d76e, #ffb347); border-radius: 3px; transition: width 0.3s ease;"></div>
      </div>
      <div id="loading-text" style="font-size: 16px; opacity: 0.9; margin-bottom: 8px;">正在加载资源...</div>
      <div id="online-count-text" style="font-size: 14px; color: #f5d76e;"></div>
      <div style="margin-top: 30px; font-size: 12px; opacity: 0.5;">山海经 · 西游 · 三国</div>
    `;
    document.body.appendChild(overlay);
  }

  function updateProgress(percent, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = Math.min(100, percent) + '%';
    if (txt && text) txt.textContent = text;
  }

  function updateOnlineCount(count) {
    const el = document.getElementById('online-count-text');
    if (el) el.textContent = `当前在线：${count} / ${maxOnline}`;
  }

  function removeOverlay() {
    const overlay = document.getElementById('queue-overlay');
    if (overlay) overlay.remove();
  }

  // ---------- 排队（无需用户 ID）----------
  async function queueBeforeLogin() {
    createOverlay();
    const startTime = Date.now();
    let online = await getOnlineCount();
    updateOnlineCount(online);

    return new Promise(resolve => {
      // 阶段1：模拟进度条
      function tick() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / loadDurationMs) * 100);
        updateProgress(progress, progress < 100 ? '正在加载资源...' : '加载完成');
        // 每2秒刷新一次在线人数
        if (Math.floor(elapsed / 2000) !== Math.floor((elapsed - 50) / 2000)) {
          getOnlineCount().then(count => { online = count; updateOnlineCount(count); });
        }
        if (progress < 100) {
          requestAnimationFrame(tick);
        } else {
          checkQueue();
        }
      }
      requestAnimationFrame(tick);

      // 阶段2：排队检查
      async function checkQueue() {
        online = await getOnlineCount();
        updateOnlineCount(online);
        if (online <= queueThreshold) {
          removeOverlay();
          resolve(true);
          return;
        }
        updateProgress(100, '服务器繁忙，正在排队...');
        const poll = setInterval(async () => {
          online = await getOnlineCount();
          updateOnlineCount(online);
          if (online <= queueThreshold) {
            clearInterval(poll);
            removeOverlay();
            resolve(true);
          }
        }, checkIntervalMs);
      }
    });
  }

  // 页面关闭清理
  function setupCleanupOnUnload(userId) {
    if (!userId) return;
    window.addEventListener('beforeunload', async () => {
      try {
        await supabase.from('online_users').delete().eq('user_id', userId);
      } catch (e) {}
    });
  }

  return {
    startHeartbeat,
    stopHeartbeat,
    getOnlineCount,
    queueBeforeLogin,            // 新方法：登录前排队
    setupCleanupOnUnload
  };
})();
