/* Musify service worker: offline app shell + network-first API cache.
   Audio (/stream/*) is deliberately NOT intercepted so Range requests reach the server. */
const VERSION = 'musify-v1';
const SHELL = ['/', '/static/style.css', '/static/app.js', '/static/icon.svg', '/static/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/stream/')) return;

  if (url.pathname.startsWith('/api/')) {              // data: network first, cached copy when offline
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(                                   // shell: cache first, refresh in the background
    caches.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit || caches.match('/'));
      return hit || refresh;
    }));
});
