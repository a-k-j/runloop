/* sw.js — cache-first offline support with forced refresh on new code.
   Mirrors the expense-tracker approach: bump CACHE_VERSION whenever any
   cached file changes, and clients.claim() + a message reload open tabs. */

const CACHE_VERSION = 'v3'
const CACHE_NAME = `runloop-${CACHE_VERSION}`

const STATIC_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './src/styles.css',
  './src/main.js',
  './src/db.js',
  './src/icons.js',
  './src/plan.js',
  './src/timer.js',
  './vendor/dexie.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
]

// Install: pre-cache everything, then activate immediately (no waiting tab).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        STATIC_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
      return results
    })
  )
  self.skipWaiting()
})

// Activate: drop old caches, take control, and tell open pages to reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const oldCaches = keys.filter((key) => key !== CACHE_NAME)
      await Promise.all(oldCaches.map((key) => caches.delete(key)))
      await self.clients.claim()
      if (oldCaches.length) {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        })
        clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION' }))
      }
    })()
  )
})

// Fetch: cache-first with network fallback, plus an offline navigation fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (!['http:', 'https:'].includes(url.protocol)) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaqueredirect') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html')
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
        })
    })
  )
})
