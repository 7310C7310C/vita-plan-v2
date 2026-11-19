/* Retired v1 service worker.
 *
 * The v2 app uses sw-v2.js. This file is kept only as a tombstone for clients
 * that still have the old v1 worker registered: on the next update check it
 * clears the v1 asset caches and unregisters itself. Remove after one release
 * cycle (30 days) once access logs show no more /sw.js traffic.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key.indexOf('vita-plan-assets-') === 0)
          .map(key => caches.delete(key))
      );
    } catch (e) { /* best effort */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* best effort */ }
  })());
});
