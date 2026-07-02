// ==================== 世界杯预测子模块（真实数据） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

  // 从 Supabase 加载世界杯事件及其选项、投注统计
  async function loadWorldcupEvents() {
    try {
      // 1. 获取所有未结束的世界杯事件
      const { data: events, error: evtErr } = await supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .neq('status', 'ended')
        .order('start_time', { ascending: true });

      if (evtErr) throw evtErr;
      if (!events || events.length === 0) return [];

      // 2. 获取所有相关选项
      const eventIds = events.map(e => e.id);
      const { data: options, error: optErr } = await supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);

      if (optErr) throw optErr;

      // 3. 获取每个选项的总投注额（按 option_id 分组求和）
      const { data: betStats, error: betErr } = await supabase
        .from('hotbet_bets')
        .select('option_id, amount')
        .in('event_id', eventIds);

      if (betErr) throw betErr;

      // 计算每个选项的 total_bet
      const optionBets = {};
      if (betStats) {
        betStats.forEach(b => {
          optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
        });
      }

      // 组装数据
      return events.map(event => {
        const eventOptions = (options || []).filter(o => o.event_id === event.id);
        const enrichedOptions = eventOptions.map(opt => ({
          id: opt.id,
          name: opt.option_name,
          total_bet: optionBets[opt.id] || 0
        }));

        return {
          id: event.id,
          title: event.title,
          status: event.status,
          base_pool: event.base_pool || 0,
          start_time: event.start_time,
          end_time: event.end_time,
          options: enrichedOptions
        };
      });
    } catch (error) {
      console.error('加载世界杯事件失败:', error);
      return [];
    }
  }

  // 渲染整个世界杯区域
  async function render(containerDiv, context) {
    const { getBalance } = context;
    const userPoints = await getBalance();

    containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">加载中...</p>';

    const events = await loadWorldcupEvents();

    if (events.length === 0) {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">暂无世界杯预测事件</p>';
      return;
    }

    containerDiv.innerHTML = `
      <div class="hotbet-events">
        ${events.map(event => renderEventCard(event)).join('')}
      </div>
    `;

    // 绑定下注按钮（目前仍为占位提示，后续实现真实下注）
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

  // 渲染单个事件卡片
  function renderEventCard(event) {
    const statusText = {
      upcoming: '即将开始',
      live: '进行中',
      ended: '已结束'
    }[event.status] || event.status;

    // 计算总奖池 = 所有选项总投注 + 基础奖池
    const totalBet = event.options.reduce((sum, opt) => sum + opt.total_bet, 0);
    const totalPool = totalBet + (event.base_pool || 0);

    // 格式化时间
    const startDate = event.start_time ? new Date(event.start_time).toLocaleString('zh-CN', { hour12: false }) : '待定';
    const endDate = event.end_time ? new Date(event.end_time).toLocaleString('zh-CN', { hour12: false }) : '待定';

    return `
      <div class="hotbet-event-card">
        <div class="hotbet-event-title">
          <span>${event.title}</span>
          <span class="hotbet-event-status ${event.status}">${statusText}</span>
        </div>
        <div class="hotbet-event-meta" style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
          ⏰ 开始：${startDate} &nbsp;|&nbsp; 🏁 结束：${endDate}
          <br>🏆 基础奖池：<strong>${event.base_pool || 0} WOOD</strong> &nbsp;|&nbsp; 📊 总投注：<strong>${totalBet} WOOD</strong>
          <br>💰 总奖池：<strong style="color:#f59e0b;">${totalPool} WOOD</strong>
        </div>
        <div class="hotbet-options">
          ${event.options.map(opt => {
            const percent = totalBet > 0 ? ((opt.total_bet / totalBet) * 100).toFixed(1) : 0;
            return `
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
          }).join('')}
        </div>
      </div>
    `;
  }

  return { render };
})();
