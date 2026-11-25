# Instrukcja uruchomienia, hostingu, bezpieczeństwa i legalności (BYO)

> **English summary:** Detailed deployment, hosting, security, and legal guide for **Fallout 2 & Fallout 1 Web (BYO)**. The app is a 100% static client-side SPA/PWA — no backend, no server-side game files, no telemetry upload.

---

## 1. Uruchomienie lokalne (Local development)

### Wymagania wstępne
- **Node.js `>= 24`** (np. `node -v`)
- **pnpm `12.x`** (`corepack enable` lub `npm i -g pnpm@12`)
- Nowoczesna przeglądarka z obsługą **WebGL2** i **WebAssembly** (Chrome, Edge, Firefox, Safari 16.4+)

### Krok po kroku

```sh
git clone https://github.com/cenkierpiotr/fallout2-web-byo.git
cd fallout2-web-byo
pnpm install
pnpm dev
```

Po uruchomieniu otwórz w przeglądarce adres `http://localhost:5173`.

### Przydatne komendy

| Komenda | Działanie |
|---|---|
| `pnpm dev` | Serwer deweloperski Vite (`localhost:5173`) |
| `pnpm dev -- --host` | Udostępnienie w sieci lokalnej LAN (uwaga: poza `localhost` OPFS/PWA wymagają HTTPS) |
| `pnpm check` | Linter (`eslint`), sprawdzanie typów (`tsc`) oraz testy jednostkowe (`vitest`) |
| `pnpm --filter @f2/web build` | Budowanie statycznej paczki produkcyjnej do `apps/web/dist/` |
| `pnpm --filter @f2/web preview` | Lokalny podgląd zbudowanej wersji produkcyjnej |
| `node scripts/guard-no-game-files.mjs --dist apps/web/dist` | Weryfikacja, że paczka wynikowa nie zawiera żadnych plików gier |

---

## 2. Hosting statyczny (Produkcja)

Aplikacja jest w 100% statycznym SPA + PWA (`apps/web/dist/`). Nie wymaga bazy danych ani backendu — wszystkie pliki gry wskazuje użytkownik lokalnie w swojej przeglądarce.

### Wymagania obowiązkowe dla hostingu

1. **HTTPS (poza `http://localhost`):**
   Przeglądarki blokują **OPFS (Origin Private File System)**, **File System Access API** oraz **Service Workery (PWA)** na zwykłym HTTP.
2. **Nagłówki izolacji pochodzenia (COOP / COEP) dla Fallouta 1 (WASM):**
   Silnik **Fallout 1 Community Edition** może korzystać z wielowątkowości WebAssembly (`SharedArrayBuffer`), dlatego serwer powinien zwracać:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`
3. **Brak agresywnego cache'owania dla plików sterujących PWA:**
   `index.html`, `sw.js`, `manifest.webmanifest` oraz `version.json` muszą mieć `Cache-Control: no-cache` / `no-store`, natomiast `/assets/*` (z hashem w nazwie) można cache'ować na rok (`immutable`).
4. **Poprawny typ MIME dla `.wasm`:** `application/wasm`.

### Przykład 1: Nginx

W repozytorium znajduje się gotowy szkielet [`deploy/nginx.conf`](../deploy/nginx.conf). Poniżej rozszerzona konfiguracja z TLS (HTTPS), COOP/COEP oraz nagłówkami bezpieczeństwa:

```nginx
server {
    listen 443 ssl http2;
    server_name twoja-domena.example;

    ssl_certificate     /etc/letsencrypt/live/twoja-domena.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/twoja-domena.example/privkey.pem;

    server_tokens off;
    root /var/www/fallout2-web-byo/dist;
    index index.html;

    # Izolacja pochodzenia (SharedArrayBuffer / WASM) i podstawowe nagłówki bezpieczeństwa
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json application/wasm;

    location = /index.html          { add_header Cache-Control "no-cache" always; }
    location = /sw.js               { add_header Cache-Control "no-cache" always; }
    location = /version.json        { add_header Cache-Control "no-store" always; }
    location = /manifest.webmanifest { add_header Cache-Control "no-cache" always; }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }
}
```

### Przykład 2: Caddy (automatyczny HTTPS Let's Encrypt)

```caddyfile
twoja-domena.example {
    root * /var/www/fallout2-web-byo/dist
    encode zstd gzip

    header {
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
        -Server
    }

    @nocache path /index.html /sw.js /version.json /manifest.webmanifest
    header @nocache Cache-Control "no-store"

    @immutable path /assets/*
    header @immutable Cache-Control "public, max-age=31536000, immutable"

    try_files {path} /index.html
    file_server
}
```

### Platformy bez własnego VPS (GitHub Pages / Cloudflare Pages / Netlify)

- **Cloudflare Pages / Netlify:** wgraj `apps/web/dist` (lub ustaw build command `pnpm --filter @f2/web build` i output `apps/web/dist`) oraz dodaj plik `_headers` z nagłówkami COOP/COEP, CSP i `no-store` dla `sw.js` / `version.json`.
- **GitHub Pages:** zapewnia darmowy HTTPS, ale nie pozwala ustawiać niestandardowych nagłówków HTTP (`COOP`/`COEP`) — Fallout 2 działa w pełni, natomiast Fallout 1 CE WASM może wymagać trybu jednowątkowego bez `SharedArrayBuffer`.

---

## 3. Bezpieczeństwo i prywatność

1. **Zero przesyłania plików i danych użytkownika:**
   - Wskazane przez gracza pliki `.dat`, `.frm`, zapisy gry i profile **nigdy nie opuszczają przeglądarki**.
   - Przechowywanie odbywa się wyłącznie lokalnie w **OPFS** (Origin Private File System) oraz **IndexedDB**.
2. **Brak kont, trackerów i telemetrii sieciowej:**
   - Aplikacja nie wykonuje żadnych żądań do zewnętrznych serwerów analitycznych.
   - Bufor diagnostyczny (maks. 10 000 zdarzeń / 5 MB w IndexedDB) służy wyłącznie użytkownikowi w zakładce **Diagnostyka** (ręczny eksport `.jsonl` lub wyczyszczenie).
3. **Content Security Policy (CSP):**
   - W `script-src` wymagane jest `'wasm-unsafe-eval'` wyłącznie w celu uruchomienia modułu WebAssembly (`fallout-ce.wasm`) dla Fallouta 1 oraz dekoderów.
   - `img-src 'self' blob: data:`, `connect-src 'self' blob:`, `worker-src 'self' blob:` — aplikacja tworzy lokalne adresy `blob:` dla dekodowanych zasobów graficznych i audio.
   - Brak `'unsafe-eval'` dla zwykłego JavaScriptu i brak połączeń zewnętrznych (`connect-src` ograniczone do `'self' blob:`).
4. **Lokalny PIN profilu:**
   - Opcjonalny PIN w ekranie wyboru profilu to wyłącznie lokalna blokada interfejsu (nie szyfruje danych w IndexedDB i nie chroni przed osobą mającą bezpośredni dostęp do DevTools / systemu plików urządzenia).

---

## 4. Legalność i model BYO (Bring Your Own Game)

### Co zawiera repozytorium (i co wolno udostępniać)
- **Kod silnika Fallout 2 (TypeScript / WebGL2) oraz UI:** licencja **[MIT](../LICENSE)** — wolno kopiować, modyfikować i hostować.
- **Fallout 1 Community Edition (WASM):** pliki w `apps/web/public/engines/fo1-ce/` oraz `tools/fo1-ce-patches/` podlegają licencji **[Sustainable Use License 1.0](../licenses/SUSTAINABLE-USE-LICENSE-1.0.txt)** — **wyłącznie do użytku osobistego i niekomercyjnego** (nie wolno sprzedawać dostępu ani wykorzystywać komercyjnie).
- **Font VT323:** licencja **SIL Open Font License 1.1** (szczegóły w [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)).

### Czego repozytorium NIE zawiera (i czego NIE wolno hostować)
- **Oryginalnych plików gry Fallout / Fallout 2:** `MASTER.DAT`, `CRITTER.DAT`, `PATCH000.DAT`, `.frm`, `.acm`, `.mve`, `.pro`, `.map`, `.int`, `.msg`, `.exe` — są one własnością Bethesda Softworks LLC / ZeniMax Media Inc.
- **Strażnik repozytorium:** skrypt `scripts/guard-no-game-files.mjs` automatycznie sprawdza drzewo repozytorium oraz zbudowany katalog `apps/web/dist` i blokuje wszelkie przypadkowe pliki gier.
- **Zasada hostingu publicznego:** jeśli hostujesz tę aplikację publicznie, **nigdy nie umieszczaj na serwerze plików gier ani cudzych paczek `.dat`** — każdy użytkownik musi wskazać własną legalną kopię (np. z GOG, Steam lub płyty CD) lokalnie ze swojego dysku.

---

## 5. Tekstury HD (`assets-hd/`) i mody (`mods/`)

### Czy tekstury HD działają w wersji BYO?
**Tak.** Cały mechanizm ładowania tekstur HD, kafelków HD, oświetlenia 2.5D oraz post-processingu (`postFx`) jest w pełni zachowany w kodzie silnika i domyślnie włączony w ustawieniach.

- Gotowa, opcjonalna paczka tekstur HD (`manifest.json` + `base/` + `hd/`, ok. 295 MB) znajduje się w repozytorium **obok aplikacji** w katalogu [`hd-pack/assets-hd/`](../hd-pack/assets-hd/) (szczegóły w [`hd-pack/README.md`](../hd-pack/README.md)). Nie trafia ona do paczki wynikowej `apps/web/dist/`.
- **Jak ją wgrać:**
  1. **Automatycznie:** skopiuj folder `hd-pack/assets-hd/` do swojego folderu gry (np. `Fallout 2/assets-hd/` lub `Fallout 2/DATA/assets-hd/`) — silnik wykryje go podczas indeksowania.
  2. **Ręcznie w grze:** wejdź w **Ustawienia → Grafika → Grafika HD → Wybierz paczkę HD...** i wskaż `hd-pack/assets-hd/`.
- W **Opcjach** możesz w każdej chwili przełączać tryb grafiki: **`Oryginał`** / **`Baza (xBRZ)`** / **`HD`**, a także włączać/wyłączać kafelki HD, oświetlenie 2.5D i `postFx`.

### Mody Fallouta 2
- Skopiuj pliki modów `.dat` do podkatalogu `mods/` w folderze gry oraz dodaj `mods/mods_order.txt` (np. `rpu.dat`, `npc_armor.dat`, `rpu_polish.dat`).
- Mody ładowane są warstwowo przez wirtualny system plików (VFS) ponad `MASTER.DAT` / `CRITTER.DAT` / `PATCH000.DAT`.
