# Fallout 2 & Fallout 1 Web: user guide (BYO)

A **Bring Your Own Game (BYO)** browser edition combining a custom **Fallout 2** engine (TypeScript + WebGL2) with **Fallout 1 Community Edition** (WebAssembly). No game files are bundled — you supply your own legal copy locally in your browser.

## Requirements

- A browser with WebGL2 and WebAssembly support.
- Chrome and Edge (desktop and Android): folder selection via the File System Access API and persistent OPFS storage.
- Safari/iOS 15.4+ (16.4+ recommended): no `showDirectoryPicker`, select a folder via `webkitdirectory` or a `.zip` archive; files are copied into OPFS (needs roughly 0.6–2 GB of free space depending on mods).

## Preparing the game folder

- **Fallout 2:** requires `MASTER.DAT` and `CRITTER.DAT` (`PATCH000.DAT` recommended; optional `DATA/`, mods in `mods/` with `mods/mods_order.txt`, and HD packs in `assets-hd/`).
- **Fallout 1:** requires `MASTER.DAT` and `CRITTER.DAT` (optional overrides in `DATA/`).
- You can pick a folder, individual files or a `.zip` archive, or drag and drop them into the window.
- The app verifies the DAT2 format and recognizes known releases (GOG, Steam, CD).
- Game files are never uploaded anywhere.

## First launch

- Game selection screen (**Fallout 2** or **Fallout 1**).
- For Fallout 2: 4-step onboarding (folder, detected release, controls, skippable tutorial), then the folder picker and game menu.
- For Fallout 1: once the WASM engine is ready, click **Pick game folder**, then **Start game**.
- The app requests persistent browser storage (`storage.persist()`).

## iPhone and Safari

- Use the folder picker button or a `.zip` archive and wait for the copy to OPFS to finish.
- Safari may purge site data after roughly 7 days without a visit or in private browsing. Export saves regularly (`.f2save`).

## Controls

Mouse: LMB moves or interacts, RMB opens the radial menu (Talk, Look, Walk, Run, Cancel), middle button pans the camera, wheel zooms.

Keyboard: W/A/S/D and arrows pan the camera, `+`/`=` and `-` zoom, `0` resets zoom, PageUp/PageDown switches elevation, `R` / Shift toggles run, Esc pauses, `I` opens inventory, `F5` quick-saves.

Touch: tap to move, long press (350 ms) radial menu, double tap Look, one-finger drag pans the camera, pinch zooms, two-finger double tap resets zoom, three-finger tap pauses.

Combat: Attack / Aim / End turn bar, tap an enemy to attack. The Character button in the HUD opens the character sheet.

## Saves and backup

- Local player profiles (optional PIN is a local UI lock only), saves stored per profile in IndexedDB.
- Autosave every 5 minutes (3 rotating slots) plus automatic save on map change.
- Profile export and import: `.f2profile` (contains no game files).
- `.f2save` backup (JSON + gzip) in the Backup panel. Import modes: `merge` (newer save wins) or `replace`.
- Moving between PC and phone: export `.f2save` on PC and import it on your phone.

## Updates

- When hosted as a PWA, the app prompts when a new build is available.
- The new version activates only after you confirm. Save before reloading.
- Older save formats are migrated automatically.

## HD textures and mods

- Optional HD textures go in `assets-hd/` inside or next to the game folder. HD mode, HD tiles, 2.5D lighting, and postFx are enabled by default (switchable in Options: Original / Base / HD).
- Fallout 2 mods in `mods/` ordered by `mods/mods_order.txt` (such as Restoration Project Updated) layer cleanly over base `.dat` archives.
- Without mods or HD packs, the game runs directly on your original game assets.

## Troubleshooting

1. Folder not visible on iPhone: use the folder picker or a `.zip` archive and wait for copying to finish.
2. Out of space: free device storage, OPFS needs around 0.6–2 GB.
3. Black screen: ensure WebGL2 and hardware acceleration are enabled.
4. No sound on iOS: tap the screen; audio playback requires a user gesture.
5. A save will not load: open the Diagnostics tab, export the report, do not clear data.
6. Slow performance: disable postFx/lighting or lower the UI scale in Options.
7. Page does not update: close all open tabs of the app and reopen.
8. Data vanished: Safari may have purged storage; restore from `.f2save`.
9. No movies: MVE files are missing from your game folder.
10. The Diagnostics tab displays fps, VM errors, and telemetry store size, with Export (JSONL) and Clear buttons.

## Known limitations

- Certain advanced sfall DLL/hook mods (e.g., `fo2tweaks`) are not supported.
- Fallout 1 Community Edition (WASM) is subject to the **Sustainable Use License 1.0** (personal / non-commercial use only — see [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).
- Safari/iOS requires periodic `.f2save` backups.

## Privacy

- No telemetry is sent over the network, no accounts, and no external servers.
- Diagnostics telemetry is stored locally (IndexedDB, 10,000 events or 5 MB ring buffer), manual export only.
- Game files remain strictly on your device.
