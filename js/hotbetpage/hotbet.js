// ==================== 热点预测主入口 ====================
window.YYCardHotBet = (() => {
  const categories = [
    { id: 'worldcup', name: '🏆 世界杯', module: 'worldcup' },
    { id: 'crypto',   name: '₿ 加密货币', module: 'crypto' },
    { id: 'politics', name: '🏛️ 政治', module: 'politics' },
    { id: 'sports',   name: '🏀 体育', module: 'sports' }
  ];

  let currentCategory = 'worldcup';
  let currentUser = null;

  // 获取当前用户
  function getUser() {
    if (!currentUser) {
      currentUser = window.YYCardAuth?.currentUser || null;
    }
    return currentUser;
  }

  // ★ 渲染整个区域（使用 chiprender.js 获取 WOOD 余额）
  async function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;

    const chip = window.YYCardHotBetChip;
    const balance = chip ? await chip.getBalance() : 0;
    const pointsBar = chip 
      ? chip.render(balance) 
      : `<div class="hotbet-points-bar"><span class="label">🔥 我的积分</span><span class="value">${balance} 积分</span></div>`;

    const categoryBar = `
      <div class="hotbet-categories">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}"
                  data-category="${cat.id}">${cat.name}</button>
        `).join('')}
      </div>
    `;

    container.innerHTML = pointsBar + categoryBar + '<div id="hotbet-content"></div>';

    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    await renderCategoryContent(currentCategory);
  }

  // 调用子模块
  async function renderCategoryContent(category) {
    const contentDiv = document.getElementById('hotbet-content');
    if (!contentDiv) return;
    const catConfig = categories.find(c => c.id === category);
    const moduleName = catConfig?.module;
    const subModule = window[`YYCardHotBet_${moduleName}`];
    if (subModule?.render) {
      // 传递 chip 方法供子模块使用（以后下注时会用到）
      await subModule.render(contentDiv, {
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
