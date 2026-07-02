// ==================== 世界杯预测子模块 ====================
window.YYCardHotBet_worldcup = (() => {
  async function render(containerDiv, context) {
    const { getPoints, setPoints, getUser } = context;
    const userPoints = getPoints();
    const currentUser = getUser();

    // 从 Supabase 加载世界杯事件（此处用模拟数据演示）
    const events = await loadWorldcupEvents();

    containerDiv.innerHTML = `
      <div class="hotbet-events">
        ${events.length === 0 ? '<p style="text-align:center;color:#64748b;">暂无世界杯预测事件</p>' : ''}
        ${events.map(event => renderEventCard(event)).join('')}
      </div>
    `;

    // 绑定下注按钮
    containerDiv.querySelectorAll('.hotbet-option-bet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const eventId = e.currentTarget.dataset.eventId;
        const optionIndex = parseInt(e.currentTarget.dataset.optionIndex);
        const odds = parseFloat(e.currentTarget.dataset.odds);
        const event = events.find(ev => ev.id === eventId);
        if (event) openBetModal(event, optionIndex, odds, userPoints, currentUser, context);
      });
    });
  }

  // 模拟加载数据（实际应从 Supabase 查）
  async function loadWorldcupEvents() {
    // 示例：从 hotbet_events 表筛选 category='worldcup' 并 JOIN options
    return [
      {
        id: 'wc1',
        title: '巴西 vs 德国',
        status: 'upcoming',
        options: [
          { name: '巴西 胜', odds: 1.8 },
          { name: '平局', odds: 3.2 },
          { name: '德国 胜', odds: 2.5 }
        ]
      }
    ];
  }

  function renderEventCard(event) {
    const statusText = { upcoming: '即将开始', live: '进行中', ended: '已结束' }[event.status];
    return `
      <div class="hotbet-event-card">
        <div class="hotbet-event-title">
          <span>${event.title}</span>
          <span class="hotbet-event-status ${event.status}">${statusText}</span>
        </div>
        <div class="hotbet-options">
          ${event.options.map((opt, idx) => `
            <div class="hotbet-option">
              <span class="hotbet-option-name">${opt.name}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="hotbet-option-odds">${opt.odds}</span>
                <button class="hotbet-option-bet-btn"
                        data-event-id="${event.id}"
                        data-option-index="${idx}"
                        data-odds="${opt.odds}"
                        ${event.status === 'ended' ? 'disabled' : ''}>下注</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 下注模态框与逻辑（同之前，但使用 context 更新积分）
  function openBetModal(event, optionIndex, odds, userPoints, currentUser, context) {
    // ... 模态框渲染、校验、调用 placeBet ...
    // 下注成功后调用 context.setPoints(newPoints) 并重新渲染
  }

  return { render };
})();
