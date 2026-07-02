// ==================== 世界杯预测子模块（手机诊断版） ====================
window.YYCardHotBet_worldcup = (() => {

  // 加载世界杯事件（带页面内诊断输出）
  async function loadWorldcupEvents() {
    // 1. 检查 Supabase 客户端
    if (!window.supabase) {
      return { error: '❌ window.supabase 未初始化，请检查 config.js 是否加载' };
    }

    try {
      // 2. 无过滤查询，测试连通性
      const { data: allEvents, error: allErr } = await window.supabase
        .from('hotbet_events')
        .select('*');

      if (allErr) {
        return { error: `❌ 查询失败: ${allErr.message || JSON.stringify(allErr)}` };
      }

      if (!allEvents || allEvents.length === 0) {
        return { error: '⚠️ 数据库 hotbet_events 表中没有任何数据，请先插入事件' };
      }

      // 3. 按分类过滤
      const { data: worldcupEvents, error: catErr } = await window.supabase
        .from('hotbet_events')
        .select('*')
        .eq('category', 'worldcup')
        .order('start_time', { ascending: true });

      if (catErr) {
        return { error: `❌ 分类过滤失败: ${catErr.message || JSON.stringify(catErr)}` };
      }

      if (!worldcupEvents || worldcupEvents.length === 0) {
        // 显示所有分类名称帮助定位
        const categories = [...new Set(allEvents.map(e => e.category))];
        return {
          error: `⚠️ 没有 category='worldcup' 的事件，当前数据库中的分类有: ${categories.join(', ')}。请检查事件分类值是否完全匹配（大小写、空格）`
        };
      }

      // 4. 加载选项和投注统计
      const eventIds = worldcupEvents.map(e => e.id);
      const { data: options } = await window.supabase
        .from('hotbet_options')
        .select('*')
        .in('event_id', eventIds);
      const { data: betStats } = await window.supabase
        .from('hotbet_bets')
        .select('option_id, amount')
        .in('event_id', eventIds);

      const optionBets = {};
      if (betStats) {
        betStats.forEach(b => {
          optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
        });
      }

      return worldcupEvents.map(event => {
        const eventOptions = (options || []).filter(o => o.event_id === event.id);
        return {
          id: event.id,
          title: event.title,
          status: event.status,
          base_pool: event.base_pool || 0,
          start_time: event.start_time,
          end_time: event.end_time,
          options: eventOptions.map(opt => ({
            id: opt.id,
            name: opt.option_name,
            total_bet: optionBets[opt.id] || 0
          }))
        };
      });

    } catch (error) {
      return { error: `❌ 异常: ${error.message || JSON.stringify(error)}` };
    }
  }

  // 渲染世界���内容
  async function render(containerDiv, context) {
    containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">⏳ 正在从数据库加载事件...</p>';

    const result = await loadWorldcupEvents();

    // 诊断：如果返回的是错误对象，显示错误
    if (result && result.error) {
      containerDiv.innerHTML = `
        <div style="padding:20px;color:#b91c1c;background:#fee2e2;border-radius:12px;word-break:break-word;">
          ${result.error}
        </div>
      `;
      return;
    }

    const events = result;
    if (!events || events.length === 0) {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">暂无世界杯预测事件</p>';
      return;
    }

    containerDiv.innerHTML = `
      <div class="hotbet-events">
        ${events.map(event => renderEventCard(event)).join('')}
      </div>
    `;

    // 绑定下注按钮（占位）
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
        <div style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
          ⏰ ${formatTime(event.start_time)} ~ ${formatTime(event.end_time)}
          <br>🏆 基础奖池：<strong>${event.base_pool || 0} WOOD</strong> | 💰 总奖池：<strong>${totalPool} WOOD</strong>
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
