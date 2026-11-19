// FLAME PH app worker (Phase 11). One worker for the whole site, at the same address as the old push-only worker so
// members who turned notifications on keep them.
//   - Offline shell: when there is no internet, a page you open shows the saved "Offline ka yata" page instead of the
//     browser's error. Pages themselves are NEVER saved (they can hold a member's private data); only the offline page,
//     the app icons and the site's versioned code files (/_next/static, the same for everyone) are kept.
//   - Push notifications: shown only for members who turned them on (Account -> Notifications), as before.
const SHELL = "flameph-shell-v1";
const STATIC = "flameph-static-v1";
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_STATIC = 120;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;              // Supabase, fonts, other sites: untouched
  if (req.mode === "navigate") {
    // Always the live page; the saved offline page only when the network fails.
    e.respondWith(fetch(req).catch(() => caches.match("/offline", { cacheName: SHELL }).then((r) => r || Response.error())));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    // Versioned code and styles: the file name changes with every release, so a saved copy is always correct.
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { c.put(req, res.clone()); trim(c); }
      return res;
    }));
  }
  // Everything else (API calls, images, data) goes straight to the network.
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "FLAME PH", {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/account" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || "/account", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
    const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
    return tab ? tab.navigate(url).then((t) => t && t.focus()) : self.clients.openWindow(url);
  }));
});
