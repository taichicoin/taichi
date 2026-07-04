// ==================== 在线心跳 + 加载排队模块 (onlinecheck.js) ====================
window.YYCardOnlineCheck = (function() {
  const supabase = window.supabase;
  const maxOnline = 200;
  const queueThreshold = 190;          // 开始排队的阈值
  const heartbeatIntervalMs = 20000;   // 心跳间隔 20 秒
  const checkIntervalMs = 5000;        // 排队时轮询间隔 5 秒
  const loadDurationMs = 5000 + Math.random() * 5000; // 加载进度条时长 5~10 秒

  let heartbeatTimer = null;
  let overlay = null;

  // ---------- 心跳 ----------
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

  async function getOnlineCount() {
    if (!supabase) return 999;
    try {
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

  // ---------- 加载/排队遮罩 ----------
  function createOverlay() {
    if (document.getElementById('queue-overlay')) return;
    overlay = document.createElement('div');
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
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // ---------- 加载 + 排队主流程 ----------
  async function showLoadingAndQueue(userId) {
    createOverlay();
    startHeartbeat(userId);

    const startTime = Date.now();
    let online = await getOnlineCount();
    updateOnlineCount(online);

    // 阶段一：模拟进度条 5~10 秒
    return new Promise(resolve => {
      function tick() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / loadDurationMs) * 100);
        updateProgress(progress, progress < 100 ? '正在加载资源...' : '加载完成');
        // 每 2 秒刷新一次在线人数
        if (Math.floor(elapsed / 2000) !== Math.floor((elapsed - 50) / 2000)) {
          getOnlineCount().then(count => { online = count; updateOnlineCount(count); });
        }
        if (progress < 100) {
          requestAnimationFrame(tick);
        } else {
          // 进度条走完，检查是否需要排队
          checkQueue();
        }
      }
      requestAnimationFrame(tick);

      // 阶段二：排队检查（复用已存在的遮罩）
      async function checkQueue() {
        online = await getOnlineCount();
        updateOnlineCount(online);
        if (online <= queueThreshold) {
          // 有空位，直接进入
          removeOverlay();
          resolve();
          return;
        }
        // 需要排队，切换界面文字
        updateProgress(100, '服务器繁忙，正在排队...');
        updateOnlineCount(online);
        // 轮询等待
        const poll = setInterval(async () => {
          online = await getOnlineCount();
          updateOnlineCount(online);
          if (online <= queueThreshold) {
            clearInterval(poll);
            removeOverlay();
            resolve();
          }
        }, checkIntervalMs);
      }
    });
  }

  // 页面关闭时清理（可选）
  function setupCleanupOnUnload(userId) {
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
    showLoadingAndQueue,    // 新方法
    setupCleanupOnUnload,
    // 保留旧方法兼容
    waitForSlot: showLoadingAndQueue
  };
})();
