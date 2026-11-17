/* v2: register the service worker after first paint; the SW pre-caches shell + scores. */
(function(){
  'use strict';

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  function register(){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(base + 'sw-v2.js', {scope: base, updateViaCache: 'none'}).catch(function(){});
  }

  let syncing = false;
  async function syncScores(){
    if (syncing) return;
    syncing = true;
    try{
      const res = await fetch(base + 'data/v2-manifest.json', {cache:'no-store'});
      if (!res.ok) return;
      const manifest = await res.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      const cache = await caches.open('v2-json-v2');
      const hits = await Promise.all(files.map(function(f){ return cache.match(base + f.path); }));
      const key = 'v2.score.version';
      if (localStorage.getItem(key) === manifest.version && hits.every(Boolean)) return;
      await Promise.all(files.map(async function(f){
        try{
          const r = await fetch(base + f.path, {cache:'no-store', headers:{'X-VP2-Revalidate':'1'}});
          if (r && r.ok) await cache.put(base + f.path, r);
        }catch(e){}
      }));
      localStorage.setItem(key, manifest.version);
    }catch(e){}
    finally{ syncing = false; }
  }
  if (document.readyState === 'complete'){ setTimeout(register, 0); setTimeout(syncScores, 0); }
  else window.addEventListener('load', function(){ setTimeout(register, 0); setTimeout(syncScores, 0); }, {once:true});
})();
