// js/assetspage/coinlister/btc.js
(function() {
  if (!window.__YY_ASSETS__) window.__YY_ASSETS__ = [];

  window.__YY_ASSETS__.push({
    id: 'btc',
    name: 'BTC',
    icon: '/assets/logo/bitcoin.jpg',   // 用你给的图标

    // 目前先显示固定值 0，后续如果需要查询链上余额，可在此实现
    async fetchBalance() {
      return 0;
    }
  });
})();
