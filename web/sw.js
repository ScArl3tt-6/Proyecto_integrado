// Service worker mínimo: solo para que la PWA sea instalable. Cachea en tiempo de ejecución los
// archivos estáticos ya visitados (GET, mismo origen) y nunca toca /api, para no servir datos
// de sesión o de trabajos desde una caché vieja.
const CACHE = 'sst-kotoduo-v1';

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const enCache = await cache.match(evento.request);
      const enRed = fetch(evento.request)
        .then((respuesta) => { cache.put(evento.request, respuesta.clone()); return respuesta; })
        .catch(() => enCache);
      return enCache || enRed;
    }),
  );
});
