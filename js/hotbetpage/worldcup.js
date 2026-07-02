// ==================== 世界杯预测子模块（调试版） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

  // 加载世界杯事件（带详细日志）
  async function loadWorldcupEvents() {
    try {
      // 1. 先测试 Supabase 客户端是否存在
      if (!supabase) {
        console.error('❌ window.supabase 不存在！');
        return [];
      }
      console.log('✅ Supabase 客户端已就绪');

      // 2. 无过滤查询所有事件，测试基本连通性
      const { data: allEvents, error: allErr } = await supabase
        .from('hotbet_events')
        .select('*');

      console.log('📦 无过滤查询结果：', allEvents, allErr);

      if (allErr) {
        console.error('❌ 查询 hotbet_events 失败：', allErr);
        return [];
      }

      if (!allEvents || allEvents.length === 0) {
        console.warn('⚠️ hotbet_events 表为空，请检查数据库是否有数据');
        return [];
      }

      // 3. 加上分类过滤
      const { data: worldcupEvents, error: catErr } = await supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .order('start_time', { ascending: true });

      console.log('🏆 过滤后的世界杯事件：', worldcupEvents, catErr);

      if (catErr) {
        console.error('❌ 分类过滤失败：', catErr);
        // 降级：使用全部事件（让用户至少能看到东西）
        return allEvents.map(e => ({
          id: e.id,
          title: e.title,
          status: e.status,
          base_pool: e.base_pool || 0,
          start_time: e.start_time,
          end_time: e.end_time,
          options: []
        }));
      }

      if (!worldcupEvents || worldcupEvents.length === 0) {
        console.warn('⚠️ 没有 category=worldcup 的事件，请检查事件分类字段');
        // 同样降级显示全部事件
        return allEvents.map(e => ({
          id: e.id,
          title: e.title,
          status: e.status,
          base_pool: e.base_pool || 0,
          start_time: e.start_time,
          end_time: e.end_time,
          options: []
        }));
      }

      // 4. 加载选项和投注统计
      const eventIds = worldcupEvents.map(e => e.id);
      const { data: options, error: optErr } = await supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);

      if (optErr) console.error('❌ 选项查询失败：', optErr);

      const { data: betStats, error: betErr } = await supabase
        .from('hotbet_bets')
        .select('option_id, amount')
        .in('event_id', eventIds);

      if (betErr) console.error('❌ 投注统计失败：', betErr);

      const optionBets = {};
      if (betStats) {
        betStats.forEach(b => {
          optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
        });
      }

      const enrichedEvents = worldcupEvents.map(event => {
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

      console.log('✅ 最终渲染的事件数据：', enrichedEvents);
      return enrichedEvents;

    } catch (error) {
      console.error('❌ loadWorldcupEvents 异常：', error);
      return [];
    }
  }

  // 渲染整个世界杯内容区域
  async function render(containerDiv, context) {
    const { getBalance } = context;
    const userPoints = await getBalance();

    containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">加载中...</p>';

    const events = await loadWorldcupEvents();

    if (!events || events.length === 0) {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">暂无世界杯预测事件</p>';
      return;
    }

    containerDiv.innerHTML = `
      <div class="hotbet-events">
        ${events.map(event => renderEventCard(event)).join('')}
      </div>
    `;

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

  // 渲染单个事件卡片
  function renderEventCard(event) {
    const statusText = {
      upcoming: '即将开始',
      live: '进行中',
      ended: '已结束'
    }[event.status] || event.status;

    const totalBet = event.options.reduce((sum, opt) => sum + opt.total_bet, 0);
    const totalPool = (event.base_pool || 0) + totalBet;

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
