import { supabase } from './client.js'

// 谷歌登录，固定回调 signup
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: "https://taichicoin.xyz/signup",
      scopes: "email profile"
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

// 退出直接跳登录页
export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = "/signup"
}

// 【修复】原生简单获取用户，没有任何监听！！！
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

// 获取资料
export async function getUserProfile() {
  const user = await getCurrentUser()
  if(!user) return null
  const { data } = await supabase
    .from("profiles")
    .select("id,email,full_name,avatar_url,wallet_address,last_wallet_update,last_avatar_update")
    .eq("id", user.id)
    .single()
  return data
}

// 钱包冷却
export async function getWalletCD() {
  const p = await getUserProfile()
  if(!p) return 0
  const diffH = (Date.now() - new Date(p.last_wallet_update).getTime()) / 3600000
  return Math.max(0, 168 - diffH)
}

// 头像冷却
export async function getAvatarCD() {
  const p = await getUserProfile()
  if(!p) return 0
  const diffH = (Date.now() - new Date(p.last_avatar_update).getTime()) / 3600000
  return Math.max(0, 168 - diffH)
}

// 绑定钱包
export async function bindWalletFlow() {
  const user = await getCurrentUser()
  if(!user) return alert("请先登录")

  const cd = await getWalletCD()
  if(cd > 0) return alert(`钱包7天冷却，剩余 ${Math.ceil(cd)} 小时`)

  const addr = prompt("输入0x钱包地址：")
  if(!addr?.startsWith("0x")) return alert("地址错误")

  await supabase.from("profiles")
    .update({ wallet_address: addr })
    .eq("id", user.id)

  alert("绑定成功")
  location.reload()
}

// 上传头像
export async function uploadUserAvatar(file) {
  const user = await getCurrentUser()
  if(!user) return null
  const cd = await getAvatarCD()
  if(cd > 0) {
    alert(`头像7天冷却，剩余 ${Math.ceil(cd)} 小时`)
    return null
  }

  const path = `${user.id}/${Date.now()}.${file.name.split('.').pop()}`
  const { error } = await supabase.storage.from("avatars").upload(path,file,{upsert:true})
  if(error) return null

  const {data:{publicUrl}} = supabase.storage.from("avatars").getPublicUrl(path)
  await supabase.from("profiles").update({avatar_url:publicUrl}).eq("id",user.id)
  return publicUrl
}

// 全局挂载
window.signInWithGoogle = signInWithGoogle
window.signOut = signOut
window.getCurrentUser = getCurrentUser
window.getUserProfile = getUserProfile
window.bindWalletFlow = bindWalletFlow
window.uploadUserAvatar = uploadUserAvatar
