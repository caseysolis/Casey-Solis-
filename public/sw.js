// Offline shell: network-first for app files, never caches /api responses.
const CACHE = 'acn-sim-shell-v1';
const SHELL = ['/', '/index.html', '/app.css', '/app.js', '/sync.js', '/chart.js', '/icon.svg', '/manifest.webmanifest',
  '/engine/constants.js', '/engine/allocation.js', '/engine/forecast.js', '/engine/downside.js', '/engine/money.js',
  '/engine/paper.js', '/engine/quotes.js', '/engine/totalReturn.js', '/engine/csv.js', '/engine/state.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname === '/' ? '/index.html' : e.request, copy)); }
    return res;
  }).catch(() => caches.match(url.pathname === '/' ? '/index.html' : e.request).then((r) => r || caches.match('/index.html'))));
});
