// ==================== 热点预测主入口（子导航栏固定在底部） ====================
window.YYCardHotBet = (() => {
  // 确保 _t 函数可用（如果未加载语言包则回退到直接显示 key）
  const _t = window._t || ((key) => key);

  const categories = [
    { id: 'worldcup', name: _t('cat_worldcup'), module: 'worldcup' },
    { id: 'crypto',   name: _t('cat_crypto'), module: 'crypto' },
    { id: 'esports', name: _t('cat_esports'), module: 'esports' },
    { id: 'sports',   name: _t('cat_sports'), module: 'sports' }
  ];

  let currentCategory = 'worldcup';
  let currentFilter = 'hot';
  let currentUser = null;

  let touchStartX = 0;
  let touchStartY = 0;

  function getUser() {
    if (!currentUser) currentUser = window.YYCardAuth?.currentUser || null;
    return currentUser;
  }

  function prevCategory() {
    const idx = categories.findIndex(c => c.id === currentCategory);
    if (idx > 0) { currentCategory = categories[idx - 1].id; render(); }
  }

  function nextCategory() {
    const idx = categories.findIndex(c => c.id === currentCategory);
    if (idx < categories.length - 1) { currentCategory = categories[idx + 1].id; render(); }
  }

  function bindSwipe(contentDiv) {
    if (!contentDiv) return;
    contentDiv.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    contentDiv.addEventListener('touchend', (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        deltaX > 0 ? prevCategory() : nextCategory();
      }
    }, { passive: true });
  }

  async function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;

    const chip = window.YYCardHotBetChip;
    const balance = chip ? await chip.getBalance() : 0;
    const pointsBar = chip 
      ? chip.render(balance) 
      : `<div class="hotbet-points-bar"><span class="label">${_t('hotbet_my_points')}</span><span class="value">${balance} WOOD</span></div>`;

    const categoryBar = `
      <div class="hotbet-categories" style="flex-shrink:0;">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}"
                  data-category="${cat.id}">${cat.name}</button>
        `).join('')}
      </div>
    `;

    const subNavHtml = renderSubNav();
    const scrollContent = '<div id="hotbet-content" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;"></div>';

    container.innerHTML = pointsBar + categoryBar + scrollContent + subNavHtml;

    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    container.querySelectorAll('.hotbet-subnav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newFilter = e.currentTarget.dataset.filter;
        if (newFilter === currentFilter) return;
        currentFilter = newFilter;
        renderCategoryContent(currentCategory);
      });
    });

    const contentDiv = document.getElementById('hotbet-content');
    bindSwipe(contentDiv);
    await renderCategoryContent(currentCategory);
  }

  function renderSubNav() {
    const filters = [
      { key: 'hot', label: _t('filter_hot') },
      { key: 'live', label: _t('filter_live') },
      { key: 'upcoming', label: _t('filter_upcoming') },
      { key: 'mybets', label: _t('filter_mybets') }
    ];
    return `
      <div class="hotbet-subnav" style="
        display:flex; gap:8px; padding:10px 16px;
        overflow-x:auto; white-space:nowrap;
        border-top:1px solid #e5e7eb;
        background:#fff;
        flex-shrink:0;
      ">
        ${filters.map(f => `
          <button class="hotbet-subnav-btn ${f.key === currentFilter ? 'active' : ''}"
                  data-filter="${f.key}"
                  style="padding:8px 16px; border-radius:20px; border:none;
                         background:${f.key === currentFilter ? '#3b82f6' : '#f1f5f9'};
                         color:${f.key === currentFilter ? 'white' : '#334155'};
                         font-size:0.9rem; font-weight:500; cursor:pointer; flex-shrink:0;">
            ${f.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  async function renderCategoryContent(category) {
    const contentDiv = document.getElementById('hotbet-content');
    if (!contentDiv) return;

    if (currentFilter === 'mybets') {
      const mybetsModule = window.YYCardHotBet_mybets;
      if (mybetsModule?.render) {
        await mybetsModule.render(contentDiv, {
          getUser,
          getBalance: () => window.YYCardHotBetChip?.getBalance() || 0
        });
      } else {
        contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">${_t('mybets_not_loaded')}</p>`;
      }
      return;
    }

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
      contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">${_t('category_not_available')}</p>`;
    }
  }

  async function init() { await render(); }
  async function refresh() { await render(); }

  return { init, refresh };
})();
