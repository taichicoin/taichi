// ==================== 世界杯预测子模块（含倒计时、赔率、双语） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;
  const _t = window._t || ((key) => key);
  let countdownTimer = null;

  async function loadWorldcupEvents() {
    try {
      const { data: events, error } = await supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .order('start_time', { ascending: true });

      if (error || !events || events.length === 0) return [];

      const eventIds = events.map(e => e.id);
      const { data: options } = await supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);

      const { data: betStats } = await supabase
        .from('hotbet_bets')
        .select('option_id, amount')
        .in('event_id', eventIds);

      const optionBets = {};
      if (betStats) {
        betStats.forEach(b => {
          optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
        });
      }

      return events.map(event => ({
        id: event.id,
        title: event.title,
        status: event.status,
        base_pool: event.base_pool || 0,
        start_time: event.start_time,
        end_time: event.end_time,
        bet_end_time: event.bet_end_time,
        options: (options || [])
          .filter(o => o.event_id === event.id)
          .map(opt => ({
            id: opt.id,
            name: opt.option_name,
            total_bet: (opt.total_bet != null ? opt.total_bet : (optionBets[opt.id] || 0))
          }))
      }));
    } catch (e) {
      console.error('加载世界杯事件失败:', e);
      return [];
    }
  }

  function formatCountdown(endTimeStr) {
    const now = Date.now();
    const end = new Date(endTimeStr).getTime();
    const diff = end - now;

    if (diff <= 0) return _t('countdown_ended');

    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days}${_t('day')}${hours}${_t('hour')}${minutes}${_t('minute')}${seconds}${_t('second')}`;
    } else {
      return `${hours}${_t('hour')}${minutes}${_t('minute')}${seconds}${_t('second')}`;
    }
  }

  function updateCountdowns() {
    const elements = document.querySelectorAll('.bet-countdown');
    elements.forEach(el => {
      const endTime = el.dataset.betEnd;
      if (endTime) {
        el.textContent = formatCountdown(endTime);
      }
    });
  }

  async function render(containerDiv, context) {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    containerDiv.innerHTML = `<p style="text-align:center;color:#64748b;"> ${_t('loading')}</p>`;

    const events = await loadWorldcupEvents();

    if (!events || events.length === 0) {
      containerDiv.innerHTML = `<p style="text-align:center;color:#64748b;">${_t('no_events')}</p>`;
      return;
    }

    let html = '<div class="hotbet-events">';
    events.forEach(event => {
      html += renderEventCard(event);
    });
    html += '</div>';
    containerDiv.innerHTML = html;

    containerDiv.querySelectorAll('.hotbet-option-bet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const eventId = e.currentTarget.dataset.eventId;
        const optionId = parseInt(e.currentTarget.dataset.optionId);
        if (window.YYCardHotBet_wcbet?.placeBet) {
          window.YYCardHotBet_wcbet.placeBet(eventId, optionId, {
            getBalance: () => window.YYCardHotBetChip?.getBalance() || 0,
            getUser: () => window.YYCardAuth?.currentUser
          });
        } else {
          alert(_t('bet_module_not_loaded'));
        }
      });
    });

    updateCountdowns();
    countdownTimer = setInterval(updateCountdowns, 1000);
  }

  function renderEventCard(event) {
    const statusConfig = {
      upcoming: { text: _t('status_upcoming'), color: '#10b981' },
      live: { text: _t('status_live'), color: '#ef4444' },
      ended: { text: _t('status_ended'), color: '#6b7280' }
    };
    const statusInfo = statusConfig[event.status] || { text: event.status, color: '#6b7280' };

    const totalBet = (event.options || []).reduce((sum, opt) => sum + (opt.total_bet || 0), 0);
    const totalPool = (event.base_pool || 0) + totalBet;

    const formatTime = (t) => {
      if (!t) return _t('tbd');
      return new Date(t).toLocaleString('zh-CN', { hour12: false });
    };

    const betEndStr = event.bet_end_time ? formatTime(event.bet_end_time) : _t('no_limit');
    const isBetOver = event.bet_end_time ? new Date(event.bet_end_time).getTime() < Date.now() : false;
    const disableBet = event.status === 'ended' || isBetOver;

    const countdownHtml = event.bet_end_time
      ? `<span class="bet-countdown" data-bet-end="${event.bet_end_time}" style="color:#f59e0b; font-weight:600; margin-left:8px;">${_t('calculating')}</span>`
      : '';

    let optionsHtml = '';
    if (event.options && event.options.length > 0) {
      event.options.forEach(opt => {
        let odds = 0;
        if (totalBet > 0 && opt.total_bet > 0) {
          odds = totalPool / opt.total_bet;
        }
        const oddsDisplay = odds > 0 ? `×${odds.toFixed(2)}` : '--';

        optionsHtml += `
          <div class="hotbet-option">
            <span class="hotbet-option-name">${opt.name}</span>
            <span style="font-size:0.8rem; color:#3b82f6; font-weight:600; margin:0 8px;">
              ${oddsDisplay}
            </span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="hotbet-option-bet-btn"
                      data-event-id="${event.id}"
                      data-option-id="${opt.id}"
                      ${disableBet ? 'disabled' : ''}>${disableBet ? _t('event_bet_end') : _t('event_bet_btn')}</button>
            </div>
          </div>
        `;
      });
    } else {
      optionsHtml = `<p style="color:#999;">${_t('event_no_options')}</p>`;
    }

    return `
      <div class="hotbet-event-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="hotbet-event-title" style="margin-bottom: 4px;">
            <span>${event.title}</span>
          </div>
          <span style="font-size:0.75rem; font-weight:600; color:${statusInfo.color}; background:${statusInfo.color}10; padding:2px 10px; border-radius:12px;">
            ${statusInfo.text}
          </span>
        </div>
        <div style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
          ⏰ ${_t('event_match_time')}：${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}
          <br>⛔ ${_t('event_bet_deadline')}：${betEndStr}${countdownHtml}
          <br> ${_t('event_base_pool')}：<strong>${event.base_pool || 0} WOOD</strong> |  ${_t('event_total_pool')}：<strong>${totalPool} WOOD</strong>
        </div>
        <div class="hotbet-options">
          ${optionsHtml}
        </div>
      </div>
    `;
  }

  function destroy() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  return { render, destroy };
})();
