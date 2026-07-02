// ==================== 热点预测主入口 ====================
window.YYCardHotBet = (() => {
  // 分类定义
  const categories = [
    { id: 'worldcup', name: '🏆 世界杯', module: 'worldcup' },
    { id: 'crypto',   name: '₿ 加密货币', module: 'crypto' },
    { id: 'politics', name: '🏛️ 政治', module: 'politics' },
    { id: 'sports',   name: '🏀 体育', module: 'sports' }
  ];

  let currentCategory = 'worldcup';
  let userPoints = 0;
  let currentUser = null;

  // 获取用户积分
  async function loadUserPoints() {
    try {
      const auth = window.YYCardAuth;
      if (auth?.currentUser) {
        currentUser = auth.currentUser;
        const { data } = await window.supabase
          .from('profiles')
          .select('points')
          .eq('id', currentUser.id)
          .single();
        userPoints = data?.points || 100;
      } else {
        userPoints = 100;
      }
    } catch (e) {
      userPoints = 100;
    }
    return userPoints;
  }

  // 获取当前用户积分（供子模块使用）
  function getPoints() { return userPoints; }
  function setPoints(p) { userPoints = p; }
  function getUser() { return currentUser; }

  // 渲染分类标签 + 调用子模块渲染内容
  async function render() {
    const container = document.getElementById('hotbet-area');
    if (!container) return;
    await loadUserPoints();

    // 积分栏
    const pointsBar = `
      <div class="hotbet-points-bar">
        <span class="label">🔥 我的积分</span>
        <span class="value">${userPoints} 积分</span>
      </div>
    `;

    // 分类按钮
    const categoryBar = `
      <div class="hotbet-categories">
        ${categories.map(cat => `
          <button class="hotbet-category ${cat.id === currentCategory ? 'active' : ''}"
                  data-category="${cat.id}">
            ${cat.name}
          </button>
        `).join('')}
      </div>
    `;

    container.innerHTML = pointsBar + categoryBar + '<div id="hotbet-content"></div>';

    // 绑定分类点击
    container.querySelectorAll('.hotbet-category').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentCategory = e.currentTarget.dataset.category;
        render(); // 重新渲染整个区域
      });
    });

    // 调用子模块渲染对应内容
    await renderCategoryContent(currentCategory);
  }

  // 根据分类调用不同子模块
  async function renderCategoryContent(category) {
    const contentDiv = document.getElementById('hotbet-content');
    if (!contentDiv) return;

    // 获取对应分类的模块配置
    const catConfig = categories.find(c => c.id === category);
    const moduleName = catConfig?.module;

    // 调用子模块（如 YYCardHotBetWorldcup）
    const subModule = window[`YYCardHotBet_${moduleName}`];
    if (subModule?.render) {
      await subModule.render(contentDiv, { getPoints, setPoints, getUser });
    } else {
      contentDiv.innerHTML = `<p style="text-align:center;color:#64748b;">该分类开发中...</p>`;
    }
  }

  // 初始化
  async function init() {
    await render();
  }

  // 外部刷新
  async function refresh() {
    await render();
  }

  return { init, refresh, getPoints, setPoints, getUser };
})();
