// Service worker mínimo: solo para que la PWA sea instalable y siga funcionando sin conexión.
// Nunca toca /api, para no servir datos de sesión o de trabajos desde una caché vieja.
//
// DEF-11/DEF-12 (equipo, 2026-11-18): esta era "cache-first" (devolvía lo cacheado de inmediato y
// solo recurría a la red si no había nada en caché), así que, una vez que un archivo estático
// quedaba en caché, el navegador podía seguir usando una versión vieja del JavaScript para
// siempre, aunque el servidor ya tuviera el código nuevo (justo lo que pasó con el formulario de
// enviar propuesta). Ahora es "network-first": siempre intenta la red primero, y solo usa la
// caché si de verdad no hay conexión. Así nunca se sirve algo viejo mientras haya internet.
const CACHE = 'sst-kotoduo-v2';

// Toma el control de inmediato (no espera a que se cierren las pestañas abiertas con la versión
// vieja): así quien ya tenía el service worker viejo se recupera sin tener que cerrar el navegador.
self.addEventListener('install', () => { self.skipWaiting(); });

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
      try {
        const respuesta = await fetch(evento.request);
        await cache.put(evento.request, respuesta.clone());
        return respuesta;
      } catch {
        const enCache = await cache.match(evento.request);
        if (enCache) return enCache;
        throw new Error('Sin conexión y sin copia guardada de este archivo.');
      }
    }),
  );
});
