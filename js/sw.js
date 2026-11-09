const CACHE_NAME = 'PrestaMe-v5';   

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './js/main.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-solid-900.woff2',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-brands-400.woff2',
  // ⬇️ nuevas
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  // ⬇️ existentes
  'https://cdn-icons-png.flaticon.com/192/2489/2489756.png',
  'https://cdn-icons-png.flaticon.com/512/2489/2489756.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(res => {
      if (res) return res;
      return fetch(e.request).then(resp => {
        // Runtime cache: guarda CDN y respuestas nuevas
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});