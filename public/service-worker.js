const PRECACHE_CACHE_PREFIX = "goose-game-precache-";
const RUNTIME_CACHE_PREFIX = "goose-game-runtime-";
const BUILD_ID = "__BUILD_ID__";
const PRECACHE_CACHE_NAME = `${PRECACHE_CACHE_PREFIX}${BUILD_ID}`;
const RUNTIME_CACHE_NAME = `${RUNTIME_CACHE_PREFIX}v1`;
const PRECACHE_URLS = "__PRECACHE_URLS__";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE_CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => (
        (cacheName.startsWith(PRECACHE_CACHE_PREFIX) && cacheName !== PRECACHE_CACHE_NAME)
        || (cacheName.startsWith(RUNTIME_CACHE_PREFIX) && cacheName !== RUNTIME_CACHE_NAME)
      ))
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      return (await caches.match("/index.html"))
        ?? (await caches.match("/"))
        ?? fetch(request).catch(() => new Response("Goose Game 2 is unavailable until it has been opened online once.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }));
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("This game asset is not available offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
