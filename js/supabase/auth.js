import { supabase } from './client.js'
import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@supabase/auth-helpers-ethers'
import { verifyMessage } from 'https://esm.sh/ethers@6'

// 钱包配置（替换成你自己的WalletConnect项目ID）
const WALLETCONNECT_PROJECT_ID = '你的WalletConnect项目ID'
const metadata = {
  name: '太极YY Card',
  description: '多阵营卡牌对战游戏',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/14985020']
}

const config = defaultConfig({ metadata, chains: [1, 56], enableEmail: false })
const web3Modal = createWeb3Modal({ ethersConfig: config, projectId: WALLETCONNECT_PROJECT_ID, chains: [1, 56] })

// ✅ 谷歌登录（代码完整，只需要后台配置）
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin // 必须和Supabase后台填的一致
    }
  })
  if (error) alert('谷歌登录失败：' + error.message)
}

// 钱包登录
export async function signInWithWallet() {
  try {
    await web3Modal.open()
    const address = web3Modal.getAddress()
    if (!address) return

    const nonce = crypto.randomUUID()
    const message = `登录太极YY Card\n地址：${address}\n随机码：${nonce}\n\n此操作不会产生任何Gas费用`
    const signature = await web3Modal.signMessage({ message })
    
    const recoveredAddress = verifyMessage(message, signature).toLowerCase()
    if (recoveredAddress !== address.toLowerCase()) {
      alert('签名验证失败')
      return
    }

    let { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'custom',
      token: btoa(JSON.stringify({ address: recoveredAddress, nonce }))
    })

    if (error) {
      const { data: { user } } = await supabase.auth.signInAnonymously()
      await supabase.from('profiles').update({ wallet_address: recoveredAddress }).eq('id', user.id)
    }

    window.location.reload()
  } catch (e) {
    alert('钱包登录失败：' + e.message)
  }
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

// 全局挂载
window.signInWithGoogle = signInWithGoogle
window.signInWithWallet = signInWithWallet
window.signInAsGuest = signInAsGuest
window.signOut = signOut
window.getCurrentUser = getCurrentUser
