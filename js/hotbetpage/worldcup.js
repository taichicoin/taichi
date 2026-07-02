// ==================== 世界杯预测子模块 ====================
window.YYCardHotBet_worldcup = (() => {
  // 从 Supabase 加载世界杯事件（示例，可替换为真实查询）
  async function loadWorldcupEvents() {
    // 实际应查询 hotbet_events 表中 category='worldcup' 且 JOIN options
    return [
      {
        id: 'wc1',
        title: '巴西 vs 德国',
        status: 'upcoming',   // upcoming / live / ended
        options: [
          { name: '巴西 胜', odds: 1.8 },
          { name: '平局', odds: 3.2 },
          { name: '德国 胜', odds: 2.5 }
        ]
      },
      {
        id: 'wc2',
        title: '阿根廷 vs 法国',
        status: 'live',
        options: [
          { name: '阿根廷 胜', odds: 2.1 },
          { name: '法国 胜', odds: 1.9 }
        ]
      }
    ];
  }

  function renderEventCard(event) {
    const statusText = {
      upcoming: '即将开始',
      live: '进行中',
      ended: '已结束'
    }[event.status] || event.status;

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

  // 打开下注模态框
  function openBetModal(event, optionIndex, odds, context) {
    const { getBalance, deduct, getUser } = context;
    const optionName = event.options[optionIndex].name;

    // 先获取当前余额，用于模态框显示
    getBalance().then(balance => {
      const modalHtml = `
        <div class="hotbet-modal" id="bet-modal">
          <div class="hotbet-modal-content">
            <h3>⚡ 确认下注</h3>
            <div class="detail"><strong>${event.title}</strong></div>
            <div class="detail">选择：${optionName} (赔率 ${odds})</div>
            <input type="number" id="bet-amount" placeholder="输入WOOD数量" min="1" max="${balance}" value="10">
            <div style="text-align:center; font-size:0.85rem; color:#64748b;">
              可能赢得：<span id="potential-win">${(10 * odds).toFixed(1)}</span> WOOD
            </div>
            <div class="modal-actions">
              <button class="btn-cancel" id="cancel-bet">取消</button>
              <button class="btn-confirm" id="confirm-bet">确认下注</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = document.getElementById('bet-modal');
      const amountInput = document.getElementById('bet-amount');
      const potentialWin = document.getElementById('potential-win');

      // 实时更新可能赢得
      amountInput.addEventListener('input', () => {
        let val = parseInt(amountInput.value) || 0;
        if (val < 1) val = 1;
        if (val > balance) val = balance;
        amountInput.value = val;
        potentialWin.textContent = (val * odds).toFixed(1);
      });

      // 取消
      document.getElementById('cancel-bet').onclick = () => modal.remove();

      // 确认下注
      document.getElementById('confirm-bet').onclick = async () => {
        const amount = parseInt(amountInput.value);
        if (isNaN(amount) || amount <= 0 || amount > balance) {
          alert('请输入有效的WOOD数量');
          return;
        }

        const user = getUser();
        if (!user) {
          alert('请先登录');
          modal.remove();
          return;
        }

        // 1. 扣除积分（调用筹码模块）
        const newBalance = await deduct(amount);
        if (newBalance === null) {
          alert('WOOD不足或扣除失败，下注取消');
          return;
        }

        // 2. 插入投注记录到 Supabase
        try {
          const { error } = await window.supabase.from('hotbet_bets').insert({
            user_id: user.id,
            event_id: event.id,
            option_index: optionIndex,
            amount: amount,
            odds: odds,
            status: 'pending',
            created_at: new Date().toISOString()
          });
          if (error) throw error;

          modal.remove();
          // 刷新整个预测页面（积分栏会更新）
          window.YYCardHotBet.refresh();
          alert(`✅ 下注成功！扣除 ${amount} WOOD`);
        } catch (e) {
          console.error('下注记录写入失败:', e);
          // 扣款已执行，但记录失败，这里可考虑回滚积分（生产环境需事务处理）
          alert('下注记录保存失败，但积分已扣除，请联系客服');
          modal.remove();
        }
      };
    });
  }

  // 主渲染函数（供主入口调用）
  async function render(containerDiv, context) {
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
        if (event) openBetModal(event, optionIndex, odds, context);
      });
    });
  }

  return { render };
})();
