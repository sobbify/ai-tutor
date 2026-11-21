/*
 * ELSA service worker — keeps the phrasebook usable offline (FR-22).
 *   • her saved lines (GET /api/tutor/phrasebook): network first, last copy when offline
 *   • each line's audio (GET /api/tutor/phrasebook/{id}/voice): cache first (lines never change)
 *   • app shell and hashed assets: so /phrasebook opens without a connection
 * Nothing else is cached. The offline copy is dropped when anyone enters through /in (shared
 * phones), when the session ends, and when she deletes her data.
 */
const SHELL = 'elsa-shell-v1';
const DATA = 'elsa-data-v1';
const KEEP = [SHELL, DATA];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('elsa-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA));
});

const ok = (response) => response && response.status === 200 && response.type === 'basic';

async function networkFirst(request, cacheName, key = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (ok(response)) await cache.put(key, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (ok(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && (url.pathname === '/in' || url.pathname === '/in/')) {
    // A (possibly different) teacher is entering on this device: forget the previous offline copy.
    event.waitUntil(caches.delete(DATA));
    return;
  }
  if (/^\/api\/tutor\/phrasebook\/\d+\/voice$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, DATA));
  } else if (url.pathname === '/api/tutor/phrasebook') {
    event.respondWith(networkFirst(request, DATA));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, SHELL));
  } else if (request.mode === 'navigate' && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/in')) {
    // One copy of the app page serves every learner route offline.
    event.respondWith(networkFirst(request, SHELL, '/__app'));
  }
});
