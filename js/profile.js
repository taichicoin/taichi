let currentUser = null;

async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/yycard/signup';
        return null;
    }
    currentUser = user;
    return user;
}

async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/yycard/signup';
}

// 确保 profiles 记录存在
async function ensureProfile() {
    if (!currentUser) return;
    await supabase.from('profiles').upsert({
        id: currentUser.id,
        display_name: currentUser.user_metadata?.full_name || currentUser.email,
        avatar_url: currentUser.user_metadata?.avatar_url,
    }, { onConflict: 'id' });
}
