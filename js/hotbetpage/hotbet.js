// ==================== 热点预测主入口（含子导航栏） ====================
window.YYCardHotBet = (() => {
  const categories = [
    { id: 'worldcup', name: '🏆 世界杯', module: 'worldcup' },
    { id: 'crypto',   name: '₿ 加密货币', module: 'crypto' },
    { id: 'politics', name: '🏛️ 政治', module: 'politics' },
    { id: 'sports',   name: '🏀 体育', module: 'sports' }
  ];

  let currentCategory = 'worldcup';
  let currentFilter = 'hot';   // 'hot' | 'live' | 'upcoming' | 'mybets'
  let currentUser = null;

  function getUser() {
    if (!currentUser) {
      currentUser = window.YYCardAuth?.currentUser || null;
    }
    return currentUser;
  }

  // 渲染整个区域
  async function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;

    const chip = window.YYCardHotBetChip;
    const balance = chip ? await chip.getBalance() : 0;
    const pointsBar = chip 
      ? chip.render(balance) 
      : `<div class="hotbet-points-bar"><span class="label">🔥 我的积分</span><span class="value">${balance} 积分</span></div>`;

    // 分类按钮
    const categoryBar = `
      <div class="hotbet-categories">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}"
                  data-category="${cat.id}">${cat.name}</button>
        `).join('')}
      </div>
    `;

    // 子导航栏（筛选：热门/进行中/即将到来/我的押注）
    const subNavHtml = renderSubNav();

    container.innerHTML = pointsBar + categoryBar + subNavHtml + '<div id="hotbet-content"></div>';

    // 绑定分类点击
    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render(); // 重新渲染整个区域（保留筛选条件）
      });
    });

    // 绑定子导航栏点击
    container.querySelectorAll('.hotbet-subnav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newFilter = e.currentTarget.dataset.filter;
        if (newFilter === currentFilter) return;
        currentFilter = newFilter;
        // 只刷新事件列表，不重建整个区域
        renderCategoryContent(currentCategory);
      });
    });

    await renderCategoryContent(currentCategory);
  }

  // 渲染子导航栏
  function renderSubNav() {
    const filters = [
      { key: 'hot', label: '🔥 热门' },
      { key: 'live', label: '🟢 进行中' },
      { key: 'upcoming', label: '⏳ 即将到来' },
      { key: 'mybets', label: '📋 我的押注' }
    ];
    return `
      <div class="hotbet-subnav" style="display:flex; gap:8px; padding:12px 0; overflow-x:auto; white-space:nowrap; border-bottom:1px solid #e5e7eb; margin-bottom:12px;">
        ${filters.map(f => `
          <button class="hotbet-subnav-btn ${f.key === currentFilter ? 'active' : ''}"
                  data-filter="${f.key}"
                  style="padding:8px 16px; border-radius:20px; border:none; background:${f.key === currentFilter ? '#3b82f6' : '#f1f5f9'}; color:${f.key === currentFilter ? 'white' : '#334155'}; font-size:0.9rem; font-weight:500; cursor:pointer; flex-shrink:0;">
            ${f.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // 调用子模块渲染对应内容
  async function renderCategoryContent(category) {
    const contentDiv = document.getElementById('hotbet-content');
    if (!contentDiv) return;

    const catConfig = categories.find(c => c.id === category);
    const moduleName = catConfig?.module;
    const subModule = window[`YYCardHotBet_${moduleName}`];
    if (subModule?.render) {
      await subModule.render(contentDiv, {
        filter: currentFilter,
        getBalance: () => window.YYCardHotBetChip?.getBalance() || 0,
        deduct: (amount) => window.YYCardHotBetChip?.deduct(amount),
        getUser
      });
    } else {
      contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">该分类开发中...</p>`;
    }
  }

  async function init() { await render(); }
  async function refresh() { await render(); }

  return { init, refresh };
})();
