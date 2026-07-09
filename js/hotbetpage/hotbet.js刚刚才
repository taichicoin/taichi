// ==================== 热点预测主入口（支持动态多语言） ====================
window.YYCardHotBet = (() => {
  // 定义分类基本信息（name 留空，在 render 时动态翻译）
  const categoryDefs = [
    { id: 'worldcup', key: 'cat_worldcup', module: 'worldcup' },
    { id: 'crypto',   key: 'cat_crypto',   module: 'crypto' },
    { id: 'esports',  key: 'cat_esports',  module: 'esports' },
    { id: 'sports',   key: 'cat_sports',   module: 'sports' }
  ];

  let currentCategory = 'worldcup';
  let currentFilter = 'hot';
  let currentUser = null;

  let touchStartX = 0;
  let touchStartY = 0;

  // 翻译辅助函数（确保始终可用）
  const t = (key) => (window._t || ((k) => k))(key);

  function getUser() {
    if (!currentUser) currentUser = window.YYCardAuth?.currentUser || null;
    return currentUser;
  }

  function prevCategory() {
    const idx = categoryDefs.findIndex(c => c.id === currentCategory);
    if (idx > 0) { currentCategory = categoryDefs[idx - 1].id; render(); }
  }

  function nextCategory() {
    const idx = categoryDefs.findIndex(c => c.id === currentCategory);
    if (idx < categoryDefs.length - 1) { currentCategory = categoryDefs[idx + 1].id; render(); }
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
      : `<div class="hotbet-points-bar"><span class="label">${t('hotbet_my_points')}</span><span class="value">${balance} WOOD</span></div>`;

    // 动态构建分类标签（每次 render 时重新翻译）
    const categories = categoryDefs.map(cat => ({
      id: cat.id,
      name: t(cat.key),
      module: cat.module
    }));

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

    // 语言切换按钮
    const currentLang = window.YYCardHotBetLang?.getLang?.() || 'zh';
    const langBtnHtml = `
      <button id="lang-toggle-btn" style="
        position: absolute;
        bottom: 12vh;
        right: 2vw;
        z-index: 20;
        background: rgba(59, 130, 246, 0.15);
        border: 1px solid rgba(59, 130, 246, 0.25);
        color: #3b82f6;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 12px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        transition: background 0.2s;
      ">${currentLang === 'zh' ? 'EN' : '中'}</button>
    `;

    container.innerHTML = pointsBar + categoryBar + langBtnHtml + scrollContent + subNavHtml;

    // 绑定语言切换按钮
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const next = currentLang === 'zh' ? 'en' : 'zh';
        window.YYCardHotBetLang?.setLang?.(next);
      });
    }

    // 分类按钮事件（使用动态构建的 categories）
    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    // 子导航按钮事件
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
      { key: 'hot', label: t('filter_hot') },
      { key: 'live', label: t('filter_live') },
      { key: 'upcoming', label: t('filter_upcoming') },
      { key: 'mybets', label: t('filter_mybets') }
    ];
    return `
      <div class="hotbet-subnav" style="
        display:flex; gap:8px; padding:10px 16px;
        overflow-x:auto; white-space:nowrap;
        border-top:1px solid #e5e7eb;
        background:#fff;
        flex-shrink:0;
        position: relative;
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
        contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">${t('mybets_not_loaded')}</p>`;
      }
      return;
    }

    const catConfig = categoryDefs.find(c => c.id === category);
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
      contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">${t('category_not_available')}</p>`;
    }
  }

  async function init() { await render(); }
  async function refresh() { await render(); }

  return { init, refresh };
})();
