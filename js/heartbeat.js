// ==================== 心跳维持 ====================
window.YYCardHeartbeat = (function() {
  const HEARTBEAT_INTERVAL_MS = 20000;
  let heartbeatTimer = null;

  async function sendHeartbeat(userId) {
    if (!userId || !window.supabase) return;
    try {
      const { error } = await window.supabase.from('online_users').upsert({
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
    sendHeartbeat(userId); // 立刻发一次
    heartbeatTimer = setInterval(() => sendHeartbeat(userId), HEARTBEAT_INTERVAL_MS);
    console.log('✅ 心跳已启动 (用户ID:', userId, ')');
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      console.log('⏹️ 心跳已停止');
    }
  }

  function setupCleanupOnUnload(userId) {
    if (!userId) return;
    window.addEventListener('beforeunload', async () => {
      try {
        await window.supabase.from('online_users').delete().eq('user_id', userId);
      } catch (e) {}
    });
  }

  return { startHeartbeat, stopHeartbeat, sendHeartbeat, setupCleanupOnUnload };
})();
