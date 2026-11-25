# Changelog

Format: sekcja na wersję `## <semver> - <data>`. `pnpm release <semver>` wymaga wpisu dla wydawanej wersji.

## 1.1.0 - 2026-11-25

- Wydanie **Bring Your Own Game (BYO)**: aplikacja działa w 100% lokalnie na plikach gry wskazanych przez użytkownika (bez żadnego serwera plików gry).
- **Fallout 2 (silnik TypeScript / WebGL2):** pełna pętla rozgrywki (kreator postaci `edtrcrte.frm`, mapa, dialogi, walka turowa, ekwipunek, handel, odpoczynek, Pip-Boy, zapis/odczyt, wideo MVE, audio ACM/LIP, obsługa UI w PL i EN).
- **Grafika HD i 2.5D domyślnie aktywna:** potok `hd` / `hdRgba` / `hdTiles` / `lighting` / `postFx` włączony od pierwszego uruchomienia (gdy w folderze gry lub obok znajdują się paczki `assets-hd/`), z możliwością przełączenia na grafikę klasyczną w Opcjach.
- **Obsługa modów VFS:** warstwowe ładowanie `PATCH000.DAT`, wpisów `ddraw.ini` oraz `mods/mods_order.txt` (m.in. Restoration Project Updated) ponad bazowymi archiwami DAT2.
- **Fallout 1 Community Edition (WASM):** wbudowany silnik Fallouta 1 w trybie BYO (licencja Sustainable Use License 1.0) z osobnym importem folderu gry i zapisem postępów w przeglądarce.
- **PWA, profile i kopie zapasowe:** lokalne profile graczy w IndexedDB, autozapisy, eksport/import `.f2save` i `.f2profile`, pełna obsługa myszy, klawiatury i ekranów dotykowych.
