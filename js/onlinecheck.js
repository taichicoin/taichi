// ==================== 在线检查 + 心跳维持 (onlinecheck.js) ====================
window.YYCardOnlineCheck = (function() {
  const supabase = window.supabase;
  const maxOnline = 200;
  const loadDurationMs = 5000 + Math.random() * 5000;
  const heartbeatIntervalMs = 20000;

  let heartbeatTimer = null;

  // ---------- 心跳 ----------
  async function sendHeartbeat(userId) {
    if (!userId || !supabase) return;
    try {
      const { error } = await supabase.from('online_users').upsert({
        user_id: userId,
        last_seen: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) console.warn('心跳发送失败:', error);
    } catch (e) {
      console.warn('心跳异常:', e);
    }
  }

  function startHeartbeat(userId) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    sendHeartbeat(userId); // 立刻写一次
    heartbeatTimer = setInterval(() => sendHeartbeat(userId), heartbeatIntervalMs);
    console.log('✅ 心跳已启动 (用户ID:', userId, ')');
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      console.log('⏹️ 心跳已停止');
    }
  }

  // ---------- 获取在线人数 ----------
  async function getOnlineCount() {
    if (!supabase) return 999;
    try { await supabase.rpc('cleanup_online_users'); } catch (e) {}
    try {
      const { count, error } = await supabase
        .from('online_users')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', new Date(Date.now() - 120000).toISOString());
      if (error) {
        console.error('查询在线人数失败:', error.message);
        return 0;
      }
      const num = count || 0;
      console.log('当前在线人数:', num);
      return num;
    } catch (e) {
      console.error('查询异常:', e.message);
      return 0;
    }
  }

  // ---------- 加载排队界面 ----------
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
      <button id="retry-btn" style="display:none; margin-top: 20px; padding: 12px 32px; background: #f5d76e; color: #1a1a2e; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">重新尝试</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('retry-btn').addEventListener('click', () => {
      window.location.reload();
    });
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

  // ---------- 排队主流程 ----------
  async function showLoadingThenCheck() {
    createOverlay();
    const startTime = Date.now();
    let online = await getOnlineCount();
    updateOnlineCount(online);

    return new Promise(resolve => {
      function tick() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / loadDurationMs) * 100);
        updateProgress(progress, progress < 100 ? '正在加载资源...' : '加载完成，正在检查服务器...');

        if (Math.floor(elapsed / 2000) !== Math.floor((elapsed - 50) / 2000)) {
          getOnlineCount().then(count => { online = count; updateOnlineCount(count); });
        }

        if (progress < 100) {
          requestAnimationFrame(tick);
        } else {
          checkAndDecide();
        }
      }
      requestAnimationFrame(tick);

      async function checkAndDecide() {
        online = await getOnlineCount();
        updateOnlineCount(online);
        if (online >= maxOnline) {
          updateProgress(100, '⚠️ 服务器爆满，请稍后再试');
          document.getElementById('retry-btn').style.display = 'block';
        } else {
          const overlay = document.getElementById('queue-overlay');
          if (overlay) overlay.remove();
          resolve(true);
        }
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
    showLoadingThenCheck,
    setupCleanupOnUnload
  };
})();
