# Fallout 2 & Fallout 1 Web: instrukcja użytkownika (BYO)

Aplikacja działająca w modelu **Bring Your Own Game (BYO)**: silnik **Fallout 2** (TypeScript + WebGL2) oraz osadzony **Fallout 1 Community Edition** (WebAssembly). Żadne pliki gry nie są dołączane — własną kopię wskazujesz lokalnie w przeglądarce.

## Wymagania

- Przeglądarka z obsługą WebGL2 i WebAssembly.
- Chrome i Edge (komputer i Android): wybór folderu przez File System Access API oraz trwały zapis w OPFS.
- Safari/iOS 15.4+ (zalecane 16.4+): brak `showDirectoryPicker`, folder wybierasz przez `webkitdirectory` lub archiwum `.zip`, a pliki są kopiowane do OPFS (wymaga kilku GB wolnego miejsca).

## Przygotowanie folderu gry

- **Fallout 2:** wymagane `MASTER.DAT` i `CRITTER.DAT` (zalecane `PATCH000.DAT`, opcjonalnie katalog `DATA/`, mody w `mods/` z `mods/mods_order.txt` oraz paczki HD w `assets-hd/`).
- **Fallout 1:** wymagane `MASTER.DAT` i `CRITTER.DAT` (opcjonalnie nadpisania w `DATA/`).
- Możesz wskazać folder, pojedyncze pliki albo archiwum `.zip`, także metodą przeciągnij i upuść.
- Aplikacja weryfikuje format DAT2 i rozpoznaje znane wydania (GOG, Steam, CD).
- Pliki gry nigdy nie są nigdzie wysyłane.

## Pierwsze uruchomienie

- Ekran wyboru gry (**Fallout 2** albo **Fallout 1**).
- Dla Fallouta 2: onboarding w 4 krokach (folder, wykryte wydanie, sterowanie, samouczek — można pominąć), następnie ekran wyboru folderu i menu gry.
- Dla Fallouta 1: po załadowaniu silnika WASM kliknij **Wskaż folder gry**, a następnie **Uruchom grę**.
- Aplikacja prosi przeglądarkę o trwałość magazynu (`storage.persist()`).

## iPhone i Safari

- Wybierz folder przyciskiem wyboru folderu lub archiwum `.zip` i poczekaj na zakończenie kopiowania do OPFS.
- Safari może wyczyścić dane po około 7 dniach bez wizyty oraz w trybie prywatnym. Eksportuj zapisy regularnie (`.f2save`).

## Sterowanie

Mysz: LPM ruch lub rozmowa, PPM menu radialne (Rozmawiaj, Patrz, Idź, Biegnij, Anuluj), środkowy przycisk przesuwa kamerę, kółko zoom.

Klawiatura: W/A/S/D i strzałki kamera, `+`/`=` i `-` zoom, `0` reset zoomu, PageUp/PageDown piętro, `R` bieg, Shift modyfikator biegu, Esc pauza, `I` ekwipunek, `F5` szybki zapis.

Dotyk: tap ruch, długie przytrzymanie (350 ms) menu radialne, podwójny tap Patrz, przeciągnięcie jednym palcem przesuwa kamerę, pinch zoom, podwójny tap dwoma palcami reset zoomu, tap trzema palcami pauza.

Walka: pasek Atak / Celuj / Koniec tury, tap na wroga to atak. Przycisk Postać w HUD otwiera kartę postaci.

## Zapisy i kopia zapasowa

- Lokalne profile graczy (opcjonalny PIN to tylko lokalna blokada UI), zapisy per profil w IndexedDB.
- Autozapis co 5 minut (3 rotacyjne sloty) oraz zapis przy zmianie mapy.
- Eksport i import profilu: `.f2profile` (bez plików gry).
- Kopia zapasowa `.f2save` (JSON + gzip) w panelu Kopia. Import: `merge` (nowszy zapis wygrywa) albo `replace`.
- Przenoszenie z komputera na telefon: wyeksportuj `.f2save` na komputerze i zaimportuj na telefonie.

## Aktualizacje

- W przypadku wdrożenia jako PWA aplikacja informuje o nowej wersji.
- Nowa wersja jest aktywowana dopiero po Twojej zgodzie. Zapisz grę przed odświeżeniem.
- Zapisy ze starszych wersji są migrowane automatycznie.

## Tekstury HD i mody

- Opcjonalne tekstury HD w folderze `assets-hd/` (w folderze gry lub obok niego). Domyślnie aktywny jest tryb HD / kafelki HD / oświetlenie 2.5D / postFx (można zmienić w Opcjach: Oryginał / Baza / HD).
- Mody Fallouta 2 w podkatalogu `mods/` wraz z `mods/mods_order.txt` (np. Restoration Project Updated) ładują się warstwowo ponad bazowymi plikami `.dat`.
- Bez modów i paczek HD gra działa w pełni na oryginalnych zasobach.

## Rozwiązywanie problemow

1. Folder nie jest widoczny na iPhonie: użyj wyboru folderu lub archiwum `.zip` i poczekaj na koniec kopiowania.
2. Brak miejsca: zwolnij miejsce na urządzeniu, OPFS potrzebuje ok. 0,6–2 GB.
3. Czarny ekran: sprawdź, czy WebGL2 jest włączone.
4. Brak dźwięku na iOS: dotknij ekranu, audio wymaga gestu użytkownika.
5. Zapis się nie wczytuje: otwórz zakładkę Diagnostyka, wyeksportuj raport, nie kasuj danych.
6. Gra działa wolno: wyłącz postFx/oświetlenie lub zmniejsz skalę UI w Opcjach.
7. Strona się nie aktualizuje: zamknij wszystkie karty i otwórz ponownie.
8. Dane znikły: w Safari mogły zostać wyczyszczone, przywróć z `.f2save`.
9. Brak filmów: w folderze gry brakuje plików MVE.
10. Zakładka Diagnostyka pokazuje fps, błędy VM i rozmiar magazynu telemetrii; przyciski Eksportuj (JSONL) i Wyczyść.

## Znane ograniczenia

- Część zaawansowanych opkodów sfall (np. natywne skrypty `fo2tweaks`) nie jest obsługiwana.
- Fallout 1 Community Edition (WASM) jest objęty licencją **Sustainable Use License 1.0** (wyłącznie użytek osobisty / niekomercyjny — szczegóły w [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).
- Safari/iOS wymaga okresowego eksportu zapisów `.f2save`.

## Prywatnosc

- Brak telemetrii wysyłanej do sieci, brak kont i zewnętrznych serwerów.
- Telemetria jest lokalna (IndexedDB, bufor 10 000 zdarzeń lub 5 MB), eksport tylko ręcznie.
- Pliki gry zostają wyłącznie na Twoim urządzeniu.
