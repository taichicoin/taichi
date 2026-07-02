// ==================== 世界杯预测子模块（精简可靠版） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

  async function loadWorldcupEvents() {
    try {
      // 仅按分类查询，不进行状态过滤
      const { data: events, error } = await supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .order('start_time', { ascending: true });

      if (error) {
        console.error('查询事件失败:', error);
        return [];
      }

      if (!events || events.length === 0) return [];

      // 获取相关选项
      const eventIds = events.map(e => e.id);
      const { data: options } = await supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);

      // 获取投注统计
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

      // 组装数据
      return events.map(event => ({
        id: event.id,
        title: event.title,
        status: event.status,
        base_pool: event.base_pool || 0,
        start_time: event.start_time,
        end_time: event.end_time,
        options: (options || [])
          .filter(o => o.event_id === event.id)
          .map(opt => ({
            id: opt.id,
            name: opt.option_name,
            total_bet: optionBets[opt.id] || 0
          }))
      }));
    } catch (e) {
      console.error('加载事件异常:', e);
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

    // 绑定下注按钮
    containerDiv.querySelectorAll('.hotbet-option-bet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const eventId = e.currentTarget.dataset.eventId;
        const optionId = e.currentTarget.dataset.optionId;
        const event = events.find(ev => ev.id === eventId);
        const option = event?.options?.find(o => o.id == optionId);
        if (event && option) {
          alert(`下注功能开发中：${event.title} → ${option.name}`);
        }
      });
    });
  }

  function renderEventCard(event) {
    const statusText = {
      upcoming: '即将开始',
      live: '进行中',
      ended: '已结束'
    }[event.status] || event.status;

    const totalBet = (event.options || []).reduce((sum, opt) => sum + (opt.total_bet || 0), 0);
    const totalPool = (event.base_pool || 0) + totalBet;

    const formatTime = (t) => {
      if (!t) return '待定';
      return new Date(t).toLocaleString('zh-CN', { hour12: false });
    };

    let optionsHtml = '';
    (event.options || []).forEach(opt => {
      const percent = totalBet > 0 ? ((opt.total_bet / totalBet) * 100).toFixed(1) : 0;
      optionsHtml += `
        <div class="hotbet-option">
          <span class="hotbet-option-name">${opt.name}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:0.75rem;color:#64748b;">已投 ${opt.total_bet} (${percent}%)</span>
            <button class="hotbet-option-bet-btn"
                    data-event-id="${event.id}"
                    data-option-id="${opt.id}"
                    ${event.status === 'ended' ? 'disabled' : ''}>下注</button>
          </div>
        </div>
      `;
    });

    return `
      <div class="hotbet-event-card">
        <div class="hotbet-event-title">
          <span>${event.title}</span>
          <span class="hotbet-event-status ${event.status}">${statusText}</span>
        </div>
        <div style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
          ⏰ ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}
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
