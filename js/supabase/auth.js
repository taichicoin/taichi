import { supabase } from './client.js'

// ✅ 谷歌登录（写死游戏页跳转，不依赖任何第三方包）
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
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

// 全局挂载（确保 onclick 能调用）
window.signInWithGoogle = signInWithGoogle
window.signOut = signOut
window.getCurrentUser = getCurrentUser
