/* EFG Weather: service worker mínimo. Solo guarda la estructura estática propia.
   Nunca guarda API, clima, radar, mapas ni respuestas privadas. */
const VERSION = "efg-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/fragrances.json"];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Cache the current production entry chunks on the very first visit.
    const response = await cache.match("/");
    const html = response ? await response.text() : "";
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
    if (assets.length) await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("efg-shell-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  const isNavigation = request.mode === "navigate";
  const isStatic = isNavigation || url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname);
  if (!isStatic) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(isNavigation ? "/" : request, copy));
      }
      return response;
    }).catch(() => caches.match(isNavigation ? "/" : request).then((hit) => hit || Response.error()))
  );
});
