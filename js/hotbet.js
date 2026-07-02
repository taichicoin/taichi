// ==================== 热点预测主模块 (hotbet.js) ====================
window.YYCardHotBet = (() => {
  // 分类定义
  const categories = [
    { id: 'worldcup', name: '🏆 世界杯', icon: '⚽' },
    { id: 'crypto', name: '₿ 加密货币', icon: '📈' },
    { id: 'politics', name: '🏛️ 政治', icon: '🗳️' },
    { id: 'sports', name: '🏀 体育', icon: '🏈' }
  ];

  // 模拟事件数据（实际应从 Supabase 加载）
  const mockEvents = {
    worldcup: [
      {
        id: 'wc1',
        title: '巴西 vs 德国',
        status: 'upcoming', // upcoming, live, ended
        startTime: '2026-07-10 20:00',
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
    ],
    crypto: [
      {
        id: 'btc1',
        title: 'BTC 本周能否突破 $70,000？',
        status: 'upcoming',
        options: [
          { name: '能', odds: 2.5 },
          { name: '不能', odds: 1.6 }
        ]
      }
    ],
    politics: [
      {
        id: 'pol1',
        title: '2026年美国中期选举结果',
        status: 'upcoming',
        options: [
          { name: '共和党胜', odds: 1.9 },
          { name: '民主党胜', odds: 2.0 }
        ]
      }
    ],
    sports: [
      {
        id: 'nba1',
        title: 'NBA总决赛 湖人 vs 凯尔特人',
        status: 'upcoming',
        options: [
          { name: '湖人 胜', odds: 2.3 },
          { name: '凯尔特人 胜', odds: 1.7 }
        ]
      }
    ]
  };

  let currentCategory = 'worldcup';
  let userPoints = 0;
  let currentUser = null;

  // 获取用户积分
  async function loadUserPoints() {
    try {
      const auth = window.YYCardAuth;
      if (auth && auth.currentUser) {
        currentUser = auth.currentUser;
        const { data, error } = await window.supabase
          .from('profiles')
          .select('points')
          .eq('id', currentUser.id)
          .single();
        if (!error && data) {
          userPoints = data.points || 0;
        } else {
          userPoints = 100; // 默认演示积分
        }
      } else {
        userPoints = 100;
      }
    } catch (e) {
      userPoints = 100;
    }
  }

  // 渲染整个区域
  function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;

    const events = mockEvents[currentCategory] || [];

    let html = `
      <div class="hotbet-points-bar">
        <span class="label">🔥 我的积分</span>
        <span class="value">${userPoints} 积分</span>
      </div>

      <div class="hotbet-categories">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}" 
                  data-category="${cat.id}">
            ${cat.icon} ${cat.name}
          </button>
        `).join('')}
      </div>

      <div class="hotbet-events">
        ${events.length === 0 ? '<p style="text-align:center; color:#64748b;">暂无预测事件</p>' : ''}
        ${events.map(event => {
          const statusText = event.status === 'upcoming' ? '即将开始' : 
                             event.status === 'live' ? '进行中' : '已结束';
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
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="hotbet-option-odds">${opt.odds}</span>
                      <button class="hotbet-option-bet-btn" 
                              data-event-id="${event.id}" 
                              data-option-index="${idx}"
                              data-odds="${opt.odds}"
                              ${event.status === 'ended' ? 'disabled' : ''}>
                        下注
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = html;

    // 绑定分类点击事件
    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    // 绑定下注按钮事件
    container.querySelectorAll('.hotbet-option-bet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const eventId = e.currentTarget.dataset.eventId;
        const optionIndex = parseInt(e.currentTarget.dataset.optionIndex);
        const odds = parseFloat(e.currentTarget.dataset.odds);
        openBetModal(eventId, optionIndex, odds);
      });
    });
  }

  // 打开下注模态框
  function openBetModal(eventId, optionIndex, odds) {
    // 查找事件和选项名称
    const events = mockEvents[currentCategory];
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const optionName = event.options[optionIndex].name;

    const modalHtml = `
      <div class="hotbet-modal" id="bet-modal">
        <div class="hotbet-modal-content">
          <h3>⚡ 确认下注</h3>
          <div class="detail"><strong>${event.title}</strong></div>
          <div class="detail">选择：${optionName} (赔率 ${odds})</div>
          <input type="number" id="bet-amount" placeholder="输入积分数量" min="1" max="${userPoints}" value="10">
          <div style="text-align:center; font-size:0.85rem; color:#64748b;">可能赢得：<span id="potential-win">${(10 * odds).toFixed(1)}</span> 积分</div>
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

    amountInput.addEventListener('input', () => {
      let val = parseInt(amountInput.value) || 0;
      if (val < 1) val = 1;
      if (val > userPoints) val = userPoints;
      amountInput.value = val;
      potentialWin.textContent = (val * odds).toFixed(1);
    });

    document.getElementById('cancel-bet').onclick = () => modal.remove();
    document.getElementById('confirm-bet').onclick = async () => {
      const amount = parseInt(amountInput.value);
      if (isNaN(amount) || amount <= 0 || amount > userPoints) {
        alert('请输入有效的积分数量');
        return;
      }
      await placeBet(eventId, optionIndex, amount, odds);
      modal.remove();
    };
  }

  // 提交下注到 Supabase
  async function placeBet(eventId, optionIndex, amount, odds) {
    if (!currentUser) {
      alert('请先登录');
      return;
    }
    try {
      // 1. 插入投注记录
      const { error } = await window.supabase.from('hotbet_bets').insert({
        user_id: currentUser.id,
        event_id: eventId,
        option_index: optionIndex,
        amount: amount,
        odds: odds,
        status: 'pending',
        created_at: new Date().toISOString()
      });
      if (error) throw error;

      // 2. 扣除积分（需保证原子性，这里简化处理）
      const newPoints = userPoints - amount;
      const { error: updateError } = await window.supabase
        .from('profiles')
        .update({ points: newPoints })
        .eq('id', currentUser.id);
      if (updateError) throw updateError;

      userPoints = newPoints;
      render();
      alert(`✅ 下注成功！扣除 ${amount} 积分`);
    } catch (e) {
      console.error('下注失败:', e);
      alert('下注失败，请重试');
    }
  }

  // 初始化
  async function init() {
    await loadUserPoints();
    render();
  }

  // 外部可调用的刷新方法
  function refresh() {
    loadUserPoints().then(() => render());
  }

  return { init, refresh };
})();
