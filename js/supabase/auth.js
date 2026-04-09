import { supabase } from './client.js'

// ========== 谷歌登录（修复回调+作用域） ==========
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: "email profile",
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

// ========== 退出登录 ==========
export async function signOut() {
  await supabase.auth.signOut()
  window.location.reload()
}

// ========== 核心修复：等待session加载完成 ==========
export async function getCurrentUser() {
  // 先尝试直接获取
  const { data: { user }, error } = await supabase.auth.getUser()
  if (user) return user

  // 如果没拿到，等待onAuthStateChange事件
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        subscription.unsubscribe()
        resolve(session.user)
      }
    })
    // 超时兜底
    setTimeout(() => {
      subscription.unsubscribe()
      resolve(null)
    }, 10000)
  })
}

// ========== 获取profiles完整资料 ==========
export async function getUserProfile() {
  const user = await getCurrentUser()
  if(!user) return null
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,avatar_url,wallet_address,last_wallet_update,last_avatar_update")
    .eq("id", user.id)
    .single()
  if(error) {
    console.error("获取profile失败:", error)
    return null
  }
  return data
}

// ========== 冷却检测：钱包7天 ==========
export async function getWalletCD() {
  const p = await getUserProfile()
  if(!p) return 0
  const last = new Date(p.last_wallet_update)
  const diffH = (Date.now() - last.getTime()) / (1000*60*60)
  return Math.max(0, 168 - diffH)
}

// ========== 冷却检测：头像7天 ==========
export async function getAvatarCD() {
  const p = await getUserProfile()
  if(!p) return 0
  const last = new Date(p.last_avatar_update)
  const diffH = (Date.now() - last.getTime()) / (1000*60*60)
  return Math.max(0, 168 - diffH)
}

// ========== 绑定 / 修改钱包 ==========
export async function bindWalletFlow() {
  const user = await getCurrentUser()
  if(!user) return alert("请先登录")

  const cd = await getWalletCD()
  if(cd > 0){
    return alert(`钱包每7天可修改一次，剩余 ${Math.ceil(cd)} 小时`)
  }

  const addr = prompt("请输入你的钱包地址(0x开头):","")
  if(!addr || !addr.startsWith("0x")) return alert("地址格式错误")

  const { error } = await supabase
    .from("profiles")
    .update({ wallet_address: addr })
    .eq("id", user.id)

  if(error) return alert("失败: " + error.message)
  alert("钱包绑定成功")
  // 绑定后刷新页面更新按钮状态
  window.location.reload()
}

// ========== 上传头像（带7天冷却） ==========
export async function uploadUserAvatar(file) {
  const user = await getCurrentUser()
  if(!user) return alert("请先登录")

  const cd = await getAvatarCD()
  if(cd > 0){
    alert(`头像每7天可修改一次，剩余 ${Math.ceil(cd)} 小时`)
    return null
  }

  const ext = file.name.split(".").pop()
  const path = `${user.id}/${Date.now()}.${ext}`

  const { error:upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert:true })
  if(upErr) return alert("上传失败:"+upErr.message)

  const { data:{publicUrl} } = supabase.storage.from("avatars").getPublicUrl(path)

  const { error:writeErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id)
  if(writeErr) return alert("更新头像失败:"+writeErr.message)

  return publicUrl
}

// ========== 全局挂载给HTML调用 ==========
window.signInWithGoogle = signInWithGoogle
window.signOut = signOut
window.getCurrentUser = getCurrentUser
window.getUserProfile = getUserProfile
window.bindWalletFlow = bindWalletFlow
window.uploadUserAvatar = uploadUserAvatar
