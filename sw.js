const CACHE_NAME = 'game-v1';
const ALLOWED_CACHES = [CACHE_NAME];

self.addEventListener('activate', evt => {
    evt.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames.map(cacheName => {
                    if (!ALLOWED_CACHES.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('install', evt => {
    evt.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', evt => {
    evt.respondWith(
        caches.match(evt.request).then(cached => {
            if (cached) {
                return cached;
            }
            return fetch(evt.request).then(networkResp => {
                if (
                    evt.request.method === 'GET' &&
                    (evt.request.destination === 'image' || evt.request.destination === 'font')
                ) {
                    const copy = networkResp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(evt.request, copy));
                }
                return networkResp;
            });
        })
    );
});
