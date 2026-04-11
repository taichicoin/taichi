// 全局初始化入口
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 YY Card 初始化开始');
    
    // 1. 检查认证
    const user = await checkAuth();
    if (!user) return;
    
    // 2. 确保 profiles 记录存在（关键！）
    const profile = await ensureProfile();
    if (!profile) {
        console.error('❌ 无法创建用户档案');
        return;
    }
    
    // 3. 加载完整档案
    await loadProfile();
    
    // 4. 设置模态框
    setupUsernameModal();
    setupWalletModal();
    setupAvatarModal();
    
    // 5. 绑定大厅按钮
    document.getElementById('logout-btn').addEventListener('click', signOut);
    document.getElementById('start-match-btn').addEventListener('click', startMatchmaking);
    
    // 6. 绑定对战按钮
    document.getElementById('end-prepare-btn').addEventListener('click', endPreparePhase);
    document.getElementById('refresh-shop').addEventListener('click', refreshShop);
    document.getElementById('leave-room-btn').addEventListener('click', () => {
        document.getElementById('battle-view').classList.remove('active');
        document.getElementById('lobby-view').classList.add('active');
        if (roomSubscription) roomSubscription.unsubscribe();
        if (gameSubscription) gameSubscription.unsubscribe();
    });
    
    console.log('✅ 大厅初始化完成，所有功能已就绪');
});
