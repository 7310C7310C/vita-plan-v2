/* v2: no automatic/offline cache for now. The score bundle is fetched once per
   page load; the purge script in index.html removes legacy SW/CacheStorage. */
(function(){
  'use strict';

  const BUNDLE_PATH = 'data/scores/bundle.json';

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  const base = basePath();

  let bundlePromise = null;

  /* 一份 bundle 只下载一次；打开曲目共用同一个 promise。 */
  function loadBundle(){
    if (bundlePromise) return bundlePromise;
    bundlePromise = fetch(base + BUNDLE_PATH, {cache: 'no-store'})
      .then(function(res){
        if (!res || !res.ok) throw new Error('score bundle unavailable');
        return res.json();
      })
      .catch(function(e){
        bundlePromise = null;
        throw e;
      });
    return bundlePromise;
  }

  window.VP2Cache = {
    loadBundle: loadBundle,
    sync: function(){ return Promise.resolve(); }
  };
})();
