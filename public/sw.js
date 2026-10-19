// 離線快取：沒網路也能開遊戲（存檔本來就在本機）。
// 頁面用「網路優先」，拿不到才用快取；圖片和程式用「先給快取、背景更新」。
const CACHE = 'cycle-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 頁面按「重新整理更新」時叫新版接手
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** 打包後的檔名帶雜湊（index-abc123.js）；存新版時把同名的舊版刪掉，快取才不會越積越多。 */
function hashedStem(url) {
  const m = /\/assets\/(.+?)-[\w-]{6,}(\.\w+)$/.exec(url);
  return m ? m[1] + m[2] : null;
}

async function putFresh(cache, request, response) {
  const stem = hashedStem(request.url);
  if (stem) {
    for (const old of await cache.keys()) if (old.url !== request.url && hashedStem(old.url) === stem) await cache.delete(old);
  }
  await cache.put(request, response);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) putFresh(cache, req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// 推播通知（伺服器用 Web Push 送來，內容已經解密）
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Aquarist's Life", {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: './', category: data.category },
    }),
  );
});

// 點通知：已經開著就切過去，沒開就打開遊戲
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(event.notification.data?.url || './');
    }),
  );
});
