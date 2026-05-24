// ==================== YY Card Service Worker ====================
// 适配：游戏入口 /ycardy.html，登录页 /ycardy/signup，资源都在根目录

const CACHE_NAME = 'yycard-v1';
const urlsToCache = [
  '/ycardy.html',
  '/css/lobby.css',
  '/css/battle.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/combat.js',
  '/js/shop.js',
  '/js/refresh.js',
  '/js/buffs.js',
  '/js/sounds.js',
  '/js/merge.js',
  '/js/auth.js',
  '/js/profile-ui.js',
  '/js/matchmaking.js',
  '/js/battle.js',
  '/js/consumable.js',
  '/js/cardin.js',
  '/js/reconnect.js',
  '/assets/default-avatar.png',
  '/manifest.json',
  '/sw.js'
];

// 需要绕开缓存、始终网络优先的路径（防止 OAuth 回调被缓存导致失败）
const noCachePaths = [
  '/ycardy/signup',           // 登录页面
  '/auth/v1/authorize',       // Supabase OAuth 授权
  '/auth/v1/callback',        // OAuth 回调
  '/token'                    // token 交换
];

// 安装阶段
self.addEventListener('install', event => {
  console.log('[SW] 安装中');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    }).catch(err => console.error('[SW] 缓存失败', err))
  );
  self.skipWaiting();
});

// 请求拦截
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // 如果是需要网络优先的路径，直接走网络，不进入缓存逻辑
  if (noCachePaths.some(path => url.includes(path))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // 其他请求：缓存优先，网络回退
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(err => {
        console.warn('[SW] 网络请求失败', url, err);
        return new Response('网络连接失败，请检查网络后重试', { status: 503 });
      });
    })
  );
});

// 激活阶段
self.addEventListener('activate', event => {
  console.log('[SW] 激活中');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('[SW] 激活完成');
      return self.clients.claim();
    })
  );
});
