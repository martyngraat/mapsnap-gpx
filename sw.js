const CACHE_NAME = 'geoforge-v18';
const ASSETS = [
  './',
  './index.html',
  './index.css?v=18',
  './app.js?v=18',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const isLocal = e.request.url.startsWith(self.location.origin) || 
                  e.request.url.includes('unpkg.com') || 
                  e.request.url.includes('fonts.googleapis.com');
                  
  if (!isLocal) {
    return;
  }
  
  // Network-first for HTML document navigation requests to avoid caching traps
  const isHtml = e.request.mode === 'navigate' || 
                 e.request.url.endsWith('index.html') || 
                 e.request.url === self.location.origin + '/' || 
                 e.request.url.replace(/\/$/, '') === self.location.origin + '/mapsnap-gpx';

  if (isHtml) {
    e.respondWith(
      fetch(e.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(e.request);
      })
    );
    return;
  }
  
  // Cache-first for other local assets (js, css, images)
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        const fetchedResponse = fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);
        
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
