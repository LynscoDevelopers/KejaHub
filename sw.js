const VERSION = "kejahub-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hosts whose static assets are safe to cache (Firebase SDK, fonts, map tiles).
const CACHEABLE = [/^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\//];

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Page navigations: network first, fall back to cached app shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // Same-origin static files: cache first, refresh in background.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Firebase SDK, fonts, map tiles: stale-while-revalidate. Firestore/Auth API calls are never touched.
  if (CACHEABLE.some(rx => rx.test(req.url))) {
    e.respondWith(
      caches.open(RUNTIME).then(c =>
        c.match(req).then(hit => {
          const net = fetch(req).then(res => {
            if (res.ok || res.type === "opaque") c.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
  }
});
