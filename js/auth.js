let currentUser = null;

// 检查认证状态
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/yycard/signup';
        return null;
    }
    currentUser = user;
    console.log('👤 当前用户:', user.email);
    return user;
}

// 登出
async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/yycard/signup';
}

// 确保 profiles 记录存在（关键！解决数据库无记录问题）
async function ensureProfile() {
    if (!currentUser) return null;
    
    const { data, error } = await supabase
        .from('profiles')
        .upsert({
            id: currentUser.id,
            display_name: currentUser.user_metadata?.full_name || currentUser.email,
            avatar_url: currentUser.user_metadata?.avatar_url || '/yycard/assets/default-avatar.png',
            updated_at: new Date()
        }, { onConflict: 'id' })
        .select('*')
        .single();
    
    if (error) {
        console.error('❌ 创建/更新用户档案失败:', error);
        return null;
    }
    console.log('✅ 用户档案已同步:', data);
    return data;
}
