/*
 * League SZN service worker.
 *
 * Plain JavaScript, copied as-is by Vite from public/ and served at /sw.js with
 * no-cache, so browsers see a new version on the next navigation after a deploy.
 *
 * What it does, and deliberately does not do:
 * - Page navigations go to the network first. Online users always get the
 *   current index.html, so deploys and rollbacks take effect at once. Only when
 *   the network fails is the cached offline page shown. A cached copy of the app
 *   shell is never served: without the API the app is useless, and stale shells
 *   have caused cache bugs before.
 * - Hashed build files under /assets/ never change once published, so they are
 *   served from the cache first and stored as they are fetched. The cache is
 *   capped so it cannot grow forever.
 * - The offline page, the manifest and the brand icons are stored on install so
 *   the offline page can draw itself. Online they still come from the network.
 * - Everything else is left to the browser: the API, Cognito, S3 images, wiki
 *   markdown, cross-origin requests and anything that is not a GET. Auth and
 *   league data are never served from this cache.
 *
 * Bump CACHE_VERSION when the precached files change. Old caches are deleted
 * when the new worker activates.
 *
 * Rolling back to a build without this file: see "Service worker and rollback"
 * in docs/dev-journal/2026-11-site-redesign.md, and public/sw-kill.js.
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'league-szn-';
const PRECACHE_NAME = `${CACHE_PREFIX}precache-${CACHE_VERSION}`;
const ASSET_CACHE_NAME = `${CACHE_PREFIX}assets-${CACHE_VERSION}`;
const CURRENT_CACHES = [PRECACHE_NAME, ASSET_CACHE_NAME];

const OFFLINE_URL = '/offline.html';
const ASSET_PATH_PREFIX = '/assets/';
const MAX_ASSET_ENTRIES = 150;

const PRECACHE_PATHS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/images/brand/icon-32.png',
  '/images/brand/icon-180.png',
  '/images/brand/icon-192.png',
  '/images/brand/icon-512.png',
  '/images/brand/icon-maskable-192.png',
  '/images/brand/icon-maskable-512.png',
];
const PRECACHE_PATH_SET = new Set(PRECACHE_PATHS);

self.addEventListener('install', (event) => {
  event.waitUntil(precacheStaticFiles());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCachesAndClaim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  // Media seeking and resumable downloads. A cached full body cannot answer them.
  if (request.headers.has('range')) return;
  // Chrome bug: DevTools can issue this combination, and fetch() rejects it.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith(ASSET_PATH_PREFIX)) {
    event.respondWith(cacheFirstAsset(request, event));
    return;
  }

  if (PRECACHE_PATH_SET.has(url.pathname)) {
    event.respondWith(networkFirstPrecached(request, url.pathname));
  }
  // Anything else falls through untouched to the browser.
});

async function precacheStaticFiles() {
  const cache = await caches.open(PRECACHE_NAME);
  // cache: 'reload' skips the HTTP cache so the precache starts from fresh copies.
  await cache.addAll(PRECACHE_PATHS.map((path) => new Request(path, { cache: 'reload' })));
  // Safe to take over at once: navigations always go to the network, so a page
  // controlled by the new worker still loads the current index.html, and hashed
  // assets are immutable, so an open tab's old files keep working.
  await self.skipWaiting();
}

async function deleteOldCachesAndClaim() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => !CURRENT_CACHES.includes(cacheName))
      .map((cacheName) => caches.delete(cacheName)),
  );
  await self.clients.claim();
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (_networkError) {
    const cache = await caches.open(PRECACHE_NAME);
    const offlinePage = await cache.match(OFFLINE_URL);
    return offlinePage || Response.error();
  }
}

async function cacheFirstAsset(request, event) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableAsset(response)) {
    const copy = response.clone();
    event.waitUntil(storeAsset(cache, request, copy));
  }
  return response;
}

async function storeAsset(cache, request, response) {
  await cache.put(request, response);
  await trimCache(cache, MAX_ASSET_ENTRIES);
}

/** Deletes the oldest entries. Cache keys come back in insertion order. */
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function networkFirstPrecached(request, pathname) {
  try {
    const response = await fetch(request);
    if (response.ok) return response;
    return (await matchPrecached(pathname)) || response;
  } catch (networkError) {
    const cached = await matchPrecached(pathname);
    if (cached) return cached;
    throw networkError;
  }
}

async function matchPrecached(pathname) {
  const cache = await caches.open(PRECACHE_NAME);
  return cache.match(pathname);
}

/**
 * Only real, same-origin, successful files are stored. CloudFront answers a
 * missing path with index.html and status 200, so an HTML body under /assets/
 * means the file does not exist and must not be cached under that name.
 */
function isCacheableAsset(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  if (response.status !== 200) return false;
  const contentType = response.headers.get('content-type') || '';
  return !contentType.includes('text/html');
}
