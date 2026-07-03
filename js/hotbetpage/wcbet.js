// ==================== 世界杯下注模块 (wcbet.js) ====================
window.YYCardHotBet_wcbet = (() => {
  const WORKER_URL = 'https://wc-bet.nnsvp1.workers.dev';
  const MIN_BET = 10; // 最低下注金额

  async function placeBet(eventId, optionId, context) {
    const { getBalance, getUser } = context;
    const user = getUser();
    if (!user) {
      alert('请先登录');
      return;
    }

    const balance = await getBalance();
    if (balance < MIN_BET) {
      alert(`积分不足，最低下注 ${MIN_BET} WOOD，请先签到`);
      return;
    }

    // 弹出输入框
    const amountStr = prompt(`下注金额（余额：${balance} WOOD，最低 ${MIN_BET} WOOD）`, MIN_BET);
    if (!amountStr) return; // 用户取消

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount < MIN_BET) {
      alert(`最低下注 ${MIN_BET} WOOD`);
      return; // 金额不合法，直接返回，不弹确认框
    }
    if (amount > balance) {
      alert('积分不足');
      return;
    }

    // 金额合法，弹出确认框
    if (!confirm(`确认用 ${amount} WOOD 下注？`)) return;

    // 调用 Worker 下注
    try {
      const session = await window.supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) {
        alert('授权过期，请重新登录');
        return;
      }

      const resp = await fetch(`${WORKER_URL}/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ event_id: eventId, option_id: optionId, amount })
      });

      const result = await resp.json();
      if (result.success) {
        alert(`✅ 下注成功！剩余积分：${result.new_balance} WOOD`);
        if (window.YYCardHotBet?.refresh) await window.YYCardHotBet.refresh();
      } else {
        alert(`❌ 失败：${result.message || '未知错误'}`);
      }
    } catch (e) {
      console.error(e);
      alert('网络错误，请稍后重试');
    }
  }

  return { placeBet };
})();
