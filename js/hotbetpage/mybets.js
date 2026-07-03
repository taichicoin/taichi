// ==================== 我的预测子模块 (mybets.js) ====================
window.YYCardHotBet_mybets = (() => {
  const supabase = window.supabase;

  async function loadMyBets(user, filterStatus) {
    let query = supabase
      .from('hotbet_bets')
      .select(`
        id,
        amount,
        status,
        win_amount,
        created_at,
        event_id,
        option_id,
        hotbet_events!inner ( title, status ),
        hotbet_options!inner ( option_name )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data, error } = await query;
    if (error) {
      console.error('查询下注记录失败:', error);
      return [];
    }
    return data;
  }

  async function render(containerDiv, context) {
    const { getUser } = context;
    const user = getUser();
    if (!user) {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">请先登录</p>';
      return;
    }

    let currentFilter = 'all';

    const renderList = async () => {
      containerDiv.innerHTML = '<p style="text-align:center;color:#64748b;">加载中...</p>';
      const bets = await loadMyBets(user, currentFilter);

      let html = `
        <div style="display:flex; gap:8px; margin-bottom:16px; overflow-x:auto;">
          <button class="mybet-filter-btn" data-filter="all" style="padding:6px 14px; border-radius:20px; border:none; background:${currentFilter === 'all' ? '#3b82f6' : '#f1f5f9'}; color:${currentFilter === 'all' ? 'white' : '#334155'}; font-size:0.85rem; cursor:pointer;">全部</button>
          <button class="mybet-filter-btn" data-filter="pending" style="padding:6px 14px; border-radius:20px; border:none; background:${currentFilter === 'pending' ? '#3b82f6' : '#f1f5f9'}; color:${currentFilter === 'pending' ? 'white' : '#334155'}; font-size:0.85rem; cursor:pointer;">待开奖</button>
          <button class="mybet-filter-btn" data-filter="won" style="padding:6px 14px; border-radius:20px; border:none; background:${currentFilter === 'won' ? '#3b82f6' : '#f1f5f9'}; color:${currentFilter === 'won' ? 'white' : '#334155'}; font-size:0.85rem; cursor:pointer;">中奖</button>
          <button class="mybet-filter-btn" data-filter="lost" style="padding:6px 14px; border-radius:20px; border:none; background:${currentFilter === 'lost' ? '#3b82f6' : '#f1f5f9'}; color:${currentFilter === 'lost' ? 'white' : '#334155'}; font-size:0.85rem; cursor:pointer;">未中奖</button>
        </div>
        <div class="mybets-list">
      `;

      if (bets.length === 0) {
        html += '<p style="text-align:center;color:#64748b;">暂无下注记录</p>';
      } else {
        bets.forEach(bet => {
          const eventTitle = bet.hotbet_events?.title || '未知事件';
          const optionName = bet.hotbet_options?.option_name || '未知选项';
          const amount = bet.amount;
          const winAmount = bet.win_amount || 0;
          const profit = bet.status === 'won' ? winAmount - amount : (bet.status === 'pending' ? '--' : -amount);
          
          let statusText = '';
          let statusColor = '#64748b';
          if (bet.status === 'pending') { statusText = '未开奖'; statusColor = '#f59e0b'; }
          else if (bet.status === 'won') { statusText = '中奖'; statusColor = '#10b981'; }
          else if (bet.status === 'lost') { statusText = '未中奖'; statusColor = '#ef4444'; }

          let profitColor = '#64748b';
          if (profit !== '--') profitColor = profit > 0 ? '#10b981' : (profit < 0 ? '#ef4444' : '#64748b');

          html += `
            <div style="background:#f8fafc; border-radius:12px; padding:12px; margin-bottom:8px;">
              <div style="font-weight:600; display:flex; justify-content:space-between;">
                <span>${eventTitle}</span>
                <span style="font-size:0.8rem; color:${statusColor};">${statusText}</span>
              </div>
              <div style="font-size:0.85rem; color:#64748b; margin:4px 0;">
                选择：${optionName}
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.9rem;">
                <div>下注金额<br><strong>${amount} WOOD</strong></div>
                <div>收益<br><strong style="color:${profitColor}">${profit === '--' ? '--' : profit + ' WOOD'}</strong></div>
              </div>
            </div>
          `;
        });
      }

      html += '</div>';
      containerDiv.innerHTML = html;

      // 绑定筛选按钮
      containerDiv.querySelectorAll('.mybet-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const newFilter = e.currentTarget.dataset.filter;
          if (newFilter === currentFilter) return;
          currentFilter = newFilter;
          renderList();
        });
      });
    };

    await renderList();
  }

  return { render };
})();
