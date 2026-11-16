/* v2: register the service worker after first paint; the SW pre-caches shell + scores. */
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
})();
