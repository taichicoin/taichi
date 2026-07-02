// ==================== 世界杯预测子模块（完整版） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

  // 加载世界杯事件、选项及投注统计
  async function loadWorldcupEvents() {
    try {
      // 只按 category 筛选，展示所有状态的事件
      const { data: events, error: evtErr } = await supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .order('start_time', { ascending: true });

      if (evtErr) {
        console.error('事件查询失败:', evtErr);
        return [];
      }
      if (!events || events.length === 0) return [];

      const eventIds = events.map(e => e.id);

      // 获取所有相关选项
      const { data: options, error: optErr } = await supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);

      if (optErr) {
        console.error('选项查询失败:', optErr);
        // 即使选项失败也返回事件，选项为空数组
        return events.map(e => ({
          id: e.id,
          title: e.title,
          status: e.status,
          base_pool: e.base_pool || 0,
          start_time: e.start_time,
          end_time: e.end_time,
          options: []
        }));
      }

      // 获取投注统计（按选项累计金额）
      const { data: betStats, error: betErr } = await supabase
        .from('hotbet_bets')
        .select('option_id, amount')
        .in('event_id', eventIds);

      if (betErr) console.error('投注统计失败:', betErr);

      const optionBets = {};
      if (betStats) {
        betStats.forEach(b => {
          optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
        });
      }

      // 组装最终数据
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
      console.error('loadWorldcupEvents 异常:', error);
      return [];
    }
  }

  // 渲染整个世界杯内容区域
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

    // 绑定下注按钮（目前占位，后续接入真实下注）
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

    // 总投注额
    const totalBet = event.options.reduce((sum, opt) => sum + opt.total_bet, 0);
    // 总奖池 = 基础奖池 + 总投注
    const totalPool = (event.base_pool || 0) + totalBet;

    // 时间格式化
    const formatTime = (t) => {
      if (!t) return '待定';
      return new Date(t).toLocaleString('zh-CN', { hour12: false });
    };

    return `
      <div class="hotbet-event-card">
        <div class="hotbet-event-title">
          <span>${event.title}</span>
          <span class="hotbet-event-status ${event.status}">${statusText}</span>
        </div>
        <div class="hotbet-event-meta" style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
          ⏰ 开始：${formatTime(event.start_time)} &nbsp;|&nbsp; 🏁 结束：${formatTime(event.end_time)}
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
