// ==================== 世界杯下注模块 (wcbet.js) ====================
window.YYCardHotBet_wcbet = (() => {
  const WORKER_URL = 'https://wc-bet.nnsvp1.workers.dev';
  const MIN_BET = 50; // 最低下注金额
  const _t = window._t || ((key) => key); // 备用翻译函数

  async function placeBet(eventId, optionId, context) {
    const { getBalance, getUser } = context;
    const user = getUser();
    if (!user) {
      alert(_t('wcbet_please_login'));
      return;
    }

    const balance = await getBalance();
    if (balance < MIN_BET) {
      alert(_t('wcbet_balance_too_low').replace('{min}', MIN_BET));
      return;
    }

    // 弹出输入框
    const promptText = _t('wcbet_prompt').replace('{balance}', balance).replace('{min}', MIN_BET);
    const amountStr = prompt(promptText, MIN_BET);
    if (!amountStr) return; // 用户取消

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount < MIN_BET) {
      alert(_t('wcbet_min_bet').replace('{min}', MIN_BET));
      return; // 金额不合法，直接返回，不弹确认框
    }
    if (amount > balance) {
      alert(_t('wcbet_insufficient_balance'));
      return;
    }

    // 金额合法，弹出确认框
    if (!confirm(_t('wcbet_confirm').replace('{amount}', amount))) return;

    // 调用 Worker 下注
    try {
      const session = await window.supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) {
        alert(_t('wcbet_token_expired'));
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
        alert(_t('wcbet_success').replace('{balance}', result.new_balance));
        if (window.YYCardHotBet?.refresh) await window.YYCardHotBet.refresh();
      } else {
        alert(_t('wcbet_fail').replace('{message}', result.message || _t('unknown_error')));
      }
    } catch (e) {
      console.error(e);
      alert(_t('wcbet_network_error'));
    }
  }

  return { placeBet };
})();
