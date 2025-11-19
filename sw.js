const CACHE_NAME = 'game-v0.1.5';
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
            ).then(() => self.clients.claim())
        )
    );
});

self.addEventListener('install', evt => {
    evt.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', evt => {
    if (evt.request.method !== 'GET') return;

    const url = evt.request.url;

    // If it's an image or font, use cache-first
    if (/\.(svg|png|jpg|jpeg|webp|woff2?|ttf|otf)$/i.test(url)) {
        evt.respondWith(
            caches.match(evt.request).then(cached => {
                if (cached) return cached;

                return fetch(evt.request)
                    .then(networkResp => {
                        if (networkResp.ok) {
                            const copy = networkResp.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(evt.request, copy));
                        }
                        return networkResp;
                    })
                    .catch(err => {
                        console.warn("Image/font fetch failed:", url, err);
                    });
            })
        );
        return;
    }

    // Everything else: network-first, fallback to cache if offline
    evt.respondWith(
        fetch(evt.request)
            .then(networkResp => {
                if (networkResp.ok) {
                    const copy = networkResp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(evt.request, copy));
                }
                return networkResp;
            })
            .catch(() => caches.match(evt.request))
    );
});