/* One-shot migration worker for the kcan.cc origin.
 *
 * v1 registered /sw.js on the same origin. After the v2 cutover the old worker
 * could still answer asset requests from its v1 caches on the first visit
 * (v2 HTML + v1 JS). This worker replaces the v1 one, purges every cache,
 * closes the v1 offline DB, unregisters itself and lets the page reload once.
 * It installs no fetch handler: after migration the site simply uses the
 * network until sw-v2.js takes over.
 */
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        } catch (e) { /* ignore */ }
        try {
            if (self.indexedDB && indexedDB.deleteDatabase) {
                indexedDB.deleteDatabase('vita_plan_offline');
            }
        } catch (e) { /* ignore */ }
        try {
            await self.clients.claim();
        } catch (e) { /* ignore */ }
        try {
            await self.registration.unregister();
        } catch (e) { /* ignore */ }
        /* No client.navigate(): the page-level guard below reloads once, with a
           sessionStorage latch, so a failed unregister cannot cause a reload loop. */
    })());
});
