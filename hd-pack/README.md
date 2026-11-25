# Paczka tekstur HD (`assets-hd/`) dla Fallout 2 Web BYO

Ten katalog zawiera opcjonalną paczkę tekstur HD (`hd-pack/assets-hd/`, ok. 295 MB: `manifest.json`, atlasy `base/` w xBRZ oraz atlasy `hd/`).

> **Uwaga:** Paczka **nie jest** wbudowana w paczkę produkcyjną aplikacji (`apps/web/dist/`). Kod silnika pozostaje na licencji MIT, natomiast wygenerowane atlasy są opcjonalnym dodatkiem wizualnym do użycia wyłącznie z własną, legalną kopią Fallouta 2.

## Jak wgrać tekstury HD (2 sposoby)

### Sposób 1: Automatycznie razem z folderem gry (zalecane)
1. Skopiuj cały folder `assets-hd` z `hd-pack/assets-hd/` do głównego katalogu swojej gry Fallout 2 (obok `MASTER.DAT` i `CRITTER.DAT`, albo do podkatalogu `DATA/assets-hd/`).
2. Uruchom aplikację i wskaż swój folder gry na ekranie **Pierwsze uruchomienie**.
3. Silnik automatycznie wykryje `assets-hd/manifest.json` i włączy tryb **HD**.

### Sposób 2: Ręcznie w Opcjach gry
1. Wczytaj grę w zwykły sposób.
2. Wejdź w **Ustawienia (Opcje) → Grafika → Grafika HD**.
3. Kliknij **Wybierz paczkę HD...** i wskaż katalog `hd-pack/assets-hd/`.
4. W polu *Źródło HD* powinno pojawić się potwierdzenie załadowania paczki. Zmiana działa po ponownym otwarciu mapy (lub rozpoczęciu nowej gry).

## Przełączanie trybów grafiki
W **Ustawieniach → Grafika** możesz w każdej chwili przełączać:
- **HD** — pełne tekstury HD z paczki `hd/` (z fallbackiem xBRZ/oryginał dla brakujących elementów)
- **Baza (xBRZ)** — wygładzone atlasy z `base/`
- **Oryginał** — klasyczna grafika wprost z plików gry
- **HD także dla kafli podłogi**, **Oświetlenie 2.5D** i **Post-processing** — niezależne przełączniki jakości.
