let currentProfile = null;

async function loadProfile() {
    const { data } = await supabase.from('profiles')
        .select('*').eq('id', currentUser.id).single();
    currentProfile = data;
    updateLobbyUI();
    return data;
}

function updateLobbyUI() {
    document.getElementById('lobby-avatar').src = currentProfile.avatar_url || '/assets/default-avatar.png';
    document.getElementById('lobby-username').textContent =
        currentProfile.username || currentProfile.display_name || currentUser.email;
    const wallet = currentProfile.wallet_address;
    document.getElementById('lobby-wallet').textContent = wallet ? formatAddress(wallet) : '未绑定钱包';

    const btn = document.getElementById('start-match-btn');
    if (!currentProfile.username) {
        btn.disabled = true;
        btn.textContent = '请先设置游戏ID';
    } else {
        btn.disabled = false;
        btn.textContent = '⚡ 开始匹配';
    }
}

// 设置用户名
async function setUsernameHandler() {
    const modal = document.getElementById('username-modal');
    const input = document.getElementById('username-input');
    const err = document.getElementById('username-error');
    modal.style.display = 'flex';
    
    document.getElementById('confirm-username-btn').onclick = async () => {
        const val = input.value.trim();
        if (!isValidUsername(val)) { err.textContent = '必须是7位小写字母或数字'; return; }
        const { data: exist } = await supabase.from('profiles').select('username').eq('username', val).maybeSingle();
        if (exist) { err.textContent = '该用户名已被使用'; return; }
        await supabase.from('profiles').update({ username: val }).eq('id', currentUser.id);
        modal.style.display = 'none';
        await loadProfile();
    };
}

// 绑定钱包
function bindWalletHandler() {
    const modal = document.getElementById('wallet-modal');
    const input = document.getElementById('wallet-input');
    const err = document.getElementById('wallet-error');
    modal.style.display = 'flex';
    input.value = '';
    err.textContent = '';
    
    document.getElementById('confirm-wallet-btn').onclick = async () => {
        const val = input.value.trim();
        if (!isValidEthAddress(val)) { err.textContent = '无效的以太坊地址'; return; }
        await supabase.from('profiles').update({ wallet_address: val }).eq('id', currentUser.id);
        modal.style.display = 'none';
        await loadProfile();
    };
    document.getElementById('cancel-wallet-btn').onclick = () => modal.style.display = 'none';
}

// 修改头像
function changeAvatarHandler() {
    const modal = document.getElementById('avatar-modal');
    const fileInput = document.getElementById('avatar-file-input');
    const status = document.getElementById('upload-status');
    const warn = document.getElementById('cooldown-warning');
    modal.style.display = 'flex';
    fileInput.value = '';
    status.innerHTML = '';
    
    const cooldown = calculateCooldown(currentProfile.avatar_last_modified);
    warn.textContent = cooldown.canChange ? '' : `冷却中，剩余 ${formatRemaining(cooldown.remaining)}`;
    
    document.getElementById('upload-avatar-btn').onclick = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (!cooldown.canChange) { alert('头像每15天只能修改一次'); return; }
        const ext = file.name.split('.').pop();
        const path = `${currentUser.id}_${Date.now()}.${ext}`;
        status.innerHTML = '上传中...';
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
        if (upErr) { status.innerHTML = '上传失败'; return; }
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        await supabase.from('profiles').update({
            avatar_url: urlData.publicUrl,
            avatar_last_modified: new Date().toISOString()
        }).eq('id', currentUser.id);
        modal.style.display = 'none';
        await loadProfile();
    };
    document.getElementById('cancel-avatar-btn').onclick = () => modal.style.display = 'none';
}
