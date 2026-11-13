const CACHE = "quran-quest-v17";
const ASSETS = ["./", "index.html", "css/style.css", "js/icons.js", "js/config.js", "js/data.js", "js/more-1.js", "js/more-2.js", "js/more-3.js", "js/more-4.js", "js/more-5.js", "js/more-6.js", "js/more-7.js", "js/more-8.js", "js/more-9.js", "js/more-10.js", "js/more-11.js", "js/more-12.js", "js/more-13.js", "js/more-14.js", "js/more-15.js", "js/more-16.js", "js/cite-mkh.js", "js/audit.js", "js/cite-wadii.js", "js/verified.js", "js/balance.js", "js/app.js", "manifest.webmanifest", "icons/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
