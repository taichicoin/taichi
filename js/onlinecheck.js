// ==================== 在线心跳与排队检查 (onlinecheck.js) ====================
window.YYCardOnlineCheck = (function() {
  const config = window.YYCardConfig;
  const supabase = window.supabase;

  let heartbeatTimer = null;
  let maxOnline = 200;           // 最大在线人数
  let queueThreshold = 190;      // 排队阈值（达到此人数即排队）
  let checkIntervalMs = 5000;    // 排队时轮询间隔（5秒）
  let heartbeatIntervalMs = 20000; // 心跳间隔（20秒）

  // ---------- 心跳（保持在线）----------
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
    sendHeartbeat(userId); // 立即发送一次
    heartbeatTimer = setInterval(() => sendHeartbeat(userId), heartbeatIntervalMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ---------- 清理过期记录并获取在线人数 ----------
  async function getOnlineCount() {
    if (!supabase) return 999; // 出错时返回大数，避免错过排队
    try {
      // 调用数据库清理函数（使用 rpc）
      await supabase.rpc('cleanup_online_users');
      // 统计最近 2 分钟内有心跳的记录
      const { count, error } = await supabase
        .from('online_users')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', new Date(Date.now() - 120000).toISOString());
      if (error) throw error;
      return count || 0;
    } catch (e) {
      console.error('获取在线人数失败:', e);
      return 999; // 失败时保守处理
    }
  }

  // ---------- 排队 UI ----------
  function createQueueOverlay() {
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
      <div style="font-size: 24px; margin-bottom: 20px;">⚔️ YY Card</div>
      <div style="margin-bottom: 30px; text-align: center;">
        <div id="queue-status-text" style="font-size: 18px; margin-bottom: 10px;">正在排队...</div>
        <div id="queue-count-text" style="font-size: 16px; color: #f5d76e;"></div>
      </div>
      <div class="queue-spinner" style="border: 4px solid rgba(255,255,255,0.2); border-top: 4px solid #f5d76e; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 40px; font-size: 12px; opacity: 0.6;">当前服务器繁忙，请耐心等待</div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
    document.body.appendChild(overlay);
  }

  function updateQueueUI(onlineCount) {
    const statusEl = document.getElementById('queue-status-text');
    const countEl = document.getElementById('queue-count-text');
    if (statusEl) statusEl.textContent = '正在排队...';
    if (countEl) countEl.textContent = `当前在线：${onlineCount} / ${maxOnline}  预计等待...`;
  }

  function removeQueueOverlay() {
    const overlay = document.getElementById('queue-overlay');
    if (overlay) overlay.remove();
  }

  // ---------- 排队等待函数（返回 true 表示可以进入）----------
  async function waitForSlot(userId) {
    createQueueOverlay();
    startHeartbeat(userId); // 排队期间也保持心跳

    return new Promise((resolve) => {
      async function check() {
        const online = await getOnlineCount();
        updateQueueUI(online);
        if (online <= queueThreshold) {
          // 有空位，停止轮询，关闭排队 UI
          removeQueueOverlay();
          resolve(true);
          return;
        }
        // 否则继续等待
        setTimeout(check, checkIntervalMs);
      }
      check();
    });
  }

  // ---------- 页面关闭时主动清除自己的心跳（可选）----------
  function setupCleanupOnUnload(userId) {
    window.addEventListener('beforeunload', async () => {
      try {
        await supabase.from('online_users').delete().eq('user_id', userId);
      } catch (e) {}
    });
  }

  // 暴露给外部
  return {
    startHeartbeat,
    stopHeartbeat,
    getOnlineCount,
    waitForSlot,
    setupCleanupOnUnload
  };
})();
