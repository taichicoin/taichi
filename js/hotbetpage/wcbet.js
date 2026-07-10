// ==================== 世界杯下注模块 (wcbet.js) ====================
window.YYCardHotBet_wcbet = (() => {
  const WORKER_URL = 'https://wc-bet.nnsvp1.workers.dev';
  const MIN_BET = 50; // 最低下注金额

  async function placeBet(eventId, optionId, context) {
    // 每次调用时动态获取翻译函数，确保语言切换后仍然正确
    const t = (key) => (window._t ? window._t(key) : key);

    const { getBalance, getUser } = context;
    const user = getUser();
    if (!user) {
      alert(t('wcbet_please_login'));
      return;
    }

    const balance = await getBalance();
    if (balance < MIN_BET) {
      alert(t('wcbet_balance_too_low').replace('{min}', MIN_BET));
      return;
    }

    // 弹出输入框
    const promptText = t('wcbet_prompt').replace('{balance}', balance).replace('{min}', MIN_BET);
    const amountStr = prompt(promptText, MIN_BET);
    if (!amountStr) return; // 用户取消

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount < MIN_BET) {
      alert(t('wcbet_min_bet').replace('{min}', MIN_BET));
      return; // 金额不合法，直接返回，不弹确认框
    }
    if (amount > balance) {
      alert(t('wcbet_insufficient_balance'));
      return;
    }

    // 金额合法，弹出确认框（这里会正确显示中/英文）
    if (!confirm(t('wcbet_confirm').replace('{amount}', amount))) return;

    // 调用 Worker 下注
    try {
      const session = await window.supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) {
        alert(t('wcbet_token_expired'));
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
        alert(t('wcbet_success').replace('{balance}', result.new_balance));
        if (window.YYCardHotBet?.refresh) await window.YYCardHotBet.refresh();
      } else {
        alert(t('wcbet_fail').replace('{message}', result.message || t('unknown_error')));
      }
    } catch (e) {
      console.error(e);
      alert(t('wcbet_network_error'));
    }
  }

  return { placeBet };
})();
