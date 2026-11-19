/* v2: register the service worker after first paint; keep the shared score cache fresh. */
(function(){
  'use strict';

  /* Must match JSON_CACHE in sw-v2.js and v2-ui.js. */
  const JSON_CACHE = 'v2-json-v3';
  const VERSION_KEY = 'v2.score.version';
  const HASH_KEY = 'v2.score.hashes';
  const RECHECK_MS = 10 * 60 * 1000;

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  function register(){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(base + 'sw-v2.js', {scope: base, updateViaCache: 'none'}).catch(function(){});
  }

  async function sha256(res){
    try{
      const buf = await res.clone().arrayBuffer();
      const d = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(d)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
    }catch(e){ return ''; }
  }

  function readHashes(){
    try{
      const v = JSON.parse(localStorage.getItem(HASH_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    }catch(e){ return {}; }
  }

  let syncing = false;
  let lastCheck = 0;

  /* 首次访问下载 manifest 里的全部 JSON；之后只补新增/变更文件。
     全部在后台进行，打开谱子时直接读同一份 CacheStorage。 */
  async function syncScores(){
    if (syncing || !('caches' in window)) return;
    syncing = true;
    lastCheck = Date.now();
    try{
      const cache = await caches.open(JSON_CACHE);
      const res = await fetch(base + 'data/v2-manifest.json', {cache:'no-store'});
      if (!res.ok) return;
      const manifest = await res.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      if (!files.length) return;

      const stored = readHashes();
      const next = {};
      const keep = {};
      await Promise.all(files.map(async function(f){
        const url = base + f.path;
        const old = stored[f.path] || '';
        let abs;
        try{ abs = new URL(url, location.href); }catch(e){ return; }
        keep[abs.pathname] = true;
        try{
          const hit = await cache.match(abs.href, {ignoreSearch:true});
          let digest = old;
          if (hit && !digest) digest = await sha256(hit);
          const valid = !!hit && !!digest && digest === f.hash;
          /* 缓存缺失、哈希不符或无法校验时才联网 */
          if (!valid){
            const r = await fetch(url, {cache:'no-store', headers:{'X-VP2-Revalidate':'1'}});
            if (r && r.ok){
              const got = await sha256(r);
              await cache.put(abs.href, r.clone());
              /* 部署瞬间 manifest 可能比文件新；存实际哈希，下次会重试。 */
              next[f.path] = got || f.hash;
            } else {
              next[f.path] = old;   /* 下载失败保留旧哈希，下次重试 */
            }
            return;
          }
          next[f.path] = f.hash;
        }catch(e){
          next[f.path] = old;
        }
      }));

      /* 删除 manifest 里已不存在的旧谱缓存。 */
      try{
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
})();
