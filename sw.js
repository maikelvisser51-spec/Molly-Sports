const CACHE = 'molly-sports-v4';
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  const isAppFile = url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/Molly-Sports/');
  if (isAppFile) {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
  } else {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
