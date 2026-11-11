// BXTrades service worker: lets the site and tools open offline and install like an app.
// Pages: try the network first (so updates show straight away), fall back to the saved copy.
// Files like CSS, JS and images: show the saved copy instantly, refresh it in the background.
// Change VERSION whenever you want every visitor to drop their old saved copies.
const VERSION = "bxt-v2";
const CORE = [
  "/", "/index.html", "/tracker.html", "/prop-calculator.html", "/journal.html",
  "/sessions.html", "/glossary.html", "/links.html", "/privacy.html", "/404.html",
  "/style.css", "/tools.css", "/script.js", "/manifest.webmanifest",
  "/images/icon-192.png", "/images/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Only handle our own site. TradingView, Discord, GoatCounter etc. go straight to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  const isPage = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isPage) {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(hit => hit || caches.match("/index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
