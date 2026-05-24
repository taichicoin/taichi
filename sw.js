const CACHE_NAME = 'yycard-v1';
const urlsToCache = [
  '/ycardy/',
  '/ycardy/index.html',
  '/ycardy/css/lobby.css',
  '/ycardy/css/battle.css',
  '/ycardy/js/config.js',
  '/ycardy/js/utils.js',
  '/ycardy/js/combat.js',
  '/ycardy/js/shop.js',
  '/ycardy/js/refresh.js',
  '/ycardy/js/buffs.js',
  '/ycardy/js/sounds.js',
  '/ycardy/js/merge.js',
  '/ycardy/js/auth.js',
  '/ycardy/js/profile-ui.js',
  '/ycardy/js/matchmaking.js',
  '/ycardy/js/battle.js',
  '/ycardy/js/consumable.js',
  '/ycardy/js/cardin.js',
  '/ycardy/js/reconnect.js',
  '/assets/default-avatar.png',
  // 可以继续添加图标等资源
];

// 安装时缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// 拦截请求：优先从缓存读取，失败则网络请求并缓存新资源
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    })
  );
});

// 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});
