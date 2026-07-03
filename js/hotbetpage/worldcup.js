// ==================== 世界杯预测子模块（最终版·已接入下注） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

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
        bet_end_time: event.bet_end_time,   // ★ 传入截止时间
        options: (options || [])
          .filter(o => o.event_id === event.id)
          .map(opt => ({
            id: opt.id,
            name: opt.option_name,
            total_bet: optionBets[opt.id] || 0
          }))
      }));
    } catch (e) {
      console.error('加载世界杯事件失败:', e);
      return [];
    }
  }

  async function render(containerDiv, context) {
    containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">⏳ 加载中...</p>';

    const events = await loadWorldcupEvents();

    if (!events || events.length === 0) {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">暂无世界杯预测事件</p>';
      return;
    }

    let html = '<div class="hotbet-events">';
    events.forEach(event => {
      html += renderEventCard(event);
    });
    html += '</div>';
    containerDiv.innerHTML = html;

    // ★ 绑定下注按钮 → 调用 wcbet.js 的 placeBet
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
          alert('下注模块未加载，请刷新页面');
        }
      });
    });
  }

  function renderEventCard(event) {
    // 状态颜色和文本
    const statusConfig = {
      upcoming: { text: '即将开始', color: '#10b981' },   // 绿色
      live: { text: '进行中', color: '#ef4444' },         // 红色
      ended: { text: '已结束', color: '#6b7280' }         // 灰色
    };
    const statusInfo = statusConfig[event.status] || { text: event.status, color: '#6b7280' };

    const totalBet = (event.options || []).reduce((sum, opt) => sum + (opt.total_bet || 0), 0);
    const totalPool = (event.base_pool || 0) + totalBet;

    const formatTime = (t) => {
      if (!t) return '待定';
      return new Date(t).toLocaleString('zh-CN', { hour12: false });
    };

    // 截止时间文本
    const betEndStr = event.bet_end_time ? formatTime(event.bet_end_time) : '无限制';

    // 判断是否截止
    const isBetOver = event.bet_end_time ? new Date(event.bet_end_time).getTime() < Date.now() : false;
    const disableBet = event.status === 'ended' || isBetOver;

    let optionsHtml = '';
    if (event.options && event.options.length > 0) {
      event.options.forEach(opt => {
        optionsHtml += `
          <div class="hotbet-option">
            <span class="hotbet-option-name">${opt.name}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="hotbet-option-bet-btn"
                      data-event-id="${event.id}"
                      data-option-id="${opt.id}"
                      ${disableBet ? 'disabled' : ''}>${disableBet ? '已截止' : '下注'}</button>
            </div>
          </div>
        `;
      });
    } else {
      optionsHtml = '<p style="color:#999;">暂无选项</p>';
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
          ⏰ 比赛：${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}
          <br>⛔ 下注截止：${betEndStr}
          <br>🏆 基础奖池：<strong>${event.base_pool || 0} WOOD</strong> | 💰 总奖池：<strong>${totalPool} WOOD</strong>
        </div>
        <div class="hotbet-options">
          ${optionsHtml}
        </div>
      </div>
    `;
  }

  return { render };
})();
