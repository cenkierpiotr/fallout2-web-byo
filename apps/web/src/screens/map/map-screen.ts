import type { MidnightHost } from '../../game/midnight-host';
import { frameToRgba } from '../../game/icon-sprites';
import { activeSaveStore } from '../../state/profiles';
import { hasModLayers } from '../../state/game-folder';
import { reportAutosave } from '../../state/autosave-indicator';
import { signal, type Signal } from '@preact/signals';
import { SpriteCache, type DecodeClient } from '@f2/assets';
import { charSfxName, weaponSfxName } from '@f2/audio';
import { applyColorCycles, parseLst, parsePal, type FrmFrame, type Palette } from '@f2/formats';
import {
  ActionBus,
  KeyboardMap,
  PointerManager,
  detectProfile,
  type Action,
  type ProfileName,
} from '@f2/input';
import {
  GameClock,
  GameCommands,
  GameVars,
  MapLoader,
  MessageSource,
  ScriptRuntime,
  createViewDialogHooks,
  objectsAt,
  MovementSystem,
  isDoor,
  isDoorLocked,
  isDoorOpen,
  ProtoCache,
  createGameView,
  hexToWorld,
  hexDistance,
  hexNeighbors,
  moveObject,
  findPath,
  isPassableFor,
  HEX_COUNT,
  indexObject,
  type ExitGrid,
  type GameMap,
  type GameObject,
  type GameView,
  openGameFile,
  type World,
  Anim,
  AnimDirector,
  type AnimStep,
} from '@f2/engine-core';
import {
  AdaptiveScale,
  Camera2D,
  IsoCamera,
  LightMap,
  ObjectLayer,
  RoofLayer,
  readDevicePixels,
  renderDpr,
  scaledDpr,
  SpriteBatch,
  TileLayer,
} from '@f2/render';
import { blobToDataUrl, captureThumbnail } from '@f2/app/src/thumbnail';
import { t } from '../../i18n';
import { GraphicsController, detectQualityEnv } from './graphics';
import { makeWorldDoorPolicy } from '../../game/door-policy';
import { GameSession } from '../../game/game-session';
import { restoreMapObjects } from '../../game/restore-world';
import { ObjectTextSource, formatLook, httpPackReader } from '../../game/object-text';
import { MessageLog, formatCombatEvent, partMsgBase } from '../../game/message-log';
import { readGameMsg, gameMsgOptions } from '../../game/msg-read';
import type { CombatEvent } from '../../game/combat';
import type { SessionExtras, SessionExtrasDeps } from '../../game/session-extras';
import type { SessionState } from '../../game/save-world';
import type { VirtualFs } from '@f2/vfs';
import { locale } from '../../i18n';
import { createUiBindings, type UiBindings } from '../../game/ui-bindings';
import { GameLoop } from '../../game-loop';
import { createRenderDevice, createWorkerDevice, type RemoteDeviceFactory } from './render-device';
import { effectiveFixes, settings as settingsSignal, type Settings } from '../../settings';
import { FidResolver, makeCritterFid, parseFid } from './fid-path';
import { openElevatorPrompt } from '../../game/elevator-host';
import { listMaps, parseMapsTxt, type MapEntry } from './maps-txt';
import { createRemoteVfs, type RemoteVfs } from './remote-vfs';
import { ensureAudio } from '../../audio/audio-state';
import { DialogSpeech } from '../../audio/dialog-speech';
import { SpriteLibrary } from './sprite-library';
import { createHd, planHd } from './hd-rgba';
import { hdPack } from '../../state/hd-pack';
import { animatedFid, clipInfoOf, mapAmbient, moveAnimOf } from './critter-sprite';
import {
  itemMenuEntries,
  itemOfAction,
  lookKey,
  menuEntries,
  skillMenuEntries,
  skillOfAction,
  type MenuAction,
  type MenuEntry,
  type MenuTarget,
} from './touch-menu';
import { playerMayRun } from '@f2/rules';
import { createSkillUseHost, type SkillUseHost } from '../../game/skill-use-host';
import {
  actionFlags,
  runLook,
  runObjectAction,
  runUseItemOn,
  usableItems,
  type ObjectActionDeps,
} from '../../game/object-actions';
import { defaultUse, hasKeyFor } from '../../game/default-actions';
import { createSheetCritter } from '../../game/sheet-critter';
import { sheetDialogIq, sheetHasEmpathy } from '../../game/dialog-perks';
import { Perk } from '@f2/rules';
import { ambientWithNightVision, runAllowedUnderLoad } from './map-loop-rules';
import { carryMax, inventoryWeight, stackWeight } from '../../game/inventory-world';
import { inReach, planApproach } from '../../game/approach';

const PLAYER_PID = 0x01000000;
const PLAYER_ID = 0x7fff0000;
const MAX_NOTIFICATIONS = 4;

/** Pasma ciecia kafli podlogi (mniej overdrawu, patrz dokumentacja techniczna). */
const TILE_BANDS = 4;

export interface MapScreenDeps {
  client: DecodeClient;
  canvas: HTMLCanvasElement;
  /** Kontener z canvasem (rozmiar, zdarzenia wskaznika i klawiatury). */
  wrap: HTMLElement;
  settings?: () => Settings;
  /** Fabryka urzadzenia zdalnego (renderWorker); uzywana tylko gdy flaga `renderWorker` jest wlaczona. */
  renderDeviceFactory?: RemoteDeviceFactory;
  /** Stan poczatkowy sesji (arkusz postaci z kreatora); undefined = domyslny. */
  initialState?: () => SessionState | undefined;
  /** Fabryka druzyny/zadan/gvars (adaptery party, quest, pipboy, endgame). */
  makeExtras?: (
    ctx: Pick<SessionExtrasDeps, 'vars' | 'player'> & {
      vfs: VirtualFs;
      scripts: () => World['scripts'];
    },
  ) => Promise<SessionExtras>;
  /** Odtwarzacz filmow dla play_gmovie (0x8115); Promise blokuje skrypt do konca filmu. */
  playMovie?: (file: string, num: number) => Promise<'played' | 'skipped' | 'missing' | 'error'>;
  /** Hooki polnocy (film trwa, koniec gry, slajdy progow dni). */
  midnight?: MidnightHost;
  /** Wolane po utworzeniu sesji (nowa mapa). */
  onSession?: (session: GameSession, extras: SessionExtras | undefined) => void;
  /** Czy trwa walka: zapisy (reczny, szybki, auto) sa wtedy blokowane jak w oryginale (`save-in-combat`). */
  isInCombat?: () => boolean;
  /** Wolane po udanym wczytaniu zapisu (np. wznowienie zapisanej walki). */
  onLoaded?: (session: GameSession) => void;
  characterName?: () => string;
  /** Tap na heks przed domyslna obsluga (walka: atak/ruch); true = obsluzone. */
  interceptTap?: (hex: number) => boolean;
  /** Podniesienie przedmiotu / otwarcie pojemnika z menu akcji (po procedurze pickup_p_proc). */
  pickupObject?: (o: GameObject) => { ok: boolean; reason?: string };
  /** Otwarcie pojemnika (skrzynia, szafka) z domyslnej akcji Uzyj: okno lootu. */
  openContainer?: (o: GameObject) => { ok: boolean; reason?: string };
  /** Menu akcji zostalo otwarte (podpowiedz samouczka `actionMenu`). */
  onMenuOpen?: () => void;
  /** Wyjscie z mapy lokalnej na mape swiata (exit grid z destMap < 0 albo skrypt `load_map(-1|-2)`). */
  onWorldMap?: (req: { townMap: boolean; fromMap: string }) => void;
}

/** Ekran wyboru przedmiotu do kradziezy: lista przedmiotow celu z szansa i wynik ostatniej proby. */
export interface StealView {
  targetId: number;
  name: string;
  items: Array<{ id: number; name: string; chance: number }>;
  message: string | null;
}

/** Otwarte menu akcji (long press / PPM); pozycja w px wzgledem kontenera mapy. */
export interface MapMenu {
  x: number;
  y: number;
  hex: number;
  entries: MenuEntry[];
}

/** Klatka grafiki z gry (RGBA, indeks 0 palety = przezroczysty). */
export interface ArtFrame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface MapScreen {
  maps: MapEntry[];
  /** Menu akcji na heksie (null = zamkniete). */
  menu: Signal<MapMenu | null>;
  menuChoose(action: MenuAction): void;
  /** Ekran kradziezy (null = zamkniety); wybor przedmiotu rzuca na skill Steal. */
  steal: Signal<StealView | null>;
  stealPick(itemId: number): void;
  stealClose(): void;
  view: GameView;
  fps: Signal<number>;
  zoom: Signal<number>;
  mapName: Signal<string>;
  notes: Signal<string[]>;
  /** Dziennik komunikatow (powiadomienia, walka, skille); najnowsze na koncu. */
  logLines: Signal<string[]>;
  logClear(): void;
  /** Zdarzenie walki do dziennika (teksty z combat.msg wg jezyka). */
  logCombatEvent(e: CombatEvent): void;
  elevation: Signal<number>;
  loading: Signal<boolean>;
  /** Powiazania @f2/ui (zapisy, odpoczynek, handel); null przed otwarciem mapy. */
  ui: Signal<UiBindings | null>;
  /** Polecenia dialogu dla DialogScreen (puste operacje, gdy brak skryptow). */
  dialog: { choose(index: number): unknown; close(): unknown };
  open(mapName: string): Promise<void>;
  quickSave(): Promise<boolean>;
  quickLoad(): Promise<boolean>;
  loadSlot(slot: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Handel z najblizszym kupcem; false gdy nikogo w poblizu. */
  trade(): boolean;
  /** Przejscie na mape lokalna z mapy swiata (wejscie do lokacji/spotkanie); stan opuszczanej mapy trafia do rejestru. */
  enterMap(name: string, hex?: number, elevation?: number): Promise<void>;
  /** Wstrzymuje/wznawia petle gry (mapa swiata przykrywa ekran). */
  setPaused(paused: boolean): void;
  /** Biezaca sesja gry (null przed otwarciem mapy). */
  session(): GameSession | null;
  /** Wpisy maps.txt (indeks, nazwa, lookup) do rozwiazywania wejsc z city.txt. */
  mapEntries: MapEntry[];
  /** Tekst z gry (np. data/worldmap.txt) przez VFS. */
  readText(path: string): Promise<string>;
  /** Znane obszary mapy swiata ustawione przez skrypty (mark_area_known). */
  knownAreas(): ReadonlyMap<number, number>;
  /** Rozmiar sztuki przedmiotu z PRO (proto.size, ProtoCache); undefined dla nie-przedmiotow. */
  itemSize(pid: number): Promise<number | undefined>;
  /** Dane proto amunicji (`Proto.data` podtypu 4) z cache, synchronicznie; undefined gdy nieznane (D: AC [2], DR [3]). */
  ammoData(pid: number): readonly number[] | undefined;
  /** Swiatlo heksa 0..0x10000 (LightMap ograniczone do [otoczenie, 1], jak 0x48ad04). */
  hexLight(hex: number): number;
  /** Swiatlo otoczenia 0x4000..0x10000 (Solar Scorcher, D 0x478874). */
  ambientLight(): number;
  /** Klatki FRM (kierunek 0) jako RGBA z paleta gry; null gdy brak pliku w VFS. Tylko lokalnie, nic nie trafia do repo. */
  loadArt(path: string): Promise<ArtFrame[] | null>;
  /** Kolor palety gry (color.pal) o indeksie 0..255 jako [r,g,b]. */
  paletteColor(index: number): readonly [number, number, number];
  stop(): void;
  dispose(): void;
  /** Animacja krytera (atak, unik, smierc...) przez AnimDirector; `queue` dolacza po biezacej. */
  playAnim(
    objectId: number,
    anim: number,
    opts?: { weapon?: number; queue?: boolean; onAction?: () => void; onEnd?: () => void },
  ): Promise<void>;
}

/** Przypadki, w ktorych odmowa ruchu ma byc widoczna dla gracza. */
const NOTIFY_REASONS = new Set(['blocked', 'noPath', 'outOfMap']);
/** Powody odmowy rozmowy widoczne dla gracza. */
const TALK_REASONS = new Set(['tooFar', 'noDialog']);

export async function createMapScreen(deps: MapScreenDeps): Promise<MapScreen> {
  const { client, canvas, wrap } = deps;
  const getSettings = deps.settings ?? ((): Settings => settingsSignal.value);

  const rvfs: RemoteVfs = await createRemoteVfs(client);
  const vfs = rvfs.vfs;
  const dialogSpeech = new DialogSpeech({
    has: (p) => rvfs.has(p),
    keys: (pre) => rvfs.keys(pre),
    headsLst: async () => {
      const p = rvfs.canonical('art/heads/heads.lst');
      return p ? new TextDecoder().decode(await client.read(p)) : undefined;
    },
    show: async (cue) => {
      try {
        const a = await ensureAudio(client);
        await a.dialog.show(cue);
      } catch {
        // brak Web Audio: dialog dziala bez mowy
      }
    },
    close: () => {
      void ensureAudio(client).then(
        (a) => a.dialog.close(),
        () => undefined,
      );
    },
  });
  const protos = new ProtoCache(vfs, effectiveFixes(getSettings()));
  const loader = new MapLoader(vfs, protos);
  const fids = new FidResolver(vfs);
  await fids.load();

  let mapsText = '';
  try {
    mapsText = new TextDecoder().decode(
      await client.read(rvfs.canonical('data/maps.txt') ?? 'data/maps.txt'),
    );
  } catch {
    /* brak maps.txt: lista tylko z plikow */
  }
  const allEntries = parseMapsTxt(mapsText);
  const maps = listMaps(allEntries, rvfs.keys('maps/').concat(rvfs.keys('data/maps/')));

  const { device, mode: deviceMode } = createRenderDevice(canvas, {
    renderWorker: getSettings().renderWorker,
    factory: deps.renderDeviceFactory ?? createWorkerDevice,
    dpr: window.devicePixelRatio || 1,
  });
  const pal: Palette = parsePal(await client.read('color.pal'));
  device.setPalette(pal.rgba);
  const cycled = new Uint8Array(1024);
  const gfx = new GraphicsController(device, getSettings, detectQualityEnv(window), canvas);

  const cache = new SpriteCache(device, (p) => client.loadFrm(p), 2048, TILE_BANDS);
  const batch = new SpriteBatch();
  const tiles = new TileLayer(batch);
  const roofs = new RoofLayer(tiles);
  const light = new LightMap();
  const iso = new IsoCamera();
  const cam2d = new Camera2D();

  // gracz
  const clock = new GameClock();
  const view = createGameView();
  const playerProto = await protos.get(PLAYER_PID).catch(() => protos.placeholderFor(PLAYER_PID));
  let playerIdx = parseFid(playerProto.fid).index;
  {
    // proto gracza wskazuje placeholder (reserv); prawdziwy model gracza to hmjmps
    const alt = fids.indexOf(1, 'hmjmps');
    if (alt >= 0) playerIdx = alt;
    else if (!fids.pathFor(makeCritterFid(playerIdx, 0))) playerIdx = 0;
  }
  const player: GameObject = {
    id: PLAYER_ID,
    pid: PLAYER_PID,
    fid: makeCritterFid(playerIdx, 0),
    type: 1,
    hex: -1,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: playerProto.flags,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: playerProto,
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    hidden: false,
  };

  let world: World | null = null;
  let commands: GameCommands | null = null;
  let session: GameSession | null = null;
  let skillHost: SkillUseHost | null = null;
  let extras: SessionExtras | undefined;
  let current: GameMap | null = null;

  const fidPathCache = new Map<number, number>();
  /** Obiekty animowane po id (do wyboru pliku FRM dla klipu). */
  const animObjs = new Map<number, GameObject>();
  const animInfo = (id: number, anim: number, weapon: number) => {
    const obj = animObjs.get(id) ?? (id === player.id ? player : undefined);
    if (!obj) return undefined;
    const idx = obj === player ? playerIdx : parseFid(obj.fid).index;
    const p = fids.pathFor(makeCritterFid(idx, anim, weapon));
    const h = p ? lib.handle(p) : undefined;
    return h ? clipInfoOf(h) : undefined;
  };
  const anims = new AnimDirector(animInfo);
  /** Zaczyna klip (po zaladowaniu FRM; bez pliku klip jest pomijany, ale zdarzenia sie odpalaja). */
  const playAnim = async (obj: GameObject, step: AnimStep, queue = false): Promise<void> => {
    animObjs.set(obj.id, obj);
    const idx = obj === player ? playerIdx : parseFid(obj.fid).index;
    const p = fids.pathFor(makeCritterFid(idx, step.anim, step.weapon ?? 0));
    if (p) await lib.ensure(p);
    if (queue) anims.queue(obj.id, step);
    else anims.play(obj.id, step);
  };
  /** Sprite obiektu: gracz ma animacje chodu; krytery bez pliku .frm uzywaja .frN wg rotacji. */
  const spriteOf = (obj: GameObject): { fid: number; frame: number } => {
    if (obj === player && world) {
      // chod/bieg/atak/unik/smierc: AnimDirector; brak widoku = stoi
      const v = anims.view(player.id);
      if (v) return { fid: animatedFid(makeCritterFid(playerIdx, 0), v), frame: v.frame };
      return { fid: makeCritterFid(playerIdx, Anim.Stand), frame: 0 };
    }
    if (obj.type === 1) {
      const base = obj.fid & 0x0fffffff;
      const v = anims.view(obj.id);
      if (v) {
        const afid = animatedFid(base, v);
        const ap = fids.pathFor(afid);
        if (ap && lib.handle(ap)) return { fid: afid, frame: v.frame };
      }
      let fid = fidPathCache.get(base);
      if (fid === undefined) {
        const p = fids.pathFor(base);
        fid = p && rvfs.has(p) ? base : -1;
        fidPathCache.set(base, fid);
      }
      return { fid: fid >= 0 ? base : (base | ((obj.rotation + 1) << 28)) >>> 0, frame: obj.frame };
    }
    return { fid: obj.fid >>> 0, frame: obj.frame };
  };
  // HD (RGBA) za flaga hdRgba: bez niej hd == null, batch nieuporzadkowany, zero zmian w renderze
  const hdPlan = planHd(getSettings(), !!device.createRgbaTexture);
  // paczka HD wybrana w opcjach gry ma pierwszenstwo przed assets-hd z folderu gry
  const hd = await createHd(
    hdPlan,
    device,
    hdPack.value?.reader ?? {
      resolve: (p) => rvfs.canonical(p),
      read: (p) => client.read(p),
    },
  );
  batch.ordered = hd !== null;
  const lib = new SpriteLibrary(
    cache,
    fids,
    spriteOf,
    hd ? { override: hd, tiles: hdPlan.tiles } : undefined,
  );
  const objects = new ObjectLayer(lib, batch);

  /** Dziennik komunikatow (okienko u dolu HUD): powiadomienia i zdarzenia walki. */
  const messageLog = new MessageLog();
  const logLines = signal<string[]>([]);
  messageLog.subscribe((l) => (logLines.value = [...l]));
  const notify = (msg: string): void => {
    view.notifications.value = [...view.notifications.value, msg].slice(-MAX_NOTIFICATIONS);
    messageLog.add(msg);
  };

  const zoom = signal(1);
  const fps = signal(0);
  const mapName = signal('');
  const loading = signal(false);
  const ui = signal<UiBindings | null>(null);
  const notes = signal<string[]>([]);
  const elevation = signal(0);
  const menu = signal<MapMenu | null>(null);
  /** Ostatni heks celu long-press-drag (-1 = brak aktywnego gestu). */
  let walkDragHex = -1;
  const steal = signal<StealView | null>(null);
  view.notifications.subscribe((v) => (notes.value = v));
  view.currentMap.subscribe((v) => (elevation.value = v.elevation));

  /**
   * Proto amunicji zaladowanej do broni (obj+0x40 = raw[1] przedmiotu): walka czyta je synchronicznie
   * (`ammoData`), wiec ladujemy je z gory przy wejsciu na mape (ekwipunek krytterow i gracza).
   */
  const prefetchAmmo = (): void => {
    const seen = new Set<number>();
    const scan = (list: readonly GameObject[]): void => {
      for (const it of list) {
        if (it.extra.kind === 'item' && it.extra.raw.length > 1) {
          const ammo = it.extra.raw[1] ?? -1;
          if (ammo !== -1 && !seen.has(ammo)) {
            seen.add(ammo);
            void protos.get(ammo).catch(() => undefined);
          }
        }
        if (it.inventory.length) scan(it.inventory);
      }
    };
    if (current) for (const o of current.objects) if (o.inventory.length) scan(o.inventory);
    scan(player.inventory);
  };

  const applyTiles = (): void => {
    if (!current) return;
    prefetchAmmo();
    const set = current.tiles[player.elevation];
    if (set) tiles.setTiles(set, (i) => lib.tileFrame(i));
    light.rebuildStatic(current, player.elevation, 1);
    gfx.resetAnchor();
    gfx.setLightObjects(current.objects, player.elevation);
    refreshAmbient();
  };

  /** Laduje do cache wszystkie sprite'y, ktore mapa moze pokazac. */
  const preload = async (map: GameMap): Promise<void> => {
    const paths = new Set<string>();
    for (const o of map.objects) {
      const p = fids.pathFor(spriteOf(o).fid);
      if (p) paths.add(p);
    }
    for (const set of map.tiles) {
      if (!set) continue;
      for (const arr of [set.floor, set.roof]) {
        const seen = new Set<number>();
        for (let i = 0; i < arr.length; i++) seen.add(arr[i] as number);
        for (const idx of seen) {
          const p = lib.tilePath(idx);
          if (p) paths.add(p);
        }
      }
    }
    for (const code of [0, 1, 19]) {
      const p = fids.pathFor(makeCritterFid(playerIdx, code));
      if (p) paths.add(p);
    }
    await lib.preload(paths);
  };

  const centerOnPlayer = (): void => {
    iso.centerOnHex(player.hex);
    iso.clampToMap();
  };

  const adaptive = new AdaptiveScale();
  const adaptiveCtl = { enabled: true, lastFrameAt: 0 };
  const resize = (): void => {
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    // fill-rate telefonow: bufor renderu ograniczony do ~1.6 MPx (patrz dokumentacja techniczna)
    // + adaptacyjna skala wg czasu klatki (AdaptiveScale, patrz render())
    const dpr = scaledDpr(renderDpr(w, h, window.devicePixelRatio || 1), adaptive.scale);
    device.resize(w, h, dpr);
    iso.viewportW = w;
    iso.viewportH = h;
    iso.dpr = dpr;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  const onResizeAndClamp = (): void => {
    resize();
    iso.clampToMap();
  };
  document.addEventListener('fullscreenchange', onResizeAndClamp);
  window.addEventListener('resize', onResizeAndClamp);

  // petla
  const loop = new GameLoop(
    (ticks) => {
      if (!session) return;
      const r = session.update(ticks);
      if (r.exit) void handleExit(r.exit);
      const wm = world?.scripts?.pendingWorldMap;
      if (wm && world?.scripts) {
        world.scripts.pendingWorldMap = undefined;
        if (deps.onWorldMap) deps.onWorldMap({ ...wm, fromMap: current?.name ?? '' });
        else notify(t('exit.worldMap'));
      }
      const ml = world?.scripts?.takeMapLoad((i) => entryByIndex(i)?.name);
      if (ml) void travel(ml.name, ml.hex, ml.elevation);
      runPendingApproach();
    },
    () => render(),
  );
  loop.fps.subscribe((v) => (fps.value = v));

  let lastAnimAt = 0;
  let lastAmbientAt = 0;
  let movePending = false;
  const lightAtTile = (tile: number): number => light.intensityAtTile(tile);
  /** Swiatlo otoczenia: skrypt (set_light_level) albo zegar gry (dzien/noc) dla map zewnetrznych. */
  /** Reczne otoczenie z diagnostyki (testy wizualne); undefined = skrypt/zegar. */
  let ambientForced: number | undefined;
  const refreshAmbient = (now = performance.now()): void => {
    lastAmbientAt = now;
    if (!current) return;
    if (ambientForced !== undefined) {
      light.setAmbient(ambientForced);
      return;
    }
    const roof = current.tiles[player.elevation]?.roof ?? [];
    const d = clock.date;
    const amb = mapAmbient(world?.scripts?.scriptLightLevel, d.hour, d.minute, roof);
    // Night Vision (D 0x47a908): podnosi swiatlo otoczenia o 20 procent skali na range
    const nv = session?.state.sheet.perks[Perk.NightVision] ?? 0;
    light.setAmbient(ambientWithNightVision(amb, nv));
  };
  /** Chod/bieg gracza z AnimDirector wg stanu ruchu; po zatrzymaniu wraca do stania. */
  const syncPlayerMoveAnim = (): void => {
    if (!world) return;
    const st = world.movement.stateOf(player);
    const v = anims.view(player.id);
    if (st) {
      const want = moveAnimOf(st.animCode);
      if ((!v || v.anim !== want) && !movePending) {
        movePending = true;
        void playAnim(player, { anim: want }).finally(() => {
          movePending = false;
        });
      }
    } else if (v && (v.anim === Anim.Walk || v.anim === Anim.Running)) {
      anims.clear(player.id);
    }
  };

  let lastPal = 0;
  const stats = {
    buildMs: 0,
    submitMs: 0,
    sprites: 0,
    drawCalls: 0,
    uploadedBytes: 0,
    fillPixels: 0,
    renderScale: 1,
  };
  const render = (): void => {
    if (!current) return;
    const now = performance.now();
    if (adaptiveCtl.enabled && adaptiveCtl.lastFrameAt > 0) {
      if (adaptive.sample(now - adaptiveCtl.lastFrameAt) !== undefined) resize();
    }
    adaptiveCtl.lastFrameAt = now;
    if (now - lastPal > 33) {
      applyColorCycles(pal, now, cycled);
      device.setPalette(cycled);
      lastPal = now;
    }
    iso.clampToMap();
    zoom.value = iso.zoom;
    syncPlayerMoveAnim();
    anims.update(Math.min(100, lastAnimAt > 0 ? now - lastAnimAt : 0));
    lastAnimAt = now;
    if (now - lastAmbientAt > 500) refreshAmbient(now);
    batch.clear();
    tiles.drawFloor(iso, lightAtTile);
    objects.draw(current, player.elevation, iso, light, { player });
    roofs.draw(current, player.elevation, iso, player, lightAtTile);
    const t1 = performance.now();
    cam2d.x = iso.x;
    cam2d.y = iso.y;
    cam2d.zoom = iso.zoom;
    gfx.update(cam2d.x, cam2d.y, now, cam2d.zoom, light.ambientLevel);
    device.beginFrame([0, 0, 0, 1]);
    device.drawSprites(batch, cam2d);
    device.endFrame();
    stats.buildMs = t1 - now;
    stats.submitMs = performance.now() - t1;
    stats.sprites = batch.count;
    stats.drawCalls = device.stats?.drawCalls ?? 0;
    stats.uploadedBytes = device.stats?.uploadedBytes ?? 0;
    stats.fillPixels = device.stats?.fillPixels ?? 0;
    stats.renderScale = adaptive.scale;
  };

  const entryByIndex = (i: number): MapEntry | undefined => allEntries.find((e) => e.index === i);

  async function handleExit(eg: ExitGrid): Promise<void> {
    if (!commands) return;
    const dest = eg.destMap >= 0 ? entryByIndex(eg.destMap) : undefined;
    if (!dest) {
      if (eg.destMap < 0 && deps.onWorldMap)
        deps.onWorldMap({ townMap: eg.destMap === -2, fromMap: current?.name ?? '' });
      else notify(t('exit.worldMap'));
      return;
    }
    await travel(dest.name, eg.destHex, eg.destElevation);
  }

  async function travel(name: string, hex?: number, elevation?: number): Promise<void> {
    if (!commands || !world) return;
    loop.paused = true;
    loading.value = true;
    try {
      // wstepne zaladowanie mapy i sprite'ow, zeby przejscie nie pokazalo pustej klatki
      const next = await loader.load(name);
      await preload(next);
      const w = world;
      const origLoad = w.loader;
      w.loader = { load: () => Promise.resolve(next) };
      const r = await session!.travelTo(name, hex, elevation);
      w.loader = origLoad;
      if (!r.ok) {
        notify(t('map.loadFailed', { name }));
        return;
      }
      current = w.map;
      mapName.value = current.name;
      applyTiles();
      centerOnPlayer();
    } catch (e) {
      notify(t('map.loadFailed', { name }));
      console.error(e);
    } finally {
      loading.value = false;
      loop.paused = false;
    }
  }

  async function quickSave(): Promise<boolean> {
    if (!session) return false;
    const r = await session.quickSave();
    notify(
      r.ok
        ? t('save.quickDone')
        : t(r.reason === 'save-in-combat' ? 'save.inCombat' : 'save.failed'),
    );
    return r.ok;
  }

  async function loadSlot(slot: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!session || !world) return { ok: false, reason: 'no-session' };
    loop.paused = true;
    loading.value = true;
    try {
      const r = await session.load(slot);
      if (!r.ok) return { ok: false, reason: r.reason };
      current = world.map;
      await preload(current);
      mapName.value = current.name;
      applyTiles();
      centerOnPlayer();
      deps.onLoaded?.(session);
      return { ok: true };
    } finally {
      loading.value = false;
      loop.paused = false;
    }
  }

  async function quickLoad(): Promise<boolean> {
    const r = await loadSlot('quick');
    notify(r.ok ? t('save.loadDone') : t('save.failed'));
    return r.ok;
  }

  function trade(): boolean {
    const ok = ui.value?.tradeWithNearest(t('trade.merchant')) ?? false;
    if (!ok) notify(t('trade.nobody'));
    return ok;
  }

  // wejscie
  const bus = new ActionBus();
  const kbBus = new ActionBus();
  const profile = (): ProfileName => {
    const s = getSettings().inputProfile;
    if (s !== 'auto') return s;
    return detectProfile({
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      width: window.innerWidth,
    });
  };
  const picker = {
    screenToHex: (x: number, y: number): number | null => {
      const h = iso.screenToHex(x, y);
      return h < 0 ? null : h;
    },
  };
  const pointer = new PointerManager(wrap, bus, profile(), picker);
  const keyboard = new KeyboardMap(kbBus, () => ({ x: iso.viewportW / 2, y: iso.viewportH / 2 }));
  // R jest skrotem odpoczynku (RestHost); bieg przelaczany klawiszem X
  delete keyboard.bindings['r'];
  keyboard.bindings['x'] = 'toggleRun';
  let running = getSettings().alwaysRun;

  /** Akcja czekajaca na dojscie postaci do obiektu (anulowana kolejnym klikniem/akcja). */
  let pending: { target: GameObject; exec: () => void } | null = null;
  function runPendingApproach(): void {
    if (!pending || !world || world.movement.stateOf(player)) return;
    const p = pending;
    pending = null;
    if (inReach(player, p.target)) p.exec();
    else notify(t('menu.tooFar'));
  }
  const cancelPending = (): void => {
    if (!pending) return;
    pending = null;
    world?.movement.cancel(player);
  };
  /** Podejdz do obiektu (A*) i dopiero potem wykonaj akcje; w zasiegu wykonuje od razu. */
  /** Przeciazenie (D 0x42e66c): gracz ponad udzwigiem nie biega, tylko idzie. */
  const canRun = (run: boolean): boolean =>
    runAllowedUnderLoad(
      run,
      session
        ? { carryMax: carryMax(session.state.sheet), carried: inventoryWeight(player) }
        : undefined,
    );
  const approachThen = (target: GameObject, run: boolean, exec: () => void): void => {
    if (!world || !commands) return;
    cancelPending();
    world.movement.cancel(player);
    const plan = planApproach(world.map, player, target);
    if (plan.kind === 'here') return exec();
    if (plan.kind === 'none')
      return notify(t(plan.reason === 'tooFar' ? 'menu.tooFar' : 'move.noPath'));
    const r = commands.moveTo(plan.hex, canRun(run));
    if (!r.ok) {
      if (NOTIFY_REASONS.has(r.reason)) notify(t(`move.${r.reason}`));
      return;
    }
    pending = { target, exec };
  };

  /** Krytyk (nie gracz) ze skryptem na klikanym heksie: cel rozmowy. */
  const talkTarget = (hex: number): GameObject | undefined => {
    if (!current || !world?.scripts) return undefined;
    return objectsAt(current, player.elevation, hex).find(
      (o) => o !== player && o.type === 1 && o.scriptId !== -1 && !o.hidden,
    );
  };

  const objectTexts = new ObjectTextSource(vfs, { pack: httpPackReader() });
  const nameCache = new Map<string, string>();
  const nameOfId = async (id: number): Promise<string> => {
    const o = (session?.world.map.objects ?? current?.objects ?? []).find((q) => q.id === id);
    if (!o) return `#${id}`;
    const key = `${locale.value}:${o.type}:${o.proto.textId}`;
    const hit = nameCache.get(key);
    if (hit !== undefined) return hit;
    const txt = await objectTexts
      .describe(locale.value, o.type, o.proto.textId)
      .catch(() => undefined);
    const name = txt?.name.trim() || `#${id}`;
    nameCache.set(key, name);
    return name;
  };
  let combatMsgs: { lang: string; msg: Promise<Map<number, string>> } | null = null;
  const combatMsg = (): Promise<Map<number, string>> => {
    if (combatMsgs?.lang !== locale.value)
      combatMsgs = {
        lang: locale.value,
        msg: readGameMsg(vfs, 'combat', gameMsgOptions(locale.value === 'pl', httpPackReader())),
      };
    return combatMsgs.msg;
  };
  /** 2. kolumna art/critters/critters.lst (baza nazw czesci ciala w combat.msg), ladowana leniwie. */
  let critterLst: Promise<string[]> | null = null;
  const critterEntries = (): Promise<string[]> =>
    (critterLst ??= openGameFile(vfs, 'art/critters/critters.lst')
      .then((b) => parseLst(b))
      .catch(() => []));
  const partBaseOf = async (id: number): Promise<number | undefined> => {
    const o = (session?.world.map.objects ?? current?.objects ?? []).find((q) => q.id === id);
    if (!o || o.type !== 1) return undefined;
    const entry = (await critterEntries())[o.fid & 0xfff];
    return entry ? partMsgBase(entry) : undefined;
  };
  /** Zdarzenia walki do dziennika; kolejnosc zachowana lancuchem obietnic (nazwy sa asynchroniczne). */
  let logChain: Promise<void> = Promise.resolve();
  const logCombatEvent = (e: CombatEvent): void => {
    const ids =
      e.kind === 'attack'
        ? [e.attacker, e.target]
        : e.kind === 'death' || e.kind === 'flee'
          ? [e.id]
          : [];
    if (ids.length === 0) return;
    logChain = logChain
      .then(async () => {
        const msg = await combatMsg().catch(() => new Map<number, string>());
        const names = new Map<number, string>();
        for (const id of ids) names.set(id, await nameOfId(id));
        const bases = new Map<number, number | undefined>();
        for (const id of ids) bases.set(id, await partBaseOf(id));
        const line = formatCombatEvent(e, {
          msg,
          nameOf: (id) => names.get(id) ?? `#${id}`,
          playerId: player.id,
          partBase: (id) => bases.get(id),
          t,
        });
        if (line) messageLog.add(line);
      })
      .catch(() => undefined);
  };

  /** Akcja Patrz: nazwa i opis z pro_*.msg (jezyk wg ustawienia); bez tekstow ogolny komunikat. */
  const lookAt = async (hex: number): Promise<void> => {
    const obj = objectAt(hex);
    if (!obj) return notify(t(lookKey(null)));
    if (runLook(obj, actionDeps)) return;
    const txt = await objectTexts
      .describe(locale.value, obj.type, obj.proto.textId)
      .catch(() => undefined);
    const line = txt ? formatLook(txt) : '';
    notify(line || t(lookKey(obj.type)));
  };

  /** Pierwszy widoczny obiekt (nie gracz) na heksie. */
  const objectAt = (hex: number): GameObject | undefined =>
    current
      ? objectsAt(current, player.elevation, hex).find((o) => o !== player && !o.hidden)
      : undefined;

  const actionDeps: ObjectActionDeps = {
    player: () => player,
    scripts: () => world?.scripts,
    pickup: (o) => deps.pickupObject?.(o) ?? { ok: false },
    map: () => world!.map,
    openContainer: (o) => deps.openContainer?.(o) ?? { ok: false },
    travel: (tr) => {
      const e = entryByIndex(tr.mapIndex);
      if (e) void travel(e.name, tr.hex, tr.elevation);
    },
    isParty: (o) => extras?.party.has(o.id) ?? false,
  };
  /**
   * use_obj ze skryptu bez nadpisania use_p_proc: domyslne uzycie celu przez uzytkownika (drzwi, pojemnik,
   * schody). Bez podejscia (exe najpierw prowadzi krytera do celu; Z). Tylko krytter (exe: 0x412114);
   * pojemnik i schody tylko dla gracza (okno lootu / zmiana mapy).
   */
  const runScriptUse = (srcId: number, tgtId: number): boolean => {
    const m = world?.map;
    const user = m?.objects.find((o) => o.id === srcId);
    const tgt = m?.objects.find((o) => o.id === tgtId);
    if (!m || !user || !tgt || user.type !== 1) return false;
    const isPlayer = user === player;
    if (!isPlayer && !(tgt.extra && isDoor(tgt))) return false;
    const r = defaultUse(tgt, {
      map: () => m,
      player: () => user,
      ...(isPlayer && deps.openContainer ? { openContainer: deps.openContainer } : {}),
      ...(isPlayer ? { travel: actionDeps.travel! } : {}),
    });
    return r !== undefined;
  };
  const targetAt = (hex: number): MenuTarget => {
    const obj = objectAt(hex);
    return {
      npc: talkTarget(hex) !== undefined,
      objectType: obj?.type ?? null,
      skills: obj && skillHost ? skillHost.usable(obj) : [],
      ...actionFlags(obj, actionDeps),
    };
  };
  const itemName = async (o: GameObject): Promise<string> => {
    const txt = await objectTexts
      .describe(locale.value, o.type, o.proto.textId)
      .catch(() => undefined);
    const n = (o.quantity ?? 1) > 1 ? ` (${o.quantity})` : '';
    return (txt?.name ?? `#${o.pid.toString(16)}`) + n;
  };

  const doMove = (hex: number, run: boolean): void => {
    if (!commands) return;
    const r = commands.moveTo(hex, canRun(run));
    if (!r.ok && NOTIFY_REASONS.has(r.reason)) notify(t(`move.${r.reason}`));
  };

  let stealTarget: GameObject | null = null;
  const showSteal = async (target: GameObject, message: string | null): Promise<void> => {
    const host = skillHost;
    if (!host) return;
    const items = await Promise.all(
      usableItems(target).map(async (i) => ({
        id: i.id,
        name: await itemName(i),
        chance: host.chance(10, target, i),
      })),
    );
    if (stealTarget !== target) return;
    steal.value = { targetId: target.id, name: await itemName(target), items, message };
  };
  const openSteal = (target: GameObject): void => {
    stealTarget = target;
    void showSteal(target, null);
  };
  const stealClose = (): void => {
    stealTarget = null;
    steal.value = null;
  };
  const stealPick = (itemId: number): void => {
    const target = stealTarget;
    const host = skillHost;
    const item = target?.inventory.find((i) => i.id === itemId);
    if (!target || !host || !item) return;
    const out = host.use(10, target, item);
    const msg = t(out.message.key, out.message.params);
    if (
      out.result.effects.some((e) => e.kind === 'caught') ||
      out.result.reason === 'out-of-range'
    ) {
      stealClose();
      notify(msg);
      return;
    }
    void showSteal(target, msg);
  };

  const menuChoose = (action: MenuAction): void => {
    const m = menu.value;
    if (m && skillHost && action === 'skills') {
      const target = objectAt(m.hex);
      const host = skillHost;
      const list = target ? host.usable(target) : [];
      const chances = new Map<number, number>();
      if (target && getSettings().showSkillChecks)
        for (const sk of list) chances.set(sk, host.chance(sk, target));
      menu.value = {
        ...m,
        entries: skillMenuEntries(
          list,
          chances.size > 0 ? (sk) => chances.get(sk) ?? 0 : undefined,
        ),
      };
      return;
    }
    if (m && action === 'back') {
      menu.value = { ...m, entries: menuEntries(targetAt(m.hex)) };
      return;
    }
    if (m && action === 'useItem') {
      const target = objectAt(m.hex);
      if (!target) return void (menu.value = null);
      const items = usableItems(player);
      void Promise.all(items.map(async (i) => ({ id: i.id, name: await itemName(i) }))).then(
        (list) => {
          if (menu.value === m) menu.value = { ...m, entries: itemMenuEntries(list) };
        },
      );
      return;
    }
    menu.value = null;
    if (!m || !commands) return;
    const run = running;
    const itemId = itemOfAction(action);
    if (itemId !== null) {
      const target = objectAt(m.hex);
      if (target)
        approachThen(target, run, () => {
          const msg = runUseItemOn(itemId, target, actionDeps);
          if (msg) notify(t(msg.key, msg.params));
        });
      return;
    }
    const skill = skillOfAction(action);
    if (skill !== null) {
      const target = objectAt(m.hex);
      if (target && skillHost) {
        const host = skillHost;
        approachThen(target, run, () => {
          if (skill === 10 && target.type === 1) return void openSteal(target);
          const out = host.use(skill, target);
          notify(t(out.message.key, out.message.params));
        });
      }
      return;
    }
    switch (action) {
      case 'walk':
        cancelPending();
        doMove(m.hex, false);
        break;
      case 'run':
        cancelPending();
        doMove(m.hex, true);
        break;
      case 'talk': {
        const npc = talkTarget(m.hex);
        if (!npc) break;
        approachThen(npc, run, () => {
          const r = commands!.talkTo(npc.id);
          if (!r.ok && TALK_REASONS.has(r.reason)) notify(t(`dialog.${r.reason}`));
        });
        break;
      }
      case 'look':
        void lookAt(m.hex);
        break;
      case 'use':
      case 'pickup':
      case 'push': {
        const target = objectAt(m.hex);
        if (target)
          approachThen(target, run, () => {
            const msg = runObjectAction(action, target, actionDeps);
            if (msg) notify(t(msg.key, msg.params));
          });
        break;
      }
      default:
        break;
    }
  };

  const onAction = (a: Action): void => {
    // otwarte menu: dotkniecie poza nim tylko je zamyka (bez ruchu postaci)
    if (
      menu.value &&
      (a.type === 'moveTo' || a.type === 'pan' || a.type === 'zoom' || a.type === 'walkDrag')
    ) {
      menu.value = null;
      if (a.type === 'moveTo') return;
    }
    switch (a.type) {
      case 'contextMenu': {
        const h = iso.screenToHex(a.screen.x, a.screen.y);
        if (h < 0 || !commands || view.dialog.value !== null) break;
        menu.value = { x: a.screen.x, y: a.screen.y, hex: h, entries: menuEntries(targetAt(h)) };
        deps.onMenuOpen?.();
        break;
      }
      case 'walkDrag': {
        // long-press-drag: marsz za palcem (zmiana heksu pod palcem = nowy cel), zwolnienie konczy gest
        if (a.phase === 'end') {
          walkDragHex = -1;
          break;
        }
        if (!commands || view.dialog.value !== null) break;
        const h = iso.screenToHex(a.screen.x, a.screen.y);
        if (h < 0 || h === walkDragHex) break;
        walkDragHex = h;
        cancelPending();
        const r = commands.moveTo(h, false);
        if (!r.ok && NOTIFY_REASONS.has(r.reason)) notify(t(`move.${r.reason}`));
        break;
      }
      case 'look': {
        const h = iso.screenToHex(a.screen.x, a.screen.y);
        if (h < 0) break;
        void lookAt(h);
        break;
      }
      case 'moveTo': {
        if (!commands) return;
        if (view.dialog.value !== null) break;
        if (deps.interceptTap?.(a.hex)) break;
        cancelPending();
        const npc = talkTarget(a.hex);
        if (npc) {
          approachThen(npc, a.run || running || keyboard.runModifier, () => {
            const r = commands!.talkTo(npc.id);
            if (!r.ok && TALK_REASONS.has(r.reason)) notify(t(`dialog.${r.reason}`));
          });
          break;
        }
        const r = commands.moveTo(a.hex, canRun(a.run || running || keyboard.runModifier));
        if (!r.ok && NOTIFY_REASONS.has(r.reason)) notify(t(`move.${r.reason}`));
        break;
      }
      case 'pan':
        iso.pan(a.dx, a.dy);
        iso.clampToMap();
        break;
      case 'zoom':
        iso.zoomAt(a.at.x, a.at.y, a.factor);
        iso.clampToMap();
        break;
      case 'zoomReset':
        iso.zoom = getSettings().defaultZoom;
        break;
      case 'elevation': {
        if (!commands) return;
        const e = player.elevation + a.delta;
        if (e < 0 || e > 2) break;
        const r = commands.setElevation(e as 0 | 1 | 2);
        if (r.ok) applyTiles();
        else notify(t('elevation.unavailable'));
        break;
      }
      case 'toggleRun':
        running = !running;
        notify(t(running ? 'move.runOn' : 'move.runOff'));
        break;
      case 'pause':
        loop.paused = !loop.paused;
        break;
      default:
        break;
    }
  };
  bus.on(onAction);
  // klawisze przesuwaja widok w kierunku klawisza (przeciwnie niz przeciaganie wskaznikiem)
  kbBus.on((a) => onAction(a.type === 'pan' ? { ...a, dx: -a.dx, dy: -a.dy } : a));
  pointer.attach();
  wrap.tabIndex = 0;
  keyboard.attach(wrap);
  const onFnKey = (e: KeyboardEvent): void => {
    if (e.key === 'F5') {
      e.preventDefault();
      void quickSave();
    } else if (e.key === 'F9') {
      e.preventDefault();
      void quickLoad();
    } else if (e.key === 't' || e.key === 'T') {
      trade();
    }
  };
  wrap.addEventListener('keydown', onFnKey);

  const stopSettings = settingsSignal.subscribe(() => {
    pointer.setProfile(profile());
    running = getSettings().alwaysRun;
  });

  async function open(name: string): Promise<void> {
    anims.clearAll();
    animObjs.clear();
    loading.value = true;
    loop.stop();
    try {
      const map = await loader.load(name);
      await preload(map);
      player.elevation = map.header.playerElevation as 0 | 1 | 2;
      player.hex = map.header.playerHex;
      player.rotation = (map.header.playerOrientation % 6) as GameObject['rotation'];
      map.objects = map.objects.filter((o) => o !== player);
      map.objects.push(player);
      indexObject(map, player);
      const movement = new MovementSystem(
        map,
        undefined,
        undefined,
        makeWorldDoorPolicy((o) => o === player, hasKeyFor),
        (mover, door) =>
          defaultUse(door, { map: () => map, player: () => mover }) === null && isDoorOpen(door),
      );
      world = { map, player, clock, movement, loader, view };
      try {
        const msgs = new MessageSource(vfs, {
          language: 'english',
          ...(locale.value === 'pl' ? { overlayLanguage: 'polish', pack: httpPackReader() } : {}),
        });
        extras = undefined;
        const vars = await GameVars.load(vfs);
        if (deps.makeExtras)
          extras = await deps.makeExtras({
            vars,
            player: { objId: player.id, pid: player.pid },
            vfs,
            scripts: () => world?.scripts,
          });
        const hooks = createViewDialogHooks(view, {
          // mowa dialogowa: pole audio wpisu MSG -> sound/speech/<glowa>/<audio>.acm (brak pliku = cisza)
          speak: (l) => {
            const audio = world?.scripts?.messageAudio(l.list, l.msgId ?? -1);
            void dialogSpeech
              .speak({ headFid: l.headFid, text: l.text, audio })
              .catch(() => undefined);
          },
          speakStop: () => dialogSpeech.stop(),
          // Smooth Talker (+ranga do IN opcji) i Empathy (kolory reakcji), D 0x45aa88 / 0x446e13
          playerIq: () => (session ? sheetDialogIq(session.state.sheet) : 5),
          hasEmpathy: () => (session ? sheetHasEmpathy(session.state.sheet) : false),
          // gdialog_barter: handel z NPC rozmowy (kupiec = NPC dialogu, mod ze skryptu)
          barter: (npcId, mod) => {
            const m = world?.map.objects.find((o) => o.id === npcId);
            if (m && session)
              session.openBarter(m, { merchantName: t('trade.merchant'), barterMod: mod });
          },
        });
        world.scripts = new ScriptRuntime(world, msgs, vars, hooks, {
          vfs,
          sfxNames: { charName: charSfxName, weaponName: weaponSfxName },
          ...(deps.playMovie ? { movie: deps.playMovie } : {}),
          ...(extras ? { party: extras.party } : {}),
          ...(hasModLayers.value ? { sfall: { enabled: true } } : {}),
          restoreObjects: (m, st) => restoreMapObjects(m, st, protos, world!.player),
        });
        world.scripts.onLightLevel = () => refreshAmbient();
        // 0x510944 bit 0 = stan walki (D): zasieg obj_can_see x2 poza stozkiem
        if (deps.isInCombat) world.scripts.inCombat = deps.isInCombat;
        world.scripts.onDefaultUse = (src, tgt) => runScriptUse(src, tgt);
        world.scripts.onElevatorRequest = (req) => {
          world?.scripts?.takeElevatorRequest();
          openElevatorPrompt(req, {
            currentMapIndex: () => allEntries.find((e) => e.name === current?.name)?.index ?? -1,
            go: (dest, sameMap) => {
              if (sameMap && current) {
                moveObject(current, player, dest.tile, dest.elevation);
                centerOnPlayer();
              } else {
                const e = entryByIndex(dest.map);
                if (e) void travel(e.name, dest.tile, dest.elevation);
              }
            },
          });
        };
        // pickup_obj: limit udzwigu gracza (0x477158, D: -6); NPC bez limitu (Z)
        world.scripts.canCarry = (who, item) => {
          const it = world?.map.objects.find((o) => o.id === item);
          if (who !== player.id || !it || !session) return true;
          return inventoryWeight(player) + stackWeight(it) <= carryMax(session.state.sheet);
        };
        await world.scripts.loadScriptsForMap(map);
      } catch (e) {
        // skrypty sa dodatkiem: bez nich mapa nadal dziala (bez rozmow)
        delete world.scripts;
        console.error('skrypty mapy', e);
      }
      const initial = deps.initialState?.();
      session = new GameSession({
        world,
        ...(initial ? { state: initial } : {}),
        ...(extras ? { extras } : {}),
        ...(deps.midnight ? { midnight: deps.midnight } : {}),
        ...(deps.characterName ? { characterName: deps.characterName } : {}),
        ...(deps.isInCombat ? { isInCombat: deps.isInCombat } : {}),
        store: activeSaveStore(),
        onAutosave: (st) => reportAutosave(st),
        locale: () => locale.value,
        now: () => Date.now(),
        engineVersion: 'm4',
        protos,
        getThumbnail: async () => {
          try {
            render();
            return await blobToDataUrl(await captureThumbnail(canvas));
          } catch {
            return null;
          }
        },
        ...(deps.characterName ? { playerName: deps.characterName } : {}),
      });
      if (world.scripts) world.scripts.playerRadiation = session.playerRadiationPort();
      {
        const s = session;
        const sheetCritter = createSheetCritter(() => s.state.sheet);
        skillHost = createSkillUseHost(s, sheetCritter);
        if (s.world.scripts)
          s.world.scripts.pcSneakSource = () => ({
            sneaking: s.state.sheet.sneaking,
            rollOk: s.state.sheet.sneakRollOk ?? false,
          });
        s.world.playerMayRun = () => playerMayRun(sheetCritter, s.state.sheet.sneaking);
      }
      deps.onSession?.(session, extras);
      ui.value?.dispose();
      ui.value = createUiBindings(session, { load: loadSlot });
      void session.refreshSaves();
      commands = session.commands;
      current = map;
      mapName.value = map.name;
      view.player.value = { hex: player.hex, elevation: player.elevation, moving: false };
      view.currentMap.value = { name: map.name, elevation: player.elevation };
      iso.zoom = getSettings().defaultZoom;
      applyTiles();
      centerOnPlayer();
      wrap.focus();
      loop.start();
    } finally {
      loading.value = false;
    }
  }

  const dev = import.meta.env.DEV;
  if (dev) {
    (window as unknown as { __f2game?: unknown }).__f2game = {
      view,
      iso,
      gfx,
      /** 'worker' gdy GL dziala w workerze (flaga renderWorker), inaczej 'main'. */
      deviceMode,
      /** Piksele bufora (RGBA, dol->gora) niezaleznie od trybu: w worker asynchronicznie. */
      readPixels: (): Promise<Uint8Array> => readDevicePixels(device),
      fps,
      player,
      get map() {
        return current;
      },
      get commands() {
        return commands;
      },
      get session() {
        return session;
      },
      get scripts() {
        return world?.scripts;
      },
      /** Obiekt ze skryptem o danym sid (np. 0x4000001 = Klint na ARTEMPLE) (do testow). */
      objectByScript(sid: number): GameObject | undefined {
        return current?.objects.find((o) => o.scriptId === sid);
      },
      /** Ustawia gracza na wolnym heksie obok `hex` (do testow rozmowy; bez animacji marszu). */
      placePlayerNear(hex: number): boolean {
        if (!current) return false;
        for (const n of hexNeighbors(hex)) {
          if (!isPassableFor(current, player.elevation, n, player)) continue;
          moveObject(current, player, n);
          view.player.value = { hex: n, elevation: player.elevation, moving: false };
          return true;
        }
        return false;
      },
      /** Najblizsze odlegle, odblokowane drzwi z planem podejscia (do testow e2e podejscia i otwarcia). */
      reachableDoor(minDist: number): { hex: number; open: boolean } | null {
        if (!current) return null;
        const cands = current.objects
          .filter(
            (o) =>
              o.elevation === player.elevation &&
              o.hex >= 0 &&
              !o.hidden &&
              isDoor(o) &&
              !isDoorLocked(o),
          )
          .map((o) => ({ o, d: hexDistance(player.hex, o.hex) }))
          .filter((c) => c.d >= minDist && c.d <= 25)
          .sort((a, b) => a.d - b.d)
          .slice(0, 6);
        for (const { o } of cands) {
          if (planApproach(current, player, o).kind === 'walk')
            return { hex: o.hex, open: isDoorOpen(o) };
        }
        return null;
      },
      /** Czy drzwi na heksie sa otwarte (do testow). */
      doorOpenAt(hex: number): boolean {
        return (
          !!current &&
          objectsAt(current, player.elevation, hex).some((o) => isDoor(o) && isDoorOpen(o))
        );
      },
      /** Centruje widok na heksie (do testow). */
      centerOn(hex: number): void {
        iso.centerOnHex(hex);
        iso.clampToMap();
      },
      loop,
      batch,
      stats,
      /** Swiatlo i animacje (testy e2e): ambient kafli, widok AnimDirector, skrypt swiatla. */
      lighting: {
        ambient: (): number => light.ambientLevel,
        tileLight: (tile: number): number => light.intensityAtTile(tile),
        scriptLevel: (): number | undefined => world?.scripts?.scriptLightLevel,
        refresh: (): void => refreshAmbient(),
        /** Diagnostyka: wklad zrodel swiatla (f2_obj_light_apply) on/off oraz reczne otoczenie. */
        setSources: (on: boolean): void => light.setSourcesEnabled(on),
        setAmbient: (v: number | undefined): void => {
          ambientForced = v;
          refreshAmbient();
        },
        litHexes: (): number => light.litHexCount(),
      },
      animView: (id: number) => anims.view(id),
      playAnim: async (id: number, anim: number): Promise<void> => {
        const o = id === player.id ? player : current?.objects.find((x) => x.id === id);
        if (o) await playAnim(o, { anim });
      },
      /** Adaptacyjna rozdzielczosc (benchmark ustawia enabled=false). */
      adaptive: {
        get enabled(): boolean {
          return adaptiveCtl.enabled;
        },
        set enabled(v: boolean) {
          adaptiveCtl.enabled = v;
          if (!v) {
            adaptive.reset();
            resize();
          }
        },
      },
      /** Heks osiagalny sciezka, w odleglosci `dist` od gracza i widoczny w widoku (do testow). */
      openHexAt(dist: number): number {
        if (!current) return -1;
        const vis = iso.visibleWorldRect();
        for (let h = 0; h < HEX_COUNT; h++) {
          if (hexDistance(player.hex, h) !== dist) continue;
          const w = hexToWorld(h);
          if (w.x < vis.x0 + 40 || w.x > vis.x1 - 40 || w.y < vis.y0 + 40 || w.y > vis.y1 - 40)
            continue;
          if (!isPassableFor(current, player.elevation, h, player)) continue;
          if (findPath(current, player.elevation, player.hex, h, player)) return h;
        }
        return -1;
      },
      /** Widoczny heks zablokowany (np. sciana) w odleglosci 1..6 od gracza (do testow). */
      blockedHexNear(): number {
        if (!current) return -1;
        const vis = iso.visibleWorldRect();
        for (let d = 1; d <= 6; d++) {
          for (let h = 0; h < HEX_COUNT; h++) {
            if (hexDistance(player.hex, h) !== d) continue;
            const w = hexToWorld(h);
            if (w.x < vis.x0 + 40 || w.x > vis.x1 - 40 || w.y < vis.y0 + 40 || w.y > vis.y1 - 40)
              continue;
            if (!isPassableFor(current, player.elevation, h, player)) return h;
          }
        }
        return -1;
      },
      /** Wspolrzedne klienta (strony) srodka heksa. */
      hexToClient(hex: number): { x: number; y: number } {
        const rect = wrap.getBoundingClientRect();
        const w = hexToWorld(hex);
        const p = iso.worldToScreen(w.x, w.y);
        return { x: rect.left + p.x, y: rect.top + p.y };
      },
    };
  }

  return {
    maps,
    menu,
    menuChoose,
    steal,
    stealPick,
    stealClose,
    view,
    fps,
    zoom,
    mapName,
    notes,
    logLines,
    logClear: () => messageLog.clear(),
    logCombatEvent,
    elevation,
    loading,
    ui,
    dialog: {
      choose: (i: number) => commands?.dialog.choose(i),
      close: () => commands?.dialog.close(),
    },
    open,
    async playAnim(id, anim, opts = {}) {
      const obj = id === player.id ? player : current?.objects.find((o) => o.id === id);
      if (!obj || obj.type !== 1) return;
      const step: AnimStep = { anim, weapon: opts.weapon ?? 0 };
      if (opts.onAction) step.onAction = opts.onAction;
      if (opts.onEnd) step.onEnd = opts.onEnd;
      await playAnim(obj, step, opts.queue ?? false);
    },
    quickSave,
    quickLoad,
    loadSlot,
    trade,
    enterMap: travel,
    setPaused(paused) {
      loop.paused = paused;
    },
    session: () => session,
    mapEntries: allEntries,
    async readText(path) {
      return new TextDecoder().decode(await client.read(rvfs.canonical(path) ?? path));
    },
    knownAreas: () => world?.scripts?.knownAreas ?? new Map<number, number>(),
    ammoData(pid) {
      const p = protos.peek(pid) as
        { kind?: string; subtype?: number; data?: number[] } | undefined;
      return p?.kind === 'item' && p.subtype === 4 ? p.data : undefined;
    },
    hexLight: (hex) => Math.round(light.intensityAt(hex) * 0x10000),
    ambientLight: () => Math.round(light.ambientLevel * 0x10000),
    async itemSize(pid) {
      const p = (await protos.get(pid)) as { kind?: string; size?: number };
      return p.kind === 'item' && typeof p.size === 'number' ? p.size : undefined;
    },
    paletteColor: (i) => [pal.rgba[i * 4]!, pal.rgba[i * 4 + 1]!, pal.rgba[i * 4 + 2]!],
    async loadArt(path) {
      if (!rvfs.has(path)) return null;
      try {
        const frm = await client.loadFrm(rvfs.canonical(path) ?? path);
        return (frm.directions[0] ?? []).map((f: FrmFrame) => ({
          width: f.width,
          height: f.height,
          rgba: frameToRgba(f, pal.rgba),
        }));
      } catch {
        return null;
      }
    },
    stop() {
      loop.stop();
    },
    dispose() {
      loop.stop();
      ui.value?.dispose();
      stopSettings();
      menu.value = null;
      pointer.detach();
      wrap.removeEventListener('keydown', onFnKey);
      keyboard.dispose();
      document.removeEventListener('fullscreenchange', onResizeAndClamp);
      window.removeEventListener('resize', onResizeAndClamp);
      ro.disconnect();
      gfx.dispose();
      device.dispose();
      if (dev) delete (window as unknown as { __f2game?: unknown }).__f2game;
    },
  };
}
