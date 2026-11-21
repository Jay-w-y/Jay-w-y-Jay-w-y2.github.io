/* ============================================================
   zhou云音乐 · PWA Service Worker
   策略：只缓存「应用外壳」，不缓存音频大文件与 Supabase 接口。
   - 外壳(index/manifest/图标) → 缓存优先 / 导航网络优先
   - 跨域请求(Supabase Storage / REST API) → 完全放行，不缓存
   ============================================================ */

var CACHE_NAME = 'zhou-music-shell-v2';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* 安装：逐个缓存外壳文件（单个失败不阻断整体安装） */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(url).catch(function () { /* 文件缺失时跳过 */ });
      }));
    }).then(function () {
      return self.skipWaiting(); // 新 SW 立即接管
    })
  );
});

/* 激活：清理旧版本缓存 */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf('zhou-music-shell-') === 0 && key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* 请求拦截 */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // 只处理同源 GET；POST/PUT 及跨域(Supabase)一律放行
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // 导航请求(index.html)：网络优先，离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put('./index.html', copy);
        });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // 其余同源静态资源：缓存优先，未命中则网络拉取并回填
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      });
    })
  );
});
