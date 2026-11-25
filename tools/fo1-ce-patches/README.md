# Patche silnika F1 (fallout1-ce-web)

Baza: https://github.com/K1ngst0m/fallout1-ce-web @ `b5a6b7b` (fork `alexbatalov/fallout1-ce`, licencja **Sustainable Use License 1.0** — patrz `../../THIRD_PARTY_NOTICES.md`).
Zastosowanie: `git apply fallout1-ce-web-b5a6b7b.patch` w katalogu źródeł przed kompilacją przez Emscripten (`emsdk 4.0.4`).

Lista zmian w patchu:
- `movie_lib.cc`: `emscripten_sleep(1)` w pętli `_MVE_sndSync` (zapobiega zakleszczeniu na kursorze audio przesuwanym przez callback JS).
- `input.cc`: yield co 16 ms; gesty SDL finger wyłączone w przeglądarce (dotyk obsługuje most pointer).
- `dxinput.cc`: kolejka zdarzeń myszy z mostu JS (najechanie x3, wciśnięcie, zwolnienie; każde w osobnej klatce), wpisy starsze niż 1 s odrzucane; zdarzenia myszy SDL ignorowane.
- `mouse.cc`: pozycja kursora bezwzględna (bez mnożnika czułości).

Wynikowe artefakty `fallout-ce.{js,wasm,html}` znajdują się w `apps/web/public/engines/fo1-ce/`.
