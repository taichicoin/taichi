// ==================== 世界杯预测子模块（终极诊断版） ====================
window.YYCardHotBet_worldcup = (() => {
  const supabase = window.supabase;

  async function render(containerDiv, context) {
    // 用于在页面上追加诊断信息
    function log(msg, color = '#333') {
      const p = document.createElement('p');
      p.style.color = color;
      p.style.margin = '4px 0';
      p.textContent = msg;
      containerDiv.appendChild(p);
    }

    containerDiv.innerHTML = '<p>🔍 开始诊断...</p>';

    // 1. 查询全表
    const { data: allEvents, error: allErr } = await supabase
      .from('hotbet_events')
      .select('*');

    if (allErr) {
      log('❌ 查询失败: ' + allErr.message, 'red');
      return;
    }
    log('✅ 全表查询成功，记录数: ' + (allEvents?.length || 0));

    if (!allEvents || allEvents.length === 0) {
      log('⚠️ 表中没有任何事件', 'orange');
      return;
    }

    // 显示所有分类
    const categories = [...new Set(allEvents.map(e => e.category))];
    log('🏷️ 数据库中的分类: ' + categories.join(', '));

    // 2. 手动过滤（trim 防止空格）
    const worldcupEvents = allEvents.filter(e => e.category && e.category.trim() === 'worldcup');
    log('🏆 过滤后世界杯事件数: ' + worldcupEvents.length, worldcupEvents.length > 0 ? 'green' : 'orange');

    if (worldcupEvents.length === 0) {
      log('❌ 没有分类为 worldcup 的事件，请检查数据库中 category 字段值是否完全等于 "worldcup"', 'red');
      // 显示一条事件作为示例
      if (allEvents.length > 0) {
        log('示例事件分类: ' + allEvents[0].category + ' (长度:' + allEvents[0].category.length + ')');
      }
      return;
    }

    // 3. 查询选项
    const eventIds = worldcupEvents.map(e => e.id);
    const { data: options, error: optErr } = await supabase
      .from('hotbet_options')
      .select('*')
      .in('event_id', eventIds);

    if (optErr) {
      log('⚠️ 选项查询失败: ' + optErr.message, 'orange');
    } else {
      log('✅ 选项查询成功，记录数: ' + (options?.length || 0));
    }

    // 4. 查询投注统计
    const { data: betStats, error: betErr } = await supabase
      .from('hotbet_bets')
      .select('option_id, amount')
      .in('event_id', eventIds);

    if (betErr) {
      log('⚠️ 投注统计失败: ' + betErr.message, 'orange');
    } else {
      log('✅ 投注统计成功');
    }

    // 计算每个选项的总投注
    const optionBets = {};
    if (betStats) {
      betStats.forEach(b => {
        optionBets[b.option_id] = (optionBets[b.option_id] || 0) + b.amount;
      });
    }

    // 组装事件数据
    const events = worldcupEvents.map(event => ({
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

    log('🎉 渲染事件数: ' + events.length, 'green');

    // 清除诊断内容，渲染正式卡片
    containerDiv.innerHTML = '<div class="hotbet-events"></div>';
    const eventsContainer = containerDiv.querySelector('.hotbet-events');
    events.forEach(event => {
      eventsContainer.innerHTML += renderEventCard(event);
    });

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
