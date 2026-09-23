const PRECACHE_CACHE_PREFIX = "goose-game-precache-";
const RUNTIME_CACHE_PREFIX = "goose-game-runtime-";
const BUILD_ID = "dev";
const PRECACHE_CACHE_NAME = `${PRECACHE_CACHE_PREFIX}${BUILD_ID}`;
const RUNTIME_CACHE_NAME = `${RUNTIME_CACHE_PREFIX}v1`;
const PRECACHE_URLS = [];
const HAS_PRECACHE = PRECACHE_URLS.length > 0;
const NETWORK_TIMEOUT_MS = 1500;

async function findCached(request) {
  return caches.match(request, { ignoreSearch: !HAS_PRECACHE });
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheNavigation(request, response) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  await cache.put(request, response.clone());
  await cache.put(new Request(new URL("/index.html", self.location.origin)), response.clone());
}

async function warmCache(urls) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  await Promise.all(urls.slice(0, 100).map(async (rawUrl) => {
    try {
      const url = new URL(rawUrl, self.location.origin);
      if (url.origin !== self.location.origin) return;
      const request = new Request(url.href);
      const response = await fetchWithTimeout(request);
      if (response.ok) await cache.put(request, response.clone());
    } catch {
      // A resource can fail while the server is already going offline.
    }
  }));
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm-cache" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(warmCache(event.data.urls.filter((url) => typeof url === "string")));
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE_CACHE_NAME);
    const installUrls = HAS_PRECACHE ? PRECACHE_URLS : ["/"];
    await Promise.all(installUrls.map((url) => cache.add(url).catch(() => undefined)));
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
      const cached = await findCached(request)
        ?? (await caches.match("/index.html"))
        ?? (await caches.match("/"));
      if (HAS_PRECACHE && cached) return cached;

      try {
        const response = await fetchWithTimeout(request);
        if (!response.ok) throw new Error(`Navigation failed with ${response.status}`);
        await cacheNavigation(request, response);
        return response;
      } catch {
        return cached ?? new Response("Goose Game 2 is unavailable until it has been opened online once.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await findCached(request);
    if (HAS_PRECACHE && cached) return cached;

    try {
      const response = await fetchWithTimeout(request);
      if (!response.ok) throw new Error(`Asset failed with ${response.status}`);
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    } catch {
      return cached ?? new Response("This game asset is not available offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
