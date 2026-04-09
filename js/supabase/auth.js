import { supabase } from './client.js'

// ✅ 谷歌登录
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

// 游客登录
export async function signInAsGuest(username) {
  const { data: { user }, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  
  await supabase
    .from('profiles')
    .update({ username: username })
    .eq('id', user.id)
  
  return user
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

// 全局挂载（解决你之前点击没反应）
window.signInWithGoogle = signInWithGoogle
window.signInAsGuest = signInAsGuest
window.signOut = signOut
window.getCurrentUser = getCurrentUser
