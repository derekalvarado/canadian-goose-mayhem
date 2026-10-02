const PRECACHE_CACHE_PREFIX = "goose-game-precache-";
const RUNTIME_CACHE_PREFIX = "goose-game-runtime-";
const BUILD_ID = "dev";
const PRECACHE_CACHE_NAME = `${PRECACHE_CACHE_PREFIX}${BUILD_ID}`;
const RUNTIME_CACHE_NAME = `${RUNTIME_CACHE_PREFIX}${BUILD_ID}`;
const PRECACHE_URLS = [];
const HAS_PRECACHE = PRECACHE_URLS.length > 0;
const NETWORK_TIMEOUT_MS = 1500;
// Phones waking their radio can take several seconds to reach the server; giving up
// sooner would show the previous version of the game even though a newer one exists.
const NAVIGATION_TIMEOUT_MS = 8000;
// Vite names built files after their contents, so a cached copy never goes stale.
const IMMUTABLE_ASSET_PATTERN = /^assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

async function findCached(request) {
  return caches.match(request, { ignoreSearch: !HAS_PRECACHE });
}

async function fetchWithTimeout(request, { timeoutMs = NETWORK_TIMEOUT_MS, cache } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(cache ? new Request(request, { cache }) : request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheNavigation(request, response) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  await cache.put(request, response.clone());
  await cache.put(new Request(new URL("index.html", self.location)), response.clone());
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
    const installUrls = HAS_PRECACHE ? PRECACHE_URLS : ["./"];
    await Promise.all(installUrls.map(async (url) => {
      const absoluteUrl = new URL(url, self.location);
      try {
        if (IMMUTABLE_ASSET_PATTERN.test(url)) {
          const previous = await caches.match(absoluteUrl);
          if (previous) {
            await cache.put(absoluteUrl, previous);
            return;
          }
        }
        // Skip the browser's own short-term cache so a fresh deploy is never stored as stale.
        await cache.add(new Request(absoluteUrl, { cache: "reload" }));
      } catch {
        // A file can fail on a flaky connection; it is fetched again when the game asks for it.
      }
    }));
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
      try {
        const response = await fetchWithTimeout(request, { timeoutMs: NAVIGATION_TIMEOUT_MS, cache: "no-cache" });
        if (!response.ok) throw new Error(`Navigation failed with ${response.status}`);
        await cacheNavigation(request, response);
        return response;
      } catch {
        const cached = await findCached(request)
          ?? (await caches.match(new URL("index.html", self.location)))
          ?? (await caches.match(new URL("./", self.location)));
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
