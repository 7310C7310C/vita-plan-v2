/* v2 background cache: register SW and prefetch every score JSON (non-blocking). */
(function(){
  'use strict';

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register(base + 'sw-v2.js', {scope: base, updateViaCache: 'none'})
      .catch(function(){});
  }

  function start(){
    if (!('caches' in window)) return;
    fetch(base + 'data/v2-manifest.json', {cache:'no-store'})
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (!m || !Array.isArray(m.files)) return;
        const versionKey = 'v2.cache.version';
        const old = localStorage.getItem(versionKey) || '';
        const force = old !== m.version;
        return caches.open('v2-json-v1').then(async cache => {
          let i = 0;
          const worker = async () => {
            while (i < m.files.length){
              const f = m.files[i++];
              const url = base + f.path;
              try{
                if (!force && await cache.match(url)) continue;
                const res = await fetch(url, {cache:'no-store'});
                if (res && res.ok) await cache.put(url, res);
              }catch(e){}
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          localStorage.setItem(versionKey, m.version);
        });
      })
      .catch(function(){});
  }

  if ('requestIdleCallback' in window) requestIdleCallback(start, {timeout: 3000});
  else setTimeout(start, 1500);
})();
