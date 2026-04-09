import { supabase } from './client.js'

// 谷歌登录（修复：登录后直接跳回游戏页 /card）
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // ✅ 改这里：写死游戏完整地址，不再跳回主页
      redirectTo: "https://taichicoin.xyz/card"
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

// 退出登录
export async function signOut() {
  await supabase.auth.signOut()
  window.location.reload()
}

// 获取当前用户
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 全局挂载（解决点击没反应）
window.signInWithGoogle = signInWithGoogle
window.signOut = signOut
window.getCurrentUser = getCurrentUser
