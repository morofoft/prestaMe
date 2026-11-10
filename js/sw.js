/* PrestaMe Service Worker — v6 (network-first HTML + resilient install) */
const CACHE_VERSION = 'v7';
const CACHE_STATIC  = 'prestame-static-'  + CACHE_VERSION;
const CACHE_RUNTIME = 'prestame-runtime-' + CACHE_VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './js/main.js'
];

const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-solid-900.woff2',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-brands-400.woff2',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdn-icons-png.flaticon.com/192/2489/2489756.png',
  'https://cdn-icons-png.flaticon.com/512/2489/2489756.png'
];

/* install: precache local (obligatorio) + CDN (best-effort) */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    // local: si falla, install falla (queremos fallar fuerte aquí)
    await cache.addAll(PRECACHE);
    // CDN: si falla uno, no rompe el install
    await Promise.allSettled(
      CDN_ASSETS.map(u => cache.add(new Request(u, { mode: 'cors', credentials: 'omit' })))
    );
  })());
});

/* activate: limpia versiones viejas + toma control + avisa */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION }));
  })());
});

/* mensaje desde el cliente (botón "Buscar actualización") */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* fetch: estrategias diferenciadas */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* 1) Navegación (HTML): network-first → siempre busca nueva versión */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req, { cache: 'no-store' });
        if (resp && resp.status === 200) {
          const cache = await caches.open(CACHE_STATIC);
          cache.put('./index.html', resp.clone());
        }
        return resp;
      } catch {
        return (await caches.match('./index.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  /* 2) Assets locales: stale-while-revalidate */
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then(resp => {
        if (resp && resp.status === 200) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || (await networkPromise) || new Response('', { status: 404 });
    })());
    return;
  }

  /* 3) CDN: cache-first (son inmutables por versión) */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200) {
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch {
      return new Response('', { status: 503 });
    }
  })());
});