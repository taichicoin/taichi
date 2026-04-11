let currentRoom = null;
let gameState = null;

// 全局初始化入口
window.initApp = async function() {
    console.log('🔥 initApp 开始执行');
    
    const user = await checkAuth();
    if (!user) return;
    
    await ensureProfile();      // 关键：确保数据库有记录
    await loadProfile();
    
    // 绑定事件
    document.getElementById('logout-btn').addEventListener('click', signOut);
    document.getElementById('start-match-btn').addEventListener('click', startMatchmaking);
    
    setupUsernameModal();
    setupWalletModal();
    setupAvatarModal();
    
    // 临时调试：退出房间按钮
    document.getElementById('leave-room-btn')?.addEventListener('click', () => {
        document.getElementById('lobby-view').classList.add('active');
        document.getElementById('battle-view').classList.remove('active');
    });
    
    console.log('✅ 大厅初始化完成，所有按钮已绑定');
};

// ---------- 匹配相关 ----------
async function startMatchmaking() {
    if (!currentProfile?.username) {
        alert('请先设置游戏ID');
        return;
    }
    
    const statusEl = document.getElementById('match-status');
    statusEl.textContent = '正在匹配...';
    
    // 简化：直接创建房间进入对战视图（演示用）
    // 实际匹配逻辑可根据之前设计补充
    setTimeout(() => {
        document.getElementById('lobby-view').classList.remove('active');
        document.getElementById('battle-view').classList.add('active');
        statusEl.textContent = '等待开始...';
    }, 1000);
}
