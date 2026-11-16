/* Vita Plan v2 service worker: shell + all JSON scores + latest weekly fallback. */
const SHELL_CACHE = 'v2-shell-1';
const JSON_CACHE = 'v2-json-v1';
const SHELL = [
  'index.html',
  'assets/css/style.css',
  'assets/css/v2-ui.css',
  'assets/js/v2-ui.js',
  'assets/js/script.js',
  'assets/js/v2-cache.js',
  'player-frame.html',
  'favicon.ico',
  'data/songs.json',
  'data/v2-scores.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        if (key === SHELL_CACHE || key === JSON_CACHE) return null;
        if (key.indexOf('v2-') === 0) return caches.delete(key);
        return caches.delete(key); /* drop v1 offline caches on this origin */
      })))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname;

  if (path.endsWith('/data/songs.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (path.indexOf('/data/scores/') !== -1) {
    event.respondWith(cacheFirst(req, JSON_CACHE));
    return;
  }
  if (path.endsWith('/data/v2-scores.json') || path.endsWith('/data/v2-manifest.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html') || path.endsWith('favicon.ico')) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req, {ignoreSearch:true})));
});

async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, {ignoreSearch:true});
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req){
  try{
    const res = await fetch(req);
    if (res && res.ok){
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    const cached = await caches.match(req, {ignoreSearch:true});
    return cached || Response.error();
  }
}
