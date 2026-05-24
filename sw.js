// ==================== 完整版 Service Worker ====================
// 适用于 YY Card 游戏，入口文件为 ycardy.html，所有资源位于根目录

const CACHE_NAME = 'yycard-v1';
const urlsToCache = [
  '/',                           // 根路径（可选，会返回 index.html 官网，但不影响游戏）
  '/ycardy.html',                // 游戏主入口
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
  // 如果还有其他静态资源（如字体、音效等），可以继续添加
];

// 安装阶段：缓存所有核心资源
self.addEventListener('install', event => {
  console.log('[SW] 安装中，缓存资源列表', urlsToCache);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    }).catch(err => {
      console.error('[SW] 缓存失败', err);
    })
  );
  self.skipWaiting(); // 立即激活新的 Service Worker
});

// 请求拦截：优先从缓存读取，缓存没有则从网络请求并缓存新资源
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // 命中缓存则直接返回
      if (response) {
        return response;
      }
      // 否则发起网络请求
      return fetch(event.request).then(networkResponse => {
        // 只缓存成功的响应（状态码 200），不缓存错误页或重定向
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        // 克隆响应，因为响应流只能使用一次
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(err => {
        console.error('[SW] 网络请求失败', event.request.url, err);
        // 可以返回一个自定义的离线页面，这里简单返回空
        return new Response('网络连接失败，请检查网络后重试', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});

// 激活阶段：清理旧版本的缓存，并接管所有未受控制的页面
self.addEventListener('activate', event => {
  console.log('[SW] 激活中，清理旧缓存');
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
      console.log('[SW] 激活完成，现在可以控制所有页面');
      return self.clients.claim();
    })
  );
});
