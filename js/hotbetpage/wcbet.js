// ==================== 世界杯下注模块 (wcbet.js) ====================
window.YYCardHotBet_wcbet = (() => {
  const WORKER_URL = 'https://wc-bet.nnsvp1.workers.dev';

  async function placeBet(eventId, optionId, context) {
    const { getBalance, getUser } = context;
    const user = getUser();
    if (!user) {
      alert('请先登录');
      return;
    }

    const balance = await getBalance();
    if (balance <= 0) {
      alert('积分不足，请先签到');
      return;
    }

    const amountStr = prompt(`下注金额（余额：${balance} WOOD）`, '10');
    if (!amountStr) return;

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert('请输入有效正整数');
      return;
    }
    if (amount > balance) {
      alert('积分不足');
      return;
    }

    if (!confirm(`确认用 ${amount} WOOD 下注？`)) return;

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
