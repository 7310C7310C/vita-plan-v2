/* v2 background cache: delayed SW registration + prefetch every score JSON. */
(function(){
  'use strict';

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  function register(){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(base + 'sw-v2.js', {scope: base, updateViaCache: 'none'})
      .catch(function(){});
  }
  if (document.readyState === 'complete') setTimeout(register, 2500);
  else window.addEventListener('load', function(){ setTimeout(register, 2500); }, {once:true});

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
      .then(() => {
        /* Warm the frame after the first paint so the first score opens fast. */
        return caches.open('v2-shell-2').then(cache =>
          cache.match(base + 'player-frame.html').then(hit => {
            if (hit) return null;
            return fetch(base + 'player-frame.html').then(res => {
              if (res && res.ok) return cache.put(base + 'player-frame.html', res);
            });
          })
        );
      })
      .catch(function(){});
  }

  function schedule(){
    if ('requestIdleCallback' in window) requestIdleCallback(start, {timeout: 4000});
    else setTimeout(start, 2500);
  }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, {once:true});
})();
