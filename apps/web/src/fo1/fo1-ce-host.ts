/**
 * Host silnika Fallout 1 Community Edition (WASM/Emscripten) w our web app.
 *
 * Binarny port z forka K1ngst0m/fallout1-ce-web (target Emscripten; licencja Sustainable
 * Use License 1.0 dziedziczona z fallout1-ce, patrz THIRD_PARTY_NOTICES.md). Dane gry zostaja u gracza
 * (BYO): import folderu zapisuje pliki w MEMFS, uchwyt folderu w IndexedDB (auto-reimport
 * po odswiezeniu, Chromium), save'e silnika w IDBFS pod /SAVEGAME (przezywaja reload).
 *
 * Konwencje modulu zgodne z wygenerowanym shell (src/shell.html forka):
 * window.Module przed ladowaniem, noInitialRun=true, start przez callMain(),
 * mouse bridge na _fallout_push_mouse_* (fork eksportuje), canvas id="canvas".
 */

const ENGINE_BASE = './engines/fo1-ce/';

export type Fo1Phase = 'idle' | 'loading' | 'ready' | 'error' | 'started';

export interface Fo1Status {
  phase: Fo1Phase;
  detail?: string;
}

export interface Fo1ImportProgress {
  done: number;
  total: number;
  name: string;
}

// Minimalne typy FS z Emscripten (uzywane fragmenty).
interface EmsFS {
  mkdir(p: string): void;
  mount(type: 'IDBFS', opts: { dbName?: string }, at: string): void;
  writeFile(p: string, data: Uint8Array | string): void;
  syncfs(populate: boolean, cb: (err: number | undefined) => void): void;
  analyzePath(p: string): { exists: boolean };
  readdir(p: string): string[];
  stat(p: string): { mode: number; size: number };
}

interface Fo1Module {
  canvas: HTMLCanvasElement;
  noInitialRun: boolean;
  callMain(): void;
  FS: EmsFS;
  onRuntimeInitialized?: () => void;
  onAbort?: (why?: unknown) => void;
  print?: (s: string) => void;
  printErr?: (s: string) => void;
  _fallout_get_mouse_bounds_width?: () => number;
  _fallout_get_mouse_bounds_height?: () => number;
  _fallout_get_mouse_x?: () => number;
  _fallout_get_mouse_y?: () => number;
  _fallout_push_mouse_move?: (x: number, y: number) => void;
  _fallout_push_mouse_move_relative?: (dx: number, dy: number) => void;
  _fallout_push_mouse_button?: (x: number, y: number, button: number, down: number) => void;
}

interface StoredDirHandle {
  kind: 'directory';
  name: string;
}

/** Mini-opis uchwytu katalogu (File System Access API lub nasz fallback z <input>). */
interface DirEntries extends StoredDirHandle {
  entries(): AsyncIterable<{ kind: string; name: string; getFile?(): Promise<File> }>;
}

const HANDLE_STORE = 'f2-fo1';
const HANDLE_KEY = 'data-dir';

/** Opcjonalny katalog OPFS na dane Fallout 1; odrebny od fallout2-game. */
export const FO1_OPFS_DIR = 'fallout1-game';

const FALLOUT_CFG = [
  '[system]',
  'master_dat=master.dat',
  'master_patches=data',
  'critter_dat=critter.dat',
  'critter_patches=data',
  'language=english',
  'hashing=1',
  'splash=0',
  'art_cache_size=8',
  'color_cycling=1',
  'cycle_speed_factor=1',
  'interrupt_walk=1',
  'scroll_lock=0',
  'free_space=0',
  'executable=game',
  'times_run=0',
  '',
  '[sound]',
  'initialize=1',
  'music=1',
  'sounds=1',
  'speech=1',
  'master_volume=22281',
  'music_volume=22281',
  'sndfx_volume=22281',
  'speech_volume=22281',
  'cache_size=448',
  'music_path1=data/sound/music/',
  'music_path2=data/sound/music/',
  '',
  '[preferences]',
  'game_difficulty=1',
  'combat_difficulty=1',
  'violence_level=3',
  'target_highlight=1',
  'item_highlight=1',
  'combat_messages=1',
  'combat_taunts=1',
  'running=1',
  'subtitles=1',
  'combat_speed=50',
  'player_speed=0',
  'brightness=1.000000',
  'mouse_sensitivity=1.000000',
  '',
  '[debug]',
  'mode=environment',
  '',
].join('\n');

/** @see src/shell.html forka: f1_res.ini w wersji przegladarkowej. */
const F1_RES_INI = ['[MAIN]', 'SCR_WIDTH=640', 'SCR_HEIGHT=480', 'WINDOWED=1', ''].join('\n');

function mapStatus(detail?: string): Fo1Status {
  return detail === undefined ? { phase: 'loading' } : { phase: 'loading', detail };
}

export class Fo1CeHost {
  status: Fo1Status = { phase: 'idle' };
  onStatus: ((s: Fo1Status) => void) | null = null;
  onImportProgress: ((p: Fo1ImportProgress) => void) | null = null;

  private mod: Fo1Module | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private started = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private bridgeInstalled = false;

  private setStatus(s: Fo1Status): void {
    this.status = s;
    this.onStatus?.(s);
  }

  private get fs(): EmsFS {
    if (!this.mod) throw new Error('fo1: modul niegotowy');
    return this.mod.FS;
  }

  /** Zaladowanie silnika z podpietym canvasem; id canvas = "canvas" (SDL offshore portuj tak szuka). */
  async mount(canvas: HTMLCanvasElement): Promise<void> {
    if (this.mod) return;
    this.canvas = canvas;
    this.installSdlEventShield(canvas);
    this.setStatus(mapStatus('laduje'));
    await new Promise<void>((resolve, reject) => {
      const win = window as unknown as { Module?: Fo1Module };
      const mod: Fo1Module = {
        canvas,
        noInitialRun: true,
        FS: undefined as unknown as EmsFS,
        callMain(): void {
          /* dopisze runtime */
        },
        print: (s: string): void => console.log(`[fo1] ${s}`),
        printErr: (s: string): void => console.warn(`[fo1] ${s}`),
        onAbort: (why?: unknown): void => {
          this.setStatus({ phase: 'error', detail: String(why ?? 'abort') });
        },
        onRuntimeInitialized: (): void => {
          try {
            this.mountPersistence();
            this.setStatus({ phase: 'ready' });
            resolve();
          } catch (e) {
            this.setStatus({ phase: 'error', detail: String(e) });
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        },
      };
      win.Module = mod;
      this.mod = mod;
      const script = document.createElement('script');
      script.src = `${ENGINE_BASE}fallout-ce.js`;
      script.async = true;
      script.onerror = (): void => {
        this.setStatus({ phase: 'error', detail: 'fallout-ce.js load failed' });
        reject(new Error('fo1: nie udalo sie zaladowac fallout-ce.js'));
      };
      document.head.appendChild(script);
    });
    // Pytanie o pozwolenie na audio dopiero po starcie (dalej: start()).
  }

  /** Odcina wlasne handlery SDL3/Emscripten, ktore psuly obraz i dotyk:
   *  - resize/fullscreenchange: SDL przyjmowal rozmiar CSS canvasu (np. 1440x1080) jako rozmiar
   *    okna przy buforze 640x480 -> obraz powiekszony i uciety w pelnym ekranie / po obrocie.
   *    Skalowanie robi wylacznie CSS, silnik zostaje na stalym 640x480.
   *  - touch*: gesty dotykowe CE (touch.cc, kursor wzgledny) dublowaly i psuly tapniecia;
   *    dotyk obsluguje wylacznie most pointer (installMouseBridge).
   *  Listener capture na window/rodzicu odpala sie przed handlerami SDL (canvas/document/window).
   *  Zmiana pelnego ekranu jest przekazywana dalej jako 'fo1-fullscreenchange' dla UI. */
  private installSdlEventShield(canvas: HTMLCanvasElement): void {
    // SDL wlacza pointer lock po kliknieciu: clientX/Y zamarzaja (most liczy pozycje bezwzgledna,
    // kursor gry stoi), a wszystkie klikniecia trafiaja w canvas (przyciski strony martwe).
    canvas.requestPointerLock = (() => Promise.resolve()) as typeof canvas.requestPointerLock;
    const stopResize = (e: Event): void => {
      e.stopImmediatePropagation();
    };
    window.addEventListener('resize', stopResize, true);
    window.addEventListener('orientationchange', stopResize, true);
    const stopFs = (e: Event): void => {
      e.stopImmediatePropagation();
      window.dispatchEvent(new Event('fo1-fullscreenchange'));
    };
    window.addEventListener('fullscreenchange', stopFs, true);
    window.addEventListener('webkitfullscreenchange', stopFs, true);
    const host = canvas.parentElement ?? document.body;
    const stopTouch = (e: Event): void => {
      if (e.target === canvas) e.stopPropagation();
    };
    for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
      host.addEventListener(t, stopTouch, { capture: true, passive: true });
    // Mysz SDL liczy pozycje z wlasnego (zablokowanego) rozmiaru okna -> kursor w zlym miejscu
    // po pelnym ekranie. Pozycje i przyciski podaje wylacznie most pointer.
    for (const t of ['mousedown', 'mouseup', 'mousemove'])
      host.addEventListener(t, stopTouch, { capture: true });
  }

  /** Save'e w IDBFS; populate=true przy pierwszym montowania (przezywaja odswiezenie). */
  private mountPersistence(): void {
    const fs = this.fs;
    if (!fs.analyzePath('/SAVEGAME').exists) fs.mkdir('/SAVEGAME');
    try {
      fs.mount('IDBFS', { dbName: 'f2-fo1-saves' }, '/SAVEGAME');
    } catch (e) {
      console.warn('[fo1] IDBFS mount zawiodl, save bez persist:', e);
      return;
    }
    // populate: przywróć save'y z poprzedniej sesji (przed pierwszym callMain).
    this.fs.syncfs(true, () => undefined);
  }

  /** Cykliczne zrzucanie MEMFS->IndexedDB (po starcie gry). */
  private startSyncLoop(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => void this.syncSaves(), 20_000);
  }

  syncSaves(): Promise<void> {
    return new Promise((resolve) => {
      this.mod?.FS.syncfs(false, () => resolve());
    });
  }

  private ensureParent(path: string): void {
    let acc = '';
    for (const part of path.split('/').filter(Boolean)) {
      acc += `/${part}`;
      if (!this.fs.analyzePath(acc).exists) this.fs.mkdir(acc);
    }
  }

  /** Import instalacji F1 (fold z danymi, lowercase sciezki jak w shellu forka). */
  async importFiles(
    entries: Array<{ path: string; read(): Promise<Uint8Array> }>,
  ): Promise<number> {
    const total = entries.length;
    let done = 0;
    for (const e of entries) {
      const p = `/${e.path.replace(/^\/+/, '').toLowerCase()}`;
      const parent = p.slice(0, p.lastIndexOf('/'));
      if (parent) this.ensureParent(parent);
      try {
        this.fs.writeFile(p, await e.read());
      } catch (err) {
        console.warn(`[fo1] pominieto ${p}: ${String(err)}`);
      }
      done++;
      if (done % 25 === 0 || done === total)
        this.onImportProgress?.({ done, total, name: p.slice(p.lastIndexOf('/') + 1) });
    }
    if (!this.fs.analyzePath('/master.dat').exists)
      throw new Error('fo1: master.dat nie znaleziony w folderze');
    return done;
  }

  /** Czy dane gry F1 (master.dat) sa juz w FS silnika w tej sesji. */
  hasGameData(): boolean {
    try {
      return this.mod !== null && this.fs.analyzePath('/master.dat').exists;
    } catch {
      return false;
    }
  }

  /** Import danych gry z folderu OPFS (np. kopia pobrana z serwera) do FS silnika. */
  async importPicked(folder: { files: Iterable<[string, File]> }): Promise<number> {
    const entries = [...folder.files].map(([path, file]) => ({
      path,
      read: async (): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer()),
    }));
    return this.importFiles(entries);
  }

  async pickAndImport(): Promise<number> {
    const dirs = await this.pickDirectory();
    await this.storeHandle(dirs.handle);
    return this.importFromHandle(dirs.handle, dirs.root);
  }

  private async importFromHandle(h: DirEntries, dropRoot = true): Promise<number> {
    const list: Array<{ path: string; read(): Promise<Uint8Array> }> = [];
    const walk = async (d: DirEntries, prefix: string): Promise<void> => {
      for await (const e of d.entries()) {
        if (e.kind === 'file' && e.getFile) {
          const f = await e.getFile();
          list.push({
            path: `${prefix}${e.name}`,
            read: async () => new Uint8Array(await f.arrayBuffer()),
          });
        } else if (e.kind === 'directory') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await walk(e as any, `${prefix}${e.name}/`);
        }
      }
    };
    await walk(h, '');
    // Gdy user wskazal folder instalacji z jednym dzieckiem-glowa (np "Fallout1"): zdejmij pierwsz poziom.
    let entries0 = list;
    if (dropRoot) {
      const first = list.map((x) => x.path.split('/')[0]);
      if (new Set(first).size === 1 && first[0]) {
        const rootLen = first[0].length + 1;
        entries0 = list.map((x) => ({ path: x.path.slice(rootLen), read: x.read }));
      }
    }
    return this.importFiles(entries0);
  }

  /** Chromium: showDirectoryPicker z persist jezu; inaczej: webkitdirectory input. */
  private async pickDirectory(): Promise<{
    handle: StoredDirHandle & {
      entries(): AsyncIterable<{ kind: string; name: string; getFile?(): Promise<File> }>;
    };
    root: boolean;
  }> {
    const w = window as unknown as {
      showDirectoryPicker?: (o: { mode: string }) => Promise<unknown>;
    };
    if (typeof w.showDirectoryPicker === 'function') {
      const h = (await w.showDirectoryPicker({ mode: 'read' })) as DirEntries;
      return { handle: h, root: false };
    }
    // Fallback (Safari/Firefox): <input webkitdirectory>.
    const files = await new Promise<FileList>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', '');
      input.onchange = (): void => resolve(input.files as FileList);
      input.onerror = (): void => reject(new Error('wybor anulowany'));
      input.click();
    });
    const fakeHandle = {
      name: 'input',
      kind: 'directory',
      async *entries(): AsyncIterable<{ kind: string; name: string; getFile?(): Promise<File> }> {
        for (const f of Array.from(files)) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
          const parts = rel.split('/');
          yield { kind: 'file', name: parts.slice(1).join('/'), getFile: () => Promise.resolve(f) };
        }
      },
    };
    return { handle: fakeHandle as DirEntries, root: true };
  }

  private async storeHandle(h: StoredDirHandle): Promise<void> {
    if (h.name === 'input') return; // fallback bez persist
    try {
      const db = await openHandleStore();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        // Structured clone przechowuje FileSystemDirectoryHandle.
        tx.objectStore('handles').put(h, HANDLE_KEY);
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error);
      });
      db.close();
    } catch {
      /* brak persist nie blokuje gry */
    }
  }

  /** Po odswiezeniu: automatyczny ponowny import, jesli user早 perm granting this folder. */
  async tryAutoImport(): Promise<boolean> {
    try {
      const db = await openHandleStore();
      const h = await new Promise<StoredDirHandle | undefined>((resolve, reject) => {
        const rq = db.transaction('handles').objectStore('handles').get(HANDLE_KEY);
        rq.onsuccess = (): void => resolve(rq.result);
        rq.onerror = (): void => reject(rq.error);
      });
      db.close();
      if (!h) return false;
      const q = h as StoredDirHandle & {
        queryPermission?(d: { mode: string }): Promise<PermissionState>;
      };
      if (q.queryPermission && (await q.queryPermission({ mode: 'read' })) !== 'granted')
        return false;
      await this.importFromHandle(h as DirEntries, false);
      return true;
    } catch {
      return false;
    }
  }

  /** Bridge: te same zdarzenia co shell forka (window-level absolute/relative push).
   *  Dotyk: CSS `.fo1-screen canvas { touch-action:none }` powstrzymuje przegladarke
   *  od konsumowania gestow; tu dodatkowo: przed kliknieciem push kursora (dotyk nie
   *  generuje wczesniejszych pointermove, inaczej CE klikalby w stara pozycje kursora),
   *  drugi palec ignorowany (brak teleportowania kursora przy multi-touch),
   *  pointercancel zwalnia przytrzymany przycisk. */
  private installMouseBridge(canvas: HTMLCanvasElement): void {
    if (this.bridgeInstalled) return;
    this.bridgeInstalled = true;
    const m = this.mod;
    if (!m) return;
    const bounds = (): { width: number; height: number } => ({
      width: m._fallout_get_mouse_bounds_width?.() ?? canvas.width ?? 640,
      height: m._fallout_get_mouse_bounds_height?.() ?? canvas.height ?? 480,
    });
    const quant = (x: number, y: number): { x: number; y: number } => {
      const b = bounds();
      return {
        x: Math.max(0, Math.min(Math.round(x), Math.max(b.width - 1, 0))),
        y: Math.max(0, Math.min(Math.round(y), Math.max(b.height - 1, 0))),
      };
    };
    const absFromEvent = (e: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      const b = bounds();
      return quant(
        (e.clientX - r.left) * (b.width / Math.max(r.width, 1)),
        (e.clientY - r.top) * (b.height / Math.max(r.height, 1)),
      );
    };
    let activeId: number | null = null; // przytrzymany palec / przycisk myszy
    // Silnik kolejkuje przejscia przyciskow (najechanie -> wcisniecie -> zwolnienie), kazde
    // w osobnej klatce, wiec most nie musi niczego opozniac (dxinput.cc, kolejka gEmQueue).
    const release = (x: number, y: number, button: number): void => {
      m._fallout_push_mouse_button?.(x, y, button, 0);
    };
    const onMove = (e: PointerEvent): void => {
      if (activeId !== null && e.pointerId !== activeId) return;
      if (!m._fallout_push_mouse_move) return;
      const p = absFromEvent(e);
      m._fallout_push_mouse_move(p.x, p.y);
    };
    const onDown = (e: PointerEvent): void => {
      if (!m._fallout_push_mouse_button) return;
      if (activeId !== null && e.pointerId !== activeId) return; // drugi palec ignorowany
      activeId = e.pointerId;
      const p = absFromEvent(e);
      // dotyk nie daje pointermove przed tapnieciem: silnik sam wstawi klatke "najechania".
      m._fallout_push_mouse_button(p.x, p.y, e.button, 1);
      e.preventDefault(); // bez emulowanych zdarzen myszy i przenoszenia fokusu
      canvas.focus();
    };
    const onUp = (e: PointerEvent): void => {
      if (activeId !== null && e.pointerId !== activeId) return;
      activeId = null;
      if (!m._fallout_push_mouse_button) return;
      const p = absFromEvent(e);
      release(p.x, p.y, e.button);
    };
    const onCancel = (e: PointerEvent): void => {
      if (activeId === null || e.pointerId !== activeId) return;
      activeId = null;
      if (!m._fallout_push_mouse_button) return;
      const p = absFromEvent(e);
      release(p.x, p.y, e.button);
    };
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
  }

  start(): void {
    if (!this.mod || this.started) return;
    if (!this.fs.analyzePath('/master.dat').exists) {
      this.setStatus({ phase: 'error', detail: 'master.dat brak - najpierw import folderu' });
      return;
    }
    this.fs.writeFile('/fallout.cfg', FALLOUT_CFG);
    this.fs.writeFile('/f1_res.ini', F1_RES_INI);
    this.started = true;
    this.setStatus({ phase: 'started' });
    this.installMouseBridge(this.canvas as HTMLCanvasElement);
    this.startSyncLoop();
    try {
      this.mod.callMain();
    } catch (e) {
      // "unwind" z Asyncify przy wyjsciu to nie blad.
      if (e !== 'unwind' && !(e instanceof WebAssembly.RuntimeError && this.started)) {
        this.setStatus({ phase: 'error', detail: String(e) });
        throw e;
      }
    }
  }

  dispose(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    void this.syncSaves();
  }
}

async function openHandleStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(HANDLE_STORE, 1);
    rq.onupgradeneeded = (): void => {
      rq.result.createObjectStore('handles');
    };
    rq.onsuccess = (): void => resolve(rq.result);
    rq.onerror = (): void => reject(rq.error);
  });
}
