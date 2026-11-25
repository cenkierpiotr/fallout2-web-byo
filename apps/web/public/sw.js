/* Service worker: cache powloki aplikacji (bez plikow gry, te siedza w OPFS/IndexedDB). */
// Podmieniane przy buildzie (pwa-precache-plugin): lista plikow powloki i wersja z ich zawartosci. W dev zostaje null.
const PRECACHE = null; /*__PRECACHE__*/
const VERSION = PRECACHE ? `f2-shell-${PRECACHE.version}` : 'f2-shell-dev';

self.addEventListener('install', (e) => {
  // Nowa wersja czeka na zgode uzytkownika (komunikat SKIP_WAITING), zeby nie przeladowac gry w trakcie rozgrywki.
  // Pelna powloka trafia do cache od razu, wiec dzialanie offline nie wymaga wczesniejszego odwiedzenia kazdej czesci.
  if (PRECACHE) e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE.urls)));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Sciezki, ktore nigdy nie trafiaja do cache (dane gry i paczki uzytkownika): obrona w glebi,
// bo normalnie gra czyta je z OPFS/File API, a nie przez fetch.
const NEVER_CACHE =
  /\.(dat|frm|acm|lst|msg|int|pro|map|gam|sav|f2save|mve|zip)$|\/(game|data|assets-hd)\//i;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Zadania Range (audio/wideo) i niestandardowe cache nie wspolpracuja z cache.put (206).
  if (req.headers.has('range') || req.cache === 'only-if-cached') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || NEVER_CACHE.test(url.pathname)) return;
  // Dev (brak listy precache): service worker nie wtraca sie w zadania.
  if (!PRECACHE) return;
  // Nawigacje: siec najpierw, cache jako tryb offline (powloka './').
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            void caches
              .open(VERSION)
              .then((c) => c.put('./', copy))
              .catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }
  // Zasoby powloki: wylacznie z listy precache (cache najpierw). Reszta idzie wprost do sieci.
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (!PRECACHE.urls.includes(rel)) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
