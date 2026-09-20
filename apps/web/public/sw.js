/*
 * Offline shell for the PWA.
 *
 * The whole app is client-side — the engine computes everything locally and
 * there is no API to be offline from — so the only thing standing between the
 * user and a working app on a casino floor with no signal is whether the
 * bundle is cached. That makes this worth getting right rather than treating
 * it as install-banner plumbing.
 *
 * Strategy:
 *   - navigations: network first (so a deploy is picked up), falling back to
 *     the cached shell, which is what makes the installed app open offline;
 *   - same-origin static assets: cache first, since Vite fingerprints them and
 *     a given URL's bytes never change;
 *   - everything else: straight to the network.
 */

const VERSION = "v1";
const SHELL_CACHE = `ba-predict-shell-${VERSION}`;
const ASSET_CACHE = `ba-predict-assets-${VERSION}`;
const SHELL_URL = "/index.html";

const PRECACHE = [
  "/",
  SHELL_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // A single failed entry must not fail the whole install.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(SHELL_URL)) ?? (await cache.match("/"));
    if (cached) return cached;
    return new Response("Offline and no cached copy of the app is available.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (/\.(?:js|css|png|svg|webmanifest|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
