/* Bilgi Dozu — service worker (PWA / ana ekrana yükleme)
 *
 * Strateji:
 *   - Navigasyon (HTML): network-first → çevrimdışıysa önbellekten index.html
 *   - data/shorts_top.json: network-first → önbellek yedeği (sayılar hep taze)
 *   - Diğer aynı-köken GET: stale-while-revalidate
 *   - /admin ve /miracoo: hiç karışmaz (ağ ne derse o)
 */
const VERSION = 'bilgidozu-v3';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Tek tek ekle: biri 404 olsa bile kurulum bozulmasın
    await Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isExcluded = (url) => /\/(admin|miracoo)(\/|$)/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // YouTube kapakları vb. tarayıcıya bırak
  if (isExcluded(url)) return;

  // HTML gezinmeleri: önce ağ, düşerse önbellek
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Canlı veri: önce ağ (sayılar bayatlamasın), düşerse önbellek
  if (url.pathname.endsWith('/data/shorts_top.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || new Response('{"top_shorts":[],"top_longs":[]}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // Statik dosyalar: önce önbellek, arkada tazele
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
