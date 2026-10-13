// Leftover from the old flameph.org site: remove this worker and its caches, then reload open tabs onto the new site.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((tabs) => tabs.forEach((t) => t.navigate(t.url)))
  );
});
