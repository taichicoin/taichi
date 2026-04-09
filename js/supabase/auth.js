import { supabase } from './client.js'

// ==================== 登录/退出（保留你的原有逻辑） ====================
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: "https://taichicoin.xyz/card"
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

export async function signOut() {
  await supabase.auth.signOut()
  window.location.reload()
}

// ==================== 用户资料核心功能 ====================
// 获取当前登录用户
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 获取当前用户完整profile信息
export async function getUserProfile() {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('获取用户资料失败:', error)
    return null
  }
  return data
}

// 检查钱包剩余冷却时间（小时）
export async function getWalletCooldownHours() {
  const profile = await getUserProfile()
  if (!profile) return 0

  const lastUpdate = new Date(profile.last_wallet_update)
  const now = new Date()
  const diffHours = (now - lastUpdate) / (1000 * 60 * 60)
  return Math.max(0, 168 - diffHours) // 7天=168小时
}

// 检查头像剩余冷却时间（小时）
export async function getAvatarCooldownHours() {
  const profile = await getUserProfile()
  if (!profile) return 0

  const lastUpdate = new Date(profile.last_avatar_update)
  const now = new Date()
  const diffHours = (now - lastUpdate) / (1000 * 60 * 60)
  return Math.max(0, 168 - diffHours)
}

// 修改钱包地址
export async function updateWalletAddress(newWalletAddress) {
  const user = await getCurrentUser()
  if (!user) {
    alert('请先登录')
    return false
  }

  // 前端预检查（提升体验，数据库还有最终校验）
  const cooldown = await getWalletCooldownHours()
  if (cooldown > 0) {
    alert(`钱包地址每7天只能修改一次，还剩${Math.ceil(cooldown)}小时`)
    return false
  }

  const { error } = await supabase
    .from('profiles')
    .update({ wallet_address: newWalletAddress.trim() })
    .eq('id', user.id)

  if (error) {
    // 捕获数据库返回的冷却错误
    if (error.message.includes('每7天只能修改一次')) {
      alert(error.message)
    } else {
      alert('修改失败：' + error.message)
    }
    return false
  }

  alert('钱包地址修改成功')
  return true
}

// 上传头像
export async function uploadAvatar(file) {
  const user = await getCurrentUser()
  if (!user) {
    alert('请先登录')
    return null
  }

  // 前端预检查冷却时间
  const cooldown = await getAvatarCooldownHours()
  if (cooldown > 0) {
    alert(`头像每7天只能修改一次，还剩${Math.ceil(cooldown)}小时`)
    return null
  }

  try {
    // 生成唯一文件名：用户ID/时间戳.后缀
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${Date.now()}.${fileExt}`

    // 上传到avatars存储桶
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) throw uploadError

    // 获取公开URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    // 更新用户资料中的头像地址
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)

    if (updateError) throw updateError

    alert('头像修改成功')
    return publicUrl
  } catch (e) {
    if (e.message.includes('每7天只能修改一次')) {
      alert(e.message)
    } else {
      alert('头像上传失败：' + e.message)
    }
    return null
  }
}

// ==================== 游戏页面专用：初始化用户信息 ====================
// 页面加载时自动调用，显示右上角用户信息
export async function initGameUserInfo() {
  const user = await getCurrentUser()
  const userInfoDiv = document.getElementById('user-info')
  const walletForm = document.getElementById('wallet-form')

  if (!user) {
    // 未登录状态
    userInfoDiv.innerHTML = '<button onclick="signInWithGoogle()">谷歌登录</button>'
    if (walletForm) walletForm.style.display = 'none'
    return
  }

  // 已登录状态
  const profile = await getUserProfile()
  if (!profile) return

  // 显示右上角用户信息（适配你的游戏UI）
  userInfoDiv.innerHTML = `
    <img src="${profile.avatar_url}" width="32" height="32" style="border-radius: 50%; vertical-align: middle; margin-right: 8px;">
    <span>${profile.full_name}</span>
    <button onclick="signOut()" style="margin-left: 12px;">退出</button>
  `

  // 初始化钱包修改表单
  if (walletForm) {
    walletForm.style.display = 'block'
    const walletInput = document.getElementById('wallet-input')
    const walletBtn = document.getElementById('wallet-btn')
    
    walletInput.value = profile.wallet_address || ''
    
    // 检查冷却时间并禁用按钮
    const cooldown = await getWalletCooldownHours()
    if (cooldown > 0) {
      walletInput.disabled = true
      walletBtn.disabled = true
      walletBtn.textContent = `还剩${Math.ceil(cooldown)}小时可修改`
    }
  }
}

// ==================== 全局挂载（所有onclick都能调用） ====================
window.signInWithGoogle = signInWithGoogle
window.signOut = signOut
window.getCurrentUser = getCurrentUser
window.getUserProfile = getUserProfile
window.updateWalletAddress = updateWalletAddress
window.uploadAvatar = uploadAvatar
window.initGameUserInfo = initGameUserInfo

// 页面加载自动初始化用户信息
window.addEventListener('load', initGameUserInfo)
