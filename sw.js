const CACHE_NAME = 'vma-pwa-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=6',
  './app.js?v=9',
  './manifest.json',
  './fonts/vachanamrut_icon.ttf',
  './fonts/Roboto-Medium.ttf',
  './fonts/ghela_regular.ttf',
  './img/vach_home.jpg',
  './img/ic_launcher.png',
  './data/languages.json',
  './data/sections.json',
  './data/subjects.json',
  './data/subject_verses.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    return;
  }
  const isShell = url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('/');
  if (isShell) {
    // Network-first for HTML/CSS/JS so updates appear immediately
    e.respondWith(
      fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
