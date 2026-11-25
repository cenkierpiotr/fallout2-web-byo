# Third-Party Notices

This project includes third-party components subject to their own license terms.

---

## 1. Fallout 1 Community Edition (WebAssembly Port)

- **Paths:**
  - `apps/web/public/engines/fo1-ce/fallout-ce.wasm`
  - `apps/web/public/engines/fo1-ce/fallout-ce.js`
  - `apps/web/public/engines/fo1-ce/fallout-ce.html`
  - `tools/fo1-ce-patches/fallout1-ce-web-b5a6b7b.patch`
- **Upstream:**
  - `alexbatalov/fallout1-ce` (Fallout 1 Community Edition)
  - `K1ngst0m/fallout1-ce-web` (`@ b5a6b7b`, Emscripten WebAssembly port)
- **Modifications applied in this repository:**
  Browser input and audio/video deadlock fixes documented in [`tools/fo1-ce-patches/README.md`](tools/fo1-ce-patches/README.md) (`movie_lib.cc`, `input.cc`, `dxinput.cc`, `mouse.cc`).
- **License:** **Sustainable Use License 1.0** (non-commercial / personal use only).
  Full license text is included in [`licenses/SUSTAINABLE-USE-LICENSE-1.0.txt`](licenses/SUSTAINABLE-USE-LICENSE-1.0.txt).

---

## 2. VT323 Font

- **Paths:**
  - `packages/ui/src/fonts/VT323-Regular.ttf`
  - `packages/ui/assets/fonts/VT323-Regular.ttf`
- **Copyright:** Copyright 2011, The VT323 Project Authors (`peter.hull@oikoi.com`)
- **License:** **SIL Open Font License, Version 1.1**
  Full license text is included in [`packages/ui/src/fonts/LICENSE`](packages/ui/src/fonts/LICENSE).

---

## 3. Original Game Files Not Included

This software operates strictly in **Bring Your Own Game (BYO)** mode. Original copyrighted game files (`MASTER.DAT`, `CRITTER.DAT`, `PATCH000.DAT`, mods, artwork, sound, video, scripts, and translations) must be provided by the user from their own legally obtained copy of Fallout or Fallout 2.
