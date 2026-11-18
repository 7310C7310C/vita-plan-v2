/* Vita Plan v2 service worker: pre-cache shell + all JSON scores after first paint. */
const SHELL_CACHE = 'v2-shell-144';
const JSON_CACHE = 'v2-json-v2';
const SHELL = [
  'index.html',
  'favicon.ico',
  'player-frame.html',
  'data/songs.json?v=20261115185326',
  'assets/css/style.css?v=20261115185326',
  'assets/css/v2-ui.css?v=22',
  'assets/js/v2-ui.js?v=25',
  'assets/js/script.js?v=2026111806',
  'assets/js/v2-cache.js?v=8',
  'data/v2-scores.js?v=6'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => null)));
    try{
      const manifestUrl = new URL('data/v2-manifest.json', self.registration.scope).href;
      const manifest = await (await fetch(manifestUrl, {cache:'no-store'})).json();
      const jsonCache = await caches.open(JSON_CACHE);
      if (manifest && Array.isArray(manifest.files)){
        await Promise.all(manifest.files.map(f => {
          const url = new URL(f.path, self.registration.scope).href;
          return jsonCache.add(new Request(url, {cache:'reload'})).catch(() => null);
        }));
      }
    }catch(e){}
    await self.skipWaiting();
  })());
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
    event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  if (path.indexOf('/data/scores/') !== -1) {
    /* 已缓存秒开；后台 no-store 拉新版写回缓存，下次打开即新 */
    event.respondWith(staleWhileRevalidateJson(req, event));
    return;
  }
  if (path.endsWith('/data/v2-scores.json') || path.endsWith('/data/v2-manifest.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (path.endsWith('/data/chords-guitar.json')) {
    event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  if (path.endsWith('/player-frame.html')) {
    event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(navigationFirst(req, event));
    return;
  }
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html') || path.endsWith('favicon.ico')) {
    event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req, {ignoreSearch:true})));
});

async function cacheFirstShell(req){
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, {ignoreSearch:true});
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidateJson(req, event){
  const cache = await caches.open(JSON_CACHE);
  if (req.headers.get('x-vp2-revalidate')){
    const res = await fetch(req, {cache:'no-store'});
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  }
  const hit = await cache.match(req, {ignoreSearch:true});
  const network = fetch(req, {cache:'no-store'}).then(async res=>{
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  }).catch(()=>null);
  if (hit){
    if (event && event.waitUntil) event.waitUntil(network);
    return hit;
  }
  const res = await network;
  return res || Response.error();
}

async function cacheFirst(req){
  const cache = await caches.open(JSON_CACHE);
  const hit = await cache.match(req, {ignoreSearch:true});
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event){
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  const network = fetch(req, {cache:'no-store'}).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit){
    if (event && event.waitUntil) event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

async function navigationFirst(req, event){
  const cache = await caches.open(SHELL_CACHE);
  const indexUrl = new URL('index.html', self.registration.scope).href;
  const hit = (await cache.match(req, {ignoreSearch:true})) || (await cache.match(indexUrl));
  const network = fetch(req, {cache:'no-store'}).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit){
    if (event && event.waitUntil) event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

async function networkFirst(req){
  try{
    const res = await fetch(req, {cache:'no-store'});
    if (res && res.ok){
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  }catch(e){
    return (await caches.match(req, {ignoreSearch:true})) || Response.error();
  }
}
