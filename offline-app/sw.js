// Service worker do Giropeças Offline — cache-first para funcionar 100% sem internet.
var CACHE = 'giropecas-offline-v1';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './license.js',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
