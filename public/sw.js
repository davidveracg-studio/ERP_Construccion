// Service worker mínimo: guarda el shell de la app para abrirla sin señal en faena.
// Los datos viven en IndexedDB, así que la app completa funciona offline.
const CACHE = 'vpai-v3'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.png', './logo-vpai.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

// Red primero, caché de respaldo (los assets con hash también quedan cacheados al usarse)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copia))
        return r
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  )
})
