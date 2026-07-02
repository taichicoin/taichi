// ==================== 热点预测主入口（含滑动切换分类 + 固定布局） ====================
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

  // 滑动相关
  let touchStartX = 0;
  let touchStartY = 0;

  function getUser() {
    if (!currentUser) {
      currentUser = window.YYCardAuth?.currentUser || null;
    }
    return currentUser;
  }

  // 切换到上一个分类
  function prevCategory() {
    const idx = categories.findIndex(c => c.id === currentCategory);
    if (idx > 0) {
      currentCategory = categories[idx - 1].id;
      render();
    }
  }

  // 切换到下一个分类
  function nextCategory() {
    const idx = categories.findIndex(c => c.id === currentCategory);
    if (idx < categories.length - 1) {
      currentCategory = categories[idx + 1].id;
      render();
    }
  }

  // 绑定滑动手势
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
        if (deltaX > 0) {
          prevCategory(); // 右滑，上一个分类
        } else {
          nextCategory(); // 左滑，下一个分类
        }
      }
    }, { passive: true });
  }

  // 渲染整个区域（采用 flex 布局，固定顶部 + 可滚动内容）
  async function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;

    // 设置容器为 flex 列，使内容可滚动
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.overflow = 'hidden'; // 防止整体滚动

    const chip = window.YYCardHotBetChip;
    const balance = chip ? await chip.getBalance() : 0;
    const pointsBar = chip 
      ? chip.render(balance) 
      : `<div class="hotbet-points-bar"><span class="label">🔥 我的积分</span><span class="value">${balance} 积分</span></div>`;

    // 分类标签栏
    const categoryBar = `
      <div class="hotbet-categories" style="flex-shrink: 0;">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}"
                  data-category="${cat.id}">${cat.name}</button>
        `).join('')}
      </div>
    `;

    // 子导航栏（固定）
    const subNavHtml = renderSubNav();

    // 可滚动内容区域
    const scrollContent = `<div id="hotbet-content" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling: touch;"></div>`;

    container.innerHTML = pointsBar + categoryBar + subNavHtml + scrollContent;

    // 绑定分类点击
    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    // 绑定子导航栏点击
    container.querySelectorAll('.hotbet-subnav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newFilter = e.currentTarget.dataset.filter;
        if (newFilter === currentFilter) return;
        currentFilter = newFilter;
        renderCategoryContent(currentCategory);
      });
    });

    // 绑定滑动手势到内容区
    const contentDiv = document.getElementById('hotbet-content');
    bindSwipe(contentDiv);

    await renderCategoryContent(currentCategory);
  }

  // 渲染子导航栏（热门/进行中/即将到来/我的押注）
  function renderSubNav() {
    const filters = [
      { key: 'hot', label: '🔥 热门' },
      { key: 'live', label: '🟢 进行中' },
      { key: 'upcoming', label: '⏳ 即将到来' },
      { key: 'mybets', label: '📋 我的押注' }
    ];
    return `
      <div class="hotbet-subnav" style="display:flex; gap:8px; padding:12px 0; overflow-x:auto; white-space:nowrap; border-bottom:1px solid #e5e7eb; margin-bottom:12px; flex-shrink:0;">
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

  // 调用子模块渲染事件列表
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
