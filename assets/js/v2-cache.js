/* v2: register the service worker after first paint; keep the shared score cache fresh. */
(function(){
  'use strict';

  /* Must match JSON_CACHE in sw-v2.js and v2-ui.js. */
  const JSON_CACHE = 'v2-json-v3';
  const VERSION_KEY = 'v2.score.version';
  const HASH_KEY = 'v2.score.hashes';
  const BUNDLE_PATH = 'data/scores/bundle.json';
  const RECHECK_MS = 10 * 60 * 1000;

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  function register(){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(base + 'sw-v2.js', {scope: base, updateViaCache: 'none'}).catch(function(){});
  }

  async function sha256(buf){
    try{
      const d = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(d)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
    }catch(e){ return ''; }
  }

  let bundlePromise = null;
  let bundleData = null;
  let bundleHash = '';

  /* 一份 bundle 只下载一次；sync 和打开曲目共用同一个 promise。 */
  async function loadBundle(force){
    if (bundleData && !force) return bundleData;
    if (bundlePromise) return bundlePromise;
    bundlePromise = (async function(){
      const url = base + BUNDLE_PATH;
      const abs = new URL(url, location.href);
      let cache = null;
      try{ cache = await caches.open(JSON_CACHE); }catch(e){}
      if (!force && cache){
        try{
          const hit = await cache.match(abs.href, {ignoreSearch:true});
          if (hit){
            const buf = await hit.arrayBuffer();
            bundleData = JSON.parse(new TextDecoder().decode(buf));
            bundleHash = await sha256(buf);
            return bundleData;
          }
        }catch(e){}
      }
      const res = await fetch(url, {
        cache: 'no-store',
        headers: force ? {'X-VP2-Revalidate': '1'} : {}
      });
      if (!res || !res.ok) throw new Error('score bundle unavailable');
      const copy = res.clone();
      const buf = await res.arrayBuffer();
      bundleData = JSON.parse(new TextDecoder().decode(buf));
      bundleHash = await sha256(buf);
      if (cache){ try{ await cache.put(abs.href, copy); }catch(e){} }
      return bundleData;
    })().catch(function(e){ bundlePromise = null; throw e; });
    try{ return await bundlePromise; } finally { bundlePromise = null; }
  }

  let syncing = false;
  let lastCheck = 0;

  /* 首次访问下载 manifest 指向的 bundle；之后按 hash 只补变更。
     曲目打开时直接读同一份 CacheStorage。 */
  async function syncScores(){
    if (syncing || !('caches' in window)) return;
    syncing = true;
    lastCheck = Date.now();
    try{
      const res = await fetch(base + 'data/v2-manifest.json', {cache:'no-store'});
      if (!res.ok) return;
      const manifest = await res.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      if (!files.length) return;
      const entry = files[0];
      if (!entry || !entry.path) return;

      /* 先读缓存（有则顺带算 hash）；hash 不符才强制拉新。 */
      try{
        await loadBundle(false);
      }catch(e){
        return;   /* 下载失败保留旧 hash，下次重试 */
      }
      if (bundleHash && bundleHash !== entry.hash){
        try{
          await loadBundle(true);
        }catch(e){
          return;
        }
      }

      const next = {};
      next[entry.path] = bundleHash || entry.hash;

      /* 删除旧的逐谱缓存，只保留 bundle。 */
      try{
        const cache = await caches.open(JSON_CACHE);
        const keep = {};
        const abs = new URL(base + entry.path, location.href);
        keep[abs.pathname] = true;
        const keys = await cache.keys();
        await Promise.all(keys.map(function(req){
          const u = new URL(req.url);
          if (u.pathname.indexOf('/data/scores/') === -1) return null;
          if (!keep[u.pathname]) return cache.delete(req);
          return null;
        }));
      }catch(e){}

      try{
        localStorage.setItem(HASH_KEY, JSON.stringify(next));
        localStorage.setItem(VERSION_KEY, manifest.version || '');
      }catch(e){}
    }catch(e){
    }finally{
      syncing = false;
    }
  }

  function boot(){
    register();
    if (document.readyState === 'complete') setTimeout(syncScores, 0);
    else window.addEventListener('load', function(){ setTimeout(syncScores, 0); }, {once:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  /* 长时间停留后回到页面时顺带检查新谱；有节流，不阻塞操作。 */
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < RECHECK_MS) return;
    syncScores();
  });

  window.VP2Cache = {loadBundle: loadBundle, sync: syncScores};
})();
