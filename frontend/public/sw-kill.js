/*
 * League SZN service worker kill switch.
 *
 * Not registered by the app. Deploy it AS /sw.js only when the service worker
 * has to be removed, for example when rolling back to a build that has no
 * sw.js. Browsers check /sw.js on navigation, install this version, and it
 * deletes every cache and unregisters itself. Open pages keep running; their
 * next load goes straight to the network.
 *
 *   aws s3 cp dist/sw-kill.js s3://<bucket>/sw.js \
 *     --cache-control "no-cache" --content-type "application/javascript"
 *
 * See "Service worker and rollback" in docs/dev-journal/2026-11-site-redesign.md.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeServiceWorker());
});

async function removeServiceWorker() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  await self.registration.unregister();
}
