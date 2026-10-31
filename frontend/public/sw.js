// Minimal service worker: makes the app installable. It caches nothing, so private data never lands in a cache.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
