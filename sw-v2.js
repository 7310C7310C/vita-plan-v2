/* Vita Plan v2 service worker: small shell, SWR assets, cached JSON scores. */
const SHELL_CACHE = 'v2-shell-2';
const JSON_CACHE = 'v2-json-v1';
const SHELL = ['index.html', 'favicon.ico', 'data/v2-scores.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => {
      if (key === SHELL_CACHE || key === JSON_CACHE) return null;
      if (key.indexOf('v2-shell-') === 0) return caches.delete(key);
      if (key.indexOf('v2-json-') === 0) return caches.delete(key);
      if (key.indexOf('vita-plan-assets-') === 0) return caches.delete(key);
      return null;
    }))).then(() => self.clients.claim())
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
    event.respondWith(cacheFirst(req));
    return;
  }
  if (path.endsWith('/data/v2-scores.json') || path.endsWith('/data/v2-manifest.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(navigationFirst(req));
    return;
  }
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html') || path.endsWith('favicon.ico')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req, {ignoreSearch:true})));
});

async function cacheFirst(req){
  const cache = await caches.open(JSON_CACHE);
  const hit = await cache.match(req, {ignoreSearch:true});
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || network || Response.error();
}

async function navigationFirst(req){
  try{
    const res = await fetch(req);
    if (res && res.ok){
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    const cache = await caches.open(SHELL_CACHE);
    const indexUrl = new URL('index.html', self.registration.scope).href;
    return (await cache.match(req, {ignoreSearch:true})) ||
           (await cache.match(indexUrl)) ||
           Response.error();
  }
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
    return (await caches.match(req, {ignoreSearch:true})) || Response.error();
  }
}
