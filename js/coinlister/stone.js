// js/coinlister/stone.js
(function() {
  if (!window.__YY_ASSETS__) window.__YY_ASSETS__ = [];

  window.__YY_ASSETS__.push({
    id: 'stone',
    name: 'STONE',
    icon: '/assets/logo/stone.png',
    price: null,               // 暂无价格

    async fetchBalance() {
      return 0;                // 始终为 0
    }

    // 可选自定义渲染（默认用统一模板即可）
  });
})();
