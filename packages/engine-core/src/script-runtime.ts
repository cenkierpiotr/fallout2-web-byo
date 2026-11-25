import { lstName, parseInt as parseIntScript, parseLst } from '@f2/formats';
import { CarState, CAR_FUEL_MAX } from './worldmap/car.js';
import type { IntScript } from '@f2/formats';
import {
  addExplosionExtra,
  defaultRulesContext,
  EXPLOSION_MAX_RADIUS,
  isExplosionVictimEligible,
  partyLimit,
} from '@f2/rules';
import type { VirtualFs } from '@f2/vfs';
import {
  contextOpHandlers,
  createGameHandlers,
  dialogHandlers,
  GAME_CONTEXT_OPCODES,
  inventoryHandlers,
  miscHandlers,
  gapHandlers,
  movieHandlers,
  type MovieHooks,
  type MovieOutcome,
  combatHandlers,
  batch4Handlers,
  battleHandlers,
  type BattleHooks,
  Interpreter,
  int,
  Scheduler,
  type Batch4Hooks,
  type DialogHooks,
  type DialogSession,
  type DialogState,
  type CombatHooks,
  type GameHooks,
  type InventoryHooks,
  type MiscHooks,
  type OpHandler,
  type ScriptEntry,
  type ScriptInstance,
  type Value,
} from '@f2/vm';
import { fail, ok, type Result } from './doors.js';
import { referencedMsgLists } from './msg-list-scan.js';
import { FloatingTexts } from './floating-text.js';
import type { World } from './game-commands.js';
import type { GameMap } from './game-map.js';
import type { MapLoader } from './map-loader.js';
import { indexObject, moveObject, objectsAt } from './game-map.js';
import type { GameObject } from './game-object.js';
import type { GameVars } from './game-vars.js';
import type { GameView } from './game-view.js';
import { directionTo, hexDistance, hexInDirection } from './hexgrid.js';
import {
  SKILL_COUNT,
  addExperience,
  inFrontCone,
  rollAgainst,
  canSeeInRange,
  skillValue,
  statCheck,
} from './rules-skills.js';
import { InventoryModel } from './inventory-model.js';
import { PartyScriptAdapter } from './party/party-script-port.js';
import type { PartyState } from './party/party-state.js';
import { Batch4Model } from './batch4-model.js';
import { critterAdjustRads, critterKill, critterState } from './critter-model.js';
import { ageMapState, elapsedHours } from './map-aging.js';
import { MapRegistry } from './map-registry.js';
import { applySavedLocals, captureLiveMapState, restoreLiveObjects } from './map-state.js';
import type { MapStateJSON } from './save/schema.js';
import { setExitGrids } from './exit-grid.js';
import { ExtraOpsB } from './script-ops-b.js';
import { CritterStatsModel, type CritterRecord } from './critter-stats.js';
import { BattleModel } from './battle-model.js';
import * as misc from './misc-model.js';
import type { Direction } from './hexgrid.js';
import type { MessageSource } from './message-source.js';
import { findPath } from './pathfinding.js';
import { openGameFile } from './proto-cache.js';
import { DEFAULT_RULES } from './rules.js';
import { SfallBinding, type SfallBindingOptions } from './sfall-binding.js';

function latin1(b: Uint8Array): string {
  let t = '';
  for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode(...b.subarray(i, i + 8192));
  return t;
}

/** Numer listy komunikatow Generic.msg (wiersz 13 scripts.lst, liczony od 1 jak w message_str). */
const GENERIC_MSG_LIST = 14;

type Msgs = Awaited<ReturnType<MessageSource['dialog']>>;

/** Sztuczny sid skryptu mapy (typ 0 = system). */
export const MAP_SCRIPT_SID = 0x00000001;

/** Maksymalny dystans (w heksach) gracza od NPC dla talkTo (Z: oryginal liczy inaczej, wartosc szacunkowa). */
export const TALK_DISTANCE = 12;

export interface ScriptRuntimeOptions {
  vfs: VirtualFs;
  /** Zrodlo losowosci [0,1); domyslnie Math.random. */
  rng?: () => number;
  /** Czas wyswietlania floating text w tickach. */
  floatTicks?: number;
  /** Rejestr stanu odwiedzonych map (wspolny z zapisem gry); domyslnie wlasny. */
  registry?: MapRegistry;
  /** Hook hosta: odtworzenie obiektow mapy z zapisu wymagajace prototypow (nowe obiekty, ekwipunek). */
  restoreObjects?: (map: GameMap, state: MapStateJSON) => Promise<void>;
  /** Imie postaci gracza (obj_name(dude_obj) w dialogach, np. "My name's <imie>"); domyslnie puste. */
  playerName?: () => string;
  /** Druzyna: opkody party_add/party_remove zapisuja w PartyState (flagi 0x404, lista w zapisie). */
  party?: PartyState;
  /** Egzekwuj partyLimit(Charyzma) w silniku (domyslnie nie: w F2 limit sprawdzaja skrypty, Z). */
  enforcePartyLimit?: boolean;
  /** Rekord statow gracza (karta postaci); brak = domyslny (SPECIAL 5, wiek 25). */
  playerRecord?: () => CritterRecord | undefined;
  /** Podzbior sfall (domyslnie wylaczony: `enabled` nie jest true = brak opkodow i hookow). */
  sfall?: SfallBindingOptions;
  /** Generatory nazw SFX (z `@f2/audio`: charSfxName, weaponSfxName); bez nich sfx_build_* zwracaja pusty string. */
  sfxNames?: SfxNameBuilders;
  /** Odtwarzacz filmow dla play_gmovie (0x8115); Promise blokuje skrypt. Brak = film tylko zapisany w extraB.movies. */
  movie?: (file: string, num: number) => MovieOutcome | Promise<MovieOutcome>;
  /** Flagi obejrzanych filmow (17 B, slot zapisu 21, 0x596c78); domyslnie wlasne. */
  movieFlags?: Uint8Array;
}

/** Wejscie generatora nazwy efektu broni (zgodne z `WeaponSfxInput` z `@f2/audio`). */
export interface SfxWeaponInput {
  action: number;
  weaponChar: string;
  hitMode: number;
  material?: number;
  damageType?: number;
}
export interface SfxNameBuilders {
  charName(base: string, anim: number, weapon: number, extra: number): string | null;
  weaponName(input: SfxWeaponInput): string | null;
}

export interface ScriptLogEntry {
  kind: 'missingScript' | 'badScript' | 'unsupported' | 'vmError' | 'info';
  message: string;
}

/** Wpis scripts.lst: nazwa pliku i liczba zmiennych lokalnych (z komentarza `# local_vars=N`). */
interface LstEntry {
  name: string;
  localVars: number;
}

/** Indeks pola `scripts.lst index` we wpisie skryptu mapy zalezy od rozmiaru wpisu (16/17/18 u32). */
function rawScriptIndex(raw: Int32Array): number {
  return raw[3 + (raw.length - 16)] ?? -1;
}
function rawLocalOffset(raw: Int32Array): number {
  return raw[3 + (raw.length - 16) + 3] ?? -1;
}

/** Hooki dialogu publikujace stan do GameView.dialog (migawka co zmiane). */
export function createViewDialogHooks(
  view: GameView,
  opts: {
    playerIq?: () => number;
    hasEmpathy?: () => boolean;
    /** gdialog_barter: host otwiera ekran handlu z NPC (obiekt po id); mod = barter_mod w %. */
    barter?: (npcObjId: number, mod: number) => void;
    /** Kwestia NPC (gsay_reply/gsay_message): host odtwarza mowe; wolane tez bez audio (zatrzymuje poprzednia). */
    speak?: NonNullable<DialogHooks['speak']>;
    /** Rozmowa zakonczona: zatrzymaj mowe. */
    speakStop?: () => void;
  } = {},
): DialogHooks & { session: DialogSession | undefined } {
  const snap = (s: DialogState): DialogState => ({
    ...s,
    options: s.options.map((o) => ({ ...o })),
    history: s.history.map((h) => ({ ...h })),
  });
  const hooks = {
    session: undefined as DialogSession | undefined,
    start(state: DialogState, session: DialogSession) {
      hooks.session = session;
      view.dialog.value = snap(state);
    },
    update(state: DialogState) {
      view.dialog.value = snap(state);
    },
    waitForChoice() {
      if (hooks.session) view.dialog.value = snap(hooks.session.state);
    },
    end() {
      hooks.session = undefined;
      view.dialog.value = null;
      opts.speakStop?.();
    },
    playerIq: opts.playerIq ?? (() => 5),
    hasEmpathy: opts.hasEmpathy ?? (() => false),
    ...(opts.barter ? { barter: opts.barter } : {}),
    ...(opts.speak ? { speak: opts.speak } : {}),
  };
  return hooks;
}

type ViewDialogHooks = ReturnType<typeof createViewDialogHooks>;

/** Procedury obiektu wywolywane z menu akcji. */
export type ObjectProcName =
  | 'look_at_p_proc'
  | 'description_p_proc'
  | 'use_p_proc'
  | 'pickup_p_proc'
  | 'push_p_proc'
  | 'use_obj_on_p_proc'
  | 'damage_p_proc'
  | 'destroy_p_proc';

export interface ObjectProcResult {
  /** Procedura istniala i zostala uruchomiona. */
  ran: boolean;
  /** Skrypt wywolal script_overrides. */
  overridden: boolean;
  /** Wystapil blad VM. */
  error: boolean;
}

export class ScriptRuntime
  implements GameHooks, InventoryHooks, MiscHooks, CombatHooks, Batch4Hooks, BattleHooks
{
  readonly scheduler: Scheduler;
  readonly interp: Interpreter;
  readonly floating = new FloatingTexts();
  /** Diagnostyka: brakujace skrypty, bledy VM, nieobslugiwane opkody. */
  readonly log: ScriptLogEntry[] = [];
  /** Zadanie `load_map` / `override_map_start` zgloszone przez skrypt (wykonanie nalezy do hosta). */
  pendingMapLoad: { map: number | string; elevation: number } | undefined;
  /** `load_map(-1|-2)` (wyjscie na mape swiata / mape miasta); wykonanie nalezy do hosta, ktory zeruje pole. */
  pendingWorldMap: { townMap: boolean } | undefined;
  mapStartOverride: { x: number; y: number; elevation: number; rotation: number } | undefined;
  readonly dialog: DialogHooks;
  /** Hook filmow dla play_gmovie (0x8115). */
  readonly movie: MovieHooks;
  /** Flagi obejrzanych filmow (slot zapisu 21). */
  readonly movieFlags: Uint8Array;
  /** Model ekwipunku i druzyny (opkody 0x80ba, 0x8106, 0x814b itd.). */
  readonly inventory: InventoryModel;

  private map: GameMap | undefined;
  private firstRunFlag = true;
  private readonly scriptCache = new Map<string, Promise<IntScript | undefined>>();
  private readonly loaded = new Map<string, IntScript>();
  private lst: Promise<LstEntry[]> | undefined;
  private readonly msgLists = new Map<number, Msgs>();
  /** Nazwy prototypow z pro_*.msg wg typu obiektu (0 item, 1 critter, 2 scenery, 3 wall, 4 tile, 5 misc). */
  private protoNames: Msgs[] = [];
  private readonly msgListRequested = new Set<number>();
  private readonly playerNameFn: (() => string) | undefined;
  private readonly objects = new Map<number, GameObject>();
  private readonly externals = new Map<string, Value>();
  private readonly moving = new Set<GameObject>();
  private readonly rng: () => number;
  private readonly floatTicks: number;
  /** Stan opuszczonych map (zmienne, obiekty, timery) miedzy wizytami i w zapisie. */
  readonly registry: MapRegistry;
  private readonly restoreObjectsHook: ScriptRuntimeOptions['restoreObjects'];
  readonly opcodeHandlers: ReadonlyMap<number, OpHandler>;
  /** Wpiecie sfall; `enabled=false` gdy flaga wylaczona. */
  readonly sfall: SfallBinding;

  constructor(
    private readonly world: World,
    private readonly msgs: MessageSource,
    private readonly vars: GameVars,
    dialogHooks: DialogHooks,
    private readonly opts: ScriptRuntimeOptions,
  ) {
    this.dialog = dialogHooks;
    this.inventory = new InventoryModel({
      objects: this.objects,
      currentMap: () => this.currentMap(),
      player: () => this.world.player,
      ...(opts.party
        ? {
            party: new PartyScriptAdapter(
              opts.party,
              opts.enforcePartyLimit
                ? () => partyLimit(this.getCritterStat(this.world.player.id, 3), false)
                : undefined,
            ),
          }
        : {}),
    });
    this.batch4 = new Batch4Model({
      obj: (id) => this.obj(id),
      currentMap: () => this.currentMap(),
      inventory: this.inventory,
      experience: () => this.pcExperience,
    });
    this.battle = new BattleModel({
      obj: (id) => this.obj(id),
      maxHp: (o) => this.batch4.maxHp(o),
      selfOf: (inst) => this.scheduler.entryOf(inst)?.ownerObjectId ?? -1,
      setReturn: (inst, v) => void this.scriptReturn.set(inst, v),
      defaultUse: (source, target) => this.onDefaultUse?.(source, target) ?? false,
      runUseP: (source, target) => {
        const t = this.obj(target);
        const e =
          t && t.scriptId >= 0 ? this.scheduler.all().find((x) => x.sid === t.scriptId) : undefined;
        if (!e) return false;
        this.overridden.delete(e.instance);
        this.scheduler.runProc(e.sid, 'use_p_proc', { source, target });
        return this.overridden.has(e.instance);
      },
      pickup: (source, item) => this.pickupItem(source, item),
      explode: (tile, elevation, damage) => void this.explodeAt(tile, elevation, -1, damage),
      dropToGround: (ownerId, itemId) => {
        const owner = this.obj(ownerId);
        const it = this.obj(itemId);
        if (!owner || !it) return false;
        const holder = owner.inventory.includes(it);
        if (!holder) return false;
        this.inventory.rmObjFromInven(ownerId, itemId);
        it.hex = owner.hex;
        it.elevation = owner.elevation;
        const map = this.currentMap();
        map.objects.push(it);
        indexObject(map, it);
        return true;
      },
      runUseProc: (source, item, target) => {
        const t = this.obj(target);
        const e =
          t && t.scriptId >= 0 ? this.scheduler.all().find((x) => x.sid === t.scriptId) : undefined;
        if (!e) return false;
        this.overridden.delete(e.instance);
        this.currentObjBeingUsedWith = item;
        this.scheduler.runProc(e.sid, 'use_obj_on_p_proc', { source, target });
        return this.overridden.has(e.instance);
      },
    });
    this.movieFlags = opts.movieFlags ?? new Uint8Array(17);
    const playMovie = opts.movie;
    this.movie = {
      play: (file, num) => {
        if (playMovie) return playMovie(file, num);
        this.extraB.movies.push(num);
        return 'missing';
      },
      markSeen: (n) => {
        this.movieFlags[n] = 1;
      },
    };
    this.rng = opts.rng ?? Math.random;
    this.floatTicks = opts.floatTicks ?? 50;
    this.registry = opts.registry ?? new MapRegistry();
    this.restoreObjectsHook = opts.restoreObjects;
    this.playerNameFn = opts.playerName;
    this.interp = new Interpreter(this);
    this.scheduler = new Scheduler(this.interp, this, {
      onError: (error, sid, proc) =>
        this.log.push({
          kind: 'vmError',
          message: `sid ${sid.toString(16)} ${proc}: ${String(error)}`,
        }),
    });
    // kolejnosc: gameHandlers, potem kontekst i dialog (nadpisuja zastepniki z gameHandlers)
    const merged = new Map<number, OpHandler>(createGameHandlers(this.scheduler));
    for (const [k, v] of contextOpHandlers(this.scheduler, GAME_CONTEXT_OPCODES)) merged.set(k, v);
    for (const [k, v] of dialogHandlers) merged.set(k, v);
    for (const [k, v] of inventoryHandlers) merged.set(k, v);
    for (const [k, v] of miscHandlers) merged.set(k, v);
    for (const [k, v] of combatHandlers) merged.set(k, v);
    for (const [k, v] of batch4Handlers) merged.set(k, v);
    for (const [k, v] of battleHandlers) merged.set(k, v);
    for (const [k, v] of gapHandlers) merged.set(k, v);
    for (const [k, v] of movieHandlers) merged.set(k, v);
    this.sfall = new SfallBinding(opts.sfall);
    this.sfall.register(merged);
    this.opcodeHandlers = merged;
  }

  // ---- ladowanie ----

  private currentMap(): GameMap {
    return this.map ?? this.world.map;
  }

  private loadLst(): Promise<LstEntry[]> {
    this.lst ??= openGameFile(this.opts.vfs, 'scripts/scripts.lst').then((b) =>
      latin1(b)
        .split(/\r\n|\r|\n/)
        .map((line: string) => {
          const semi = line.indexOf(';');
          const head = (semi === -1 ? line : line.slice(0, semi)).trim();
          const dot = head.indexOf('.');
          const m = /local_vars\s*=\s*(\d+)/.exec(line);
          return {
            name: (dot === -1 ? head : head.slice(0, dot)).trim().toLowerCase(),
            localVars: m ? Number(m[1]) : 0,
          };
        }),
    );
    return this.lst;
  }

  /** Laduje listy komunikatow, ktore zaladowane skrypty czytaja stalymi (cudza lista, np. brahmin), zanim ruszy VM. */
  private async preloadReferencedMsgLists(): Promise<void> {
    const wanted = new Set<number>();
    for (const e of this.scheduler.all()) {
      const sc = this.loaded.get(e.script.name.toLowerCase());
      if (sc) for (const l of referencedMsgLists(sc)) if (!this.msgLists.has(l)) wanted.add(l);
    }
    await Promise.all(
      [...wanted].map(async (l) => {
        this.msgListRequested.add(l);
        const m = await this.msgs.dialog(l - 1).catch(() => undefined);
        if (m && !this.msgLists.has(l)) this.msgLists.set(l, m);
      }),
    );
  }

  private loadIntByName(name: string): Promise<IntScript | undefined> {
    const key = name.toLowerCase();
    let p = this.scriptCache.get(key);
    if (!p) {
      p = (async () => {
        try {
          const bytes = await openGameFile(this.opts.vfs, `scripts/${key}.int`);
          const buf = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          const s = parseIntScript(buf, key);
          this.loaded.set(key, s);
          return s;
        } catch (e) {
          this.log.push({ kind: 'missingScript', message: `${key}.int: ${(e as Error).message}` });
          return undefined;
        }
      })();
      this.scriptCache.set(key, p);
    }
    return p;
  }

  /** Wyrzuca instancje poprzedniej mapy (map_exit_p_proc) i buduje nowe dla `map`, potem start + map_enter. */
  /** Lista komunikatow, o ktora skrypt pyta bez zaladowanego wlasciciela (np. Generic.msg): doladuj w tle. */
  private requestMsgList(listId: number): void {
    if (listId <= 0 || this.msgListRequested.has(listId)) return;
    this.msgListRequested.add(listId);
    void this.msgs
      .dialog(listId - 1)
      .then((m) => {
        if (!this.msgLists.has(listId)) this.msgLists.set(listId, m);
      })
      .catch(() => undefined);
  }

  private async loadProtoNames(): Promise<void> {
    if (this.protoNames.length > 0) return;
    const files = ['pro_item', 'pro_crit', 'pro_scen', 'pro_wall', 'pro_tile', 'pro_misc'] as const;
    this.protoNames = await Promise.all(
      files.map((f) => this.msgs.game(f).catch(() => new Map() as Msgs)),
    );
  }

  async loadScriptsForMap(map: GameMap): Promise<void> {
    this.loadCritterArt();
    let carriedParty: GameObject[] = [];
    if (this.map) {
      // 0x483c98: kolejka zdarzen jest czyszczona (0x4a2920, typ 3 = timer skryptu) PRZED map_exit_p_proc,
      // a timery nie wracaja przy ponownej wizycie (mapa nie zapisuje kolejki). Poziom D.
      const sidsLeaving = new Set(this.scheduler.all().map((e) => e.sid));
      this.scheduler.timers.extract((sid) => sidsLeaving.has(sid));
      for (const e of this.scheduler.all()) this.scheduler.runProc(e.sid, 'map_exit_p_proc');
      // timery dodane w map_exit nie trafiaja do migawki mapy (W: zyja w globalnej kolejce, web je odrzuca)
      this.scheduler.timers.extract((sid) => sidsLeaving.has(sid));
      // towarzysze ida z graczem: zdejmowani z opuszczanej mapy przed jej migawka
      carriedParty = this.inventory.detachParty();
      // stan opuszczanej mapy (zmienne, obiekty, timery skryptow) trafia do rejestru do kolejnej wizyty
      const left = this.captureCurrentMapState();
      if (left) this.registry.snapshot(left);
    }
    for (const e of this.scheduler.all()) this.scheduler.unregister(e.sid);
    // zegar planisty = zegar gry: timery (czas bezwzgledny) musza zgadzac sie po skokach czasu
    this.scheduler.setNow(this.world.clock.ticks);
    await this.loadProtoNames();
    this.floating.clear();
    this.world.view.floatingTexts.value = [];
    this.moving.clear();
    this.msgLists.clear();
    this.msgListRequested.clear();
    // Generic.int (wiersz 13 scripts.lst, lista 14): wspolne kwestie ("Goodbye.", "Ug.") bez obiektu wlasciciela
    if (!this.msgLists.has(GENERIC_MSG_LIST)) {
      const g = await this.msgs.dialog(GENERIC_MSG_LIST - 1).catch(() => undefined);
      if (g) this.msgLists.set(GENERIC_MSG_LIST, g);
    }
    this.map = map;
    this.firstRunFlag = !this.visitedMaps.has(map.name.toUpperCase());
    this.visitedMaps.add(map.name.toUpperCase());
    const saved = this.registry.get(map.name);
    let revisit: MapStateJSON | null = null;
    if (saved) {
      // powrot na mape: starzenie wg czasu nieobecnosci (time.md), potem odtworzenie obiektow i zmiennych
      revisit = ageMapState(saved, elapsedHours(this.world.clock.ticks, saved.lastVisitTick), {
        playerId: this.world.player.id,
      });
      if (this.restoreObjectsHook) await this.restoreObjectsHook(map, revisit);
      restoreLiveObjects(map, revisit, this.world.player.id);
    }
    this.objects.clear();
    // id obiektow sa unikalne (MapLoader.uniquifyObjectIds); skrypt wiaze sie z obiektem przez sid
    for (const o of map.objects) this.objects.set(o.id, o);
    if (!this.objects.has(this.world.player.id))
      this.objects.set(this.world.player.id, this.world.player);
    this.inventory.attachParty(carriedParty);
    this.inventory.registerInventories([...map.objects, this.world.player]);

    const lst = await this.loadLst();
    const bySid = new Map<number, GameObject>();
    for (const o of map.objects) if (o.scriptId !== -1) bySid.set(o.scriptId, o);

    // skrypt mapy (naglowek, 1-bazowy indeks scripts.lst): tworzony pierwszy, bo eksportuje zmienne zewnetrzne
    const mapScriptIdx = map.header.scriptId - 1;
    const mapEntry = mapScriptIdx >= 0 ? lst[mapScriptIdx] : undefined;
    if (mapEntry?.name) {
      const script = await this.loadIntByName(mapEntry.name);
      if (script) {
        const e = this.scheduler.create({
          sid: MAP_SCRIPT_SID,
          script,
          ownerObjectId: -1,
          localVarCount: mapEntry.localVars,
        });
        e.localVars.set(map.localVars.subarray(0, mapEntry.localVars));
        if (revisit) applySavedLocals(e, revisit);
        const msgs = await this.msgs.dialog(mapScriptIdx).catch(() => undefined);
        if (msgs) this.msgLists.set(mapScriptIdx + 1, msgs);
      }
    }

    for (const ref of map.scripts) {
      const sid = ref.raw[0] ?? ref.scriptId;
      const index = rawScriptIndex(ref.raw);
      const entry = lst[index];
      if (!entry || !entry.name) {
        this.log.push({
          kind: 'missingScript',
          message: `sid ${sid.toString(16)}: indeks ${index} poza scripts.lst`,
        });
        continue;
      }
      const script = await this.loadIntByName(entry.name);
      if (!script) continue;
      const owner = bySid.get(sid);
      const typeBits = sid >>> 24;
      if ((typeBits === 3 || typeBits === 4) && !owner) {
        this.log.push({
          kind: 'info',
          message: `sid ${sid.toString(16)} (${entry.name}): brak obiektu wlasciciela`,
        });
        continue;
      }
      const e = this.scheduler.create({
        sid,
        script,
        ownerObjectId: owner ? owner.id : -1,
        localVarCount: entry.localVars,
      });
      const off = rawLocalOffset(ref.raw);
      if (off >= 0 && entry.localVars > 0)
        e.localVars.set(map.localVars.subarray(off, off + entry.localVars));
      if (revisit) applySavedLocals(e, revisit);
      const msgs = await this.msgs.dialog(index).catch(() => undefined);
      // message_str(list, id): list = numer wiersza scripts.lst liczony od 1 (zweryfikowane na ACKlint = 751)
      if (msgs) this.msgLists.set(index + 1, msgs);
    }
    await this.preloadReferencedMsgLists();
    this.scheduler.runStartAll();
    this.scheduler.runMapEnterAll();
  }

  /**
   * Migawka zywej mapy ze stanem skryptow (zmienne lokalne, timery). `takeTimers` zdejmuje timery z
   * planisty (opuszczanie mapy); bez niego zostaja (zapis gry na biezacej mapie).
   */
  captureCurrentMapState(takeTimers = false): MapStateJSON | null {
    const map = this.map;
    if (!map) return null;
    const sids = new Set(this.scheduler.all().map((e) => e.sid));
    const pred = (sid: number): boolean => sids.has(sid);
    const timers = takeTimers
      ? this.scheduler.timers.extract(pred)
      : this.scheduler.timers.snapshot(pred);
    return captureLiveMapState(map, this.world.clock.ticks, {
      playerId: this.world.player.id,
      maxHp: (o) => this.batch4.maxHp(o),
      scripts: this.scheduler.all(),
      timers,
    });
  }

  /**
   * Wczytanie zapisu na tej samej mapie: nadpisuje zmienne lokalne skryptow i timery stanem z zapisu
   * (obiekty odtwarza host). Timery zywej mapy sa zastepowane zapisanymi.
   */
  applySavedScriptState(state: MapStateJSON): void {
    for (const e of this.scheduler.all()) applySavedLocals(e, state);
    this.scheduler.timers.extract(() => true);
    this.scheduler.timers.restore((state.timers ?? []).filter((t) => this.scheduler.get(t.sid)));
    if (state.mvars?.length && this.map) this.map.globalVars = Int32Array.from(state.mvars);
  }

  /** Po skoku czasu poza tick() (odpoczynek, podroz): zegar planisty = zegar gry, przeterminowane timery odpalaja. */
  syncClock(): void {
    this.scheduler.jumpTo(this.world.clock.ticks);
  }

  // ---- czas ----

  tick(ticks: number): void {
    this.scheduler.tick(ticks);
    for (const o of [...this.moving]) {
      if (this.world.movement.stateOf(o) === undefined) {
        this.moving.delete(o);
        continue;
      }
      this.world.movement.tick(o, ticks);
      if (this.world.movement.stateOf(o) === undefined) this.moving.delete(o);
    }
    if (this.floating.prune(this.scheduler.now))
      this.world.view.floatingTexts.value = this.floating.list();
  }

  // ---- interakcja ----

  talkTo(objId: number): Result {
    const o = this.objects.get(objId);
    const player = this.world.player;
    if (!o || o.scriptId === -1) return fail('noScript');
    const e = this.scheduler.get(o.scriptId);
    if (!e) return fail('noScript');
    if (this.world.view.dialog.value !== null) return fail('busy');
    if (o.elevation !== player.elevation || hexDistance(player.hex, o.hex) > TALK_DISTANCE)
      return fail('tooFar');
    if (!e.script.procs.some((p) => p.name === 'talk_p_proc' && p.bodyOffset > 0))
      return fail('noDialog');
    const errs = this.log.length;
    this.scheduler.runProc(o.scriptId, 'talk_p_proc', { source: player.id, target: o.id });
    this.scheduler.flush();
    if (this.log.slice(errs).some((l) => l.kind === 'vmError')) return fail('scriptError');
    return this.world.view.dialog.value === null ? fail('noDialog') : ok();
  }

  /** Czy skrypt obiektu ma zaimplementowana procedure (cialo > 0). */
  hasObjectProc(objId: number, proc: ObjectProcName): boolean {
    const o = this.objects.get(objId);
    if (!o || o.scriptId === -1) return false;
    const e = this.scheduler.get(o.scriptId);
    return !!e && e.script.procs.some((p) => p.name === proc && p.bodyOffset > 0);
  }

  /**
   * Menu akcji: uruchamia procedure obiektu (look_at_p_proc, use_p_proc, pickup_p_proc, push_p_proc ...).
   * `overridden` = skrypt zawolal script_overrides (domyslne zachowanie ma byc pominiete).
   */
  runObjectProc(
    proc: ObjectProcName,
    objId: number,
    sourceId: number,
    targetArg: number = objId,
  ): ObjectProcResult {
    const o = this.objects.get(objId);
    if (!o || !this.hasObjectProc(objId, proc))
      return { ran: false, overridden: false, error: false };
    const e = this.scheduler.get(o.scriptId)!;
    const errs = this.log.length;
    this.overridden.delete(e.instance);
    this.scheduler.runProc(o.scriptId, proc, { source: sourceId, target: targetArg });
    this.scheduler.flush();
    return {
      ran: true,
      overridden: this.overridden.has(e.instance),
      error: this.log.slice(errs).some((l) => l.kind === 'vmError'),
    };
  }

  /**
   * Punkt wejscia walki/wybuchow: obiekt `targetId` dostaje trafienie rodzaju `damageType` (DamageType: 6 = wybuch).
   * Ustawia `weaponDamageType` (metarule 49) na czas damage_p_proc celu i przywraca poprzednia wartosc.
   * Kto/ile obrazen i kiedy wolac = silnik walki (M4); tu tylko wywolanie procedury. Z: zrodlo pola w exe.
   */
  applyHit(targetId: number, sourceId: number, damageType: number): ObjectProcResult {
    const prev = this.weaponDamageType;
    this.weaponDamageType = damageType;
    try {
      return this.runObjectProc('damage_p_proc', targetId, sourceId);
    } finally {
      this.weaponDamageType = prev;
    }
  }

  /**
   * Obrazenia krytera w walce (0x425020, D; wolane z 0x424c04 po ataku): odejmuje HP, wola damage_p_proc (proc 14),
   * a gdy krytter zginal: destroy_p_proc (proc 18) z source_obj = atakujacy, potem (XP w hoscie) usuniecie skryptu
   * (scr_remove 0x4a61d4, scriptId = -1). kill_critter (0x42da64) tej sciezki NIE uzywa (brak destroy, D).
   * Dzieki temu smierc Horrigana (qcfrank) ustawia GVAR_ENCLAVE_FRANK_DEAD i otwiera wyjscia ENCFITE.
   */
  applyCombatDamage(targetId: number, attackerId: number, damage: number): { died: boolean } {
    const o = this.obj(targetId);
    if (!o || o.extra?.kind !== 'critter' || damage <= 0) return { died: false };
    const before = this.battle.deaths.length;
    this.battle.critterDamage(targetId, damage);
    const died = this.battle.deaths.length > before;
    if (!died) {
      this.runObjectProc('damage_p_proc', targetId, attackerId, targetId);
      return { died: false };
    }
    this.runObjectProc('destroy_p_proc', targetId, attackerId, targetId);
    if (o.scriptId !== -1) {
      this.scheduler.unregister(o.scriptId);
      o.scriptId = -1;
    }
    return { died: true };
  }

  /**
   * Atak bronia w obiekt nie-kryter (0x424c04, D): damage_p_proc celu dostaje source_obj = atakujacy,
   * target_obj = BRON, a metarule 49 = typ obrazen broni. Tak niszczy sie np. mur 0x20003a4 (aibkdor.int:
   * `metarule(49, target_obj) == 6` = Explosion). Zwykly ladunek (misc) nie jest bronia i tej sciezki nie uzywa.
   */
  applyWeaponHit(
    targetId: number,
    attackerId: number,
    weaponId: number,
    damageType: number,
  ): ObjectProcResult {
    const prev = this.weaponDamageType;
    this.weaponDamageType = damageType;
    try {
      return this.runObjectProc('damage_p_proc', targetId, attackerId, weaponId);
    } finally {
      this.weaponDamageType = prev;
    }
  }

  /**
   * Wybuch ladunku (0x412cf4 + 0x423c10, D): cel centralny to tylko ZYWY kryter na kaflu (obiekty nie-krytery,
   * np. drzwi, NIE dostaja damage_p_proc); dodatkowe cele = do 6 zywych, widocznych krytterow na pierscieniach
   * 1..3 (kolejnosc wewnatrz pierscienia = Z). Kazdy dostaje `damage` HP. Zwraca id trafionych krytterow.
   */
  blastCritters(tile: number, elevation: number, damage: number): number[] {
    const live = (o: GameObject): boolean =>
      o.elevation === elevation && o.extra?.kind === 'critter' && critterState(o) !== 1;
    const hit: number[] = [];
    const all = [...this.objects.values()].filter(live);
    for (const o of all) if (hexDistance(o.hex, tile) === 0) hit.push(o.id);
    let extras: number[] = [];
    for (let r = 1; r <= EXPLOSION_MAX_RADIUS; r++) {
      for (const o of all) {
        if (hexDistance(o.hex, tile) !== r) continue;
        const ok = isExplosionVictimEligible({
          isCritter: true,
          dead: false,
          hidden: !!o.hidden,
          blocked: false,
        });
        if (ok) extras = addExplosionExtra(extras, o.id);
      }
    }
    hit.push(...extras);
    for (const id of hit) this.battle.critterDamage(id, damage);
    return hit;
  }

  /**
   * Wybuch (typ 6): obiekty na kaflu centralnym + do 6 zywych, widocznych krytterow na pierscieniu 1 heksa
   * (limit/filtr 0x423c10 = D, geometria pierscieni = Z). Najpierw obrazenia HP krytterow (`damage` > 0), potem
   * damage_p_proc kazdego trafionego obiektu z `weaponDamageType` = 6 (kolejnosc wzgledem odjecia HP = Z).
   * Zwraca id obiektow, ktorych damage_p_proc sie wykonal.
   */
  explodeAt(tile: number, elevation: number, sourceId = -1, damage = 0): number[] {
    const targets: GameObject[] = [];
    let extras: number[] = [];
    for (const o of [...this.objects.values()]) {
      if (o.elevation !== elevation) continue;
      const d = hexDistance(o.hex, tile);
      if (d === 0) targets.push(o);
      else if (d === 1) {
        const ok = isExplosionVictimEligible({
          isCritter: o.extra?.kind === 'critter',
          dead: critterState(o) === 1,
          hidden: !!o.hidden,
          blocked: false,
        });
        if (ok) extras = addExplosionExtra(extras, o.id);
      }
    }
    for (const id of extras) {
      const o = this.objects.get(id);
      if (o) targets.push(o);
    }
    const hit: number[] = [];
    for (const o of targets) {
      if (damage > 0 && o.extra?.kind === 'critter') this.battle.critterDamage(o.id, damage);
      if (this.applyHit(o.id, sourceId, 6).ran) hit.push(o.id);
    }
    return hit;
  }

  /**
   * pickup_obj (0x4564d4 -> 0x412134, D): cel musi byc przedmiotem (typ 0); pickup_p_proc celu moze nadpisac
   * akcje (nic nie jest podnoszone); limit udzwigu (0x477158) daje -6 i komunikat 0x389 (`onPickupBlocked`);
   * inaczej przedmiot trafia do ekwipunku (kapsle = ilosc stosu). Limit udzwigu liczy host (`canCarry`, brak = bez limitu, Z).
   * Zwraca 0 ok / 1 nadpisane skryptem / -6 za ciezki / -1 niepoprawny cel.
   */
  pickupItem(sourceId: number, itemId: number): number {
    const it = this.objects.get(itemId);
    if (!it || it.type !== 0 || !this.objects.has(sourceId)) return -1;
    const r = this.runObjectProc('pickup_p_proc', itemId, sourceId);
    if (r.ran && r.overridden) return 1;
    if (this.canCarry && !this.canCarry(sourceId, itemId)) {
      this.onPickupBlocked?.(sourceId, 0x389);
      return -6;
    }
    this.inventory.addObjToInven(sourceId, itemId);
    return 0;
  }
  /** Hook hosta: czy `who` udzwignie przedmiot (limit udzwigu 0x477158). */
  canCarry?: (who: number, item: number) => boolean;
  /** Hook hosta: komunikat odmowy (id wiersza msg, 0x389 = za ciezki). */
  onPickupBlocked?: (who: number, msgId: number) => void;

  /** Uzycie przedmiotu na obiekcie (use_obj_on_p_proc celu, `obj_being_used_with` = przedmiot). */
  useItemOn(sourceId: number, itemId: number, targetId: number): ObjectProcResult {
    const o = this.objects.get(targetId);
    if (!o || !this.hasObjectProc(targetId, 'use_obj_on_p_proc'))
      return { ran: false, overridden: false, error: false };
    const e = this.scheduler.get(o.scriptId)!;
    const errs = this.log.length;
    this.overridden.delete(e.instance);
    this.currentObjBeingUsedWith = itemId;
    this.scheduler.runProc(o.scriptId, 'use_obj_on_p_proc', { source: sourceId, target: targetId });
    this.scheduler.flush();
    return {
      ran: true,
      overridden: this.overridden.has(e.instance),
      error: this.log.slice(errs).some((l) => l.kind === 'vmError'),
    };
  }

  private dialogSession(): DialogSession | undefined {
    return (this.dialog as Partial<ViewDialogHooks>).session;
  }

  dialogChoose(index: number): Result {
    const s = this.dialogSession();
    if (!s || !s.isWaiting) return fail('noDialog');
    const opt = s.state.options[index];
    if (!opt || !opt.visible) return fail('badOption');
    return this.guardDialog(() => s.choose(index));
  }

  dialogClose(): Result {
    const s = this.dialogSession();
    if (!s) return fail('noDialog');
    return this.guardDialog(() => s.close());
  }

  private guardDialog(fn: () => void): Result {
    try {
      fn();
    } catch (e) {
      this.log.push({ kind: 'vmError', message: `dialog: ${String(e)}` });
      this.scheduler.flush();
      return fail('scriptError');
    }
    this.scheduler.flush();
    return ok();
  }

  // ---- Hooks (interpreter) ----

  private entry(instance: ScriptInstance): ScriptEntry | undefined {
    return this.scheduler.entryOf(instance);
  }

  getLocalVar(instance: ScriptInstance, index: number): number {
    return this.entry(instance)?.localVars[index] ?? 0;
  }
  setLocalVar(instance: ScriptInstance, index: number, value: number): void {
    const e = this.entry(instance);
    if (!e || index < 0) return;
    if (index >= e.localVars.length) {
      const next = new Int32Array(index + 1);
      next.set(e.localVars);
      e.localVars = next;
    }
    e.localVars[index] = value | 0;
  }
  getMapVar(_i: ScriptInstance, index: number): number {
    return this.currentMap().globalVars[index] ?? 0;
  }
  setMapVar(_i: ScriptInstance, index: number, value: number): void {
    const g = this.currentMap().globalVars;
    if (index >= 0 && index < g.length) g[index] = value | 0;
  }
  getGlobalVar(index: number): number {
    return this.vars.get(index);
  }
  setGlobalVar(index: number, value: number): void {
    this.vars.set(index, value);
  }
  exportVar(name: string): void {
    const key = name.toLowerCase();
    if (!this.externals.has(key)) this.externals.set(key, int(0));
  }
  /** Nazwy zmiennych zewnetrznych bez rozrozniania wielkosci liter (D: 0x4410ac haszuje male litery, 0x4dece6 = stricmp). */
  getExternal(name: string): Value | undefined {
    return this.externals.get(name.toLowerCase());
  }
  setExternal(name: string, value: Value): void {
    this.externals.set(name.toLowerCase(), value);
  }
  nowMs(): number {
    return Date.now();
  }

  /** Synchroniczne: dziala tylko dla skryptow zaladowanych wczesniej (cache loadScriptsForMap). */
  execScript(req: {
    mode: string;
    name: string;
    parent: ScriptInstance;
  }): ScriptInstance | undefined {
    const script = this.loaded.get(req.name.toLowerCase().replace(/\.int$/, ''));
    if (!script) {
      this.log.push({
        kind: 'missingScript',
        message: `execScript ${req.name}: skrypt nie zaladowany`,
      });
      return undefined;
    }
    const parent = this.entry(req.parent);
    const sid = this.freeChildSid();
    return this.scheduler.adopt({ sid, script, ownerObjectId: parent?.ownerObjectId ?? -1 })
      .instance;
  }

  private nextChild = 0x7f000000;
  private freeChildSid(): number {
    while (this.scheduler.get(this.nextChild)) this.nextChild++;
    return this.nextChild++;
  }

  // ---- GameHooks ----

  /** Obiekt o danym id (public dla modulow silnika, np. explosives). */
  getObject(id: number): GameObject | undefined {
    return this.objects.get(id);
  }
  /** Obiekt, w ktorego ekwipunku jest przedmiot (undefined gdy lezy na ziemi). */
  ownerOfItem(item: GameObject): GameObject | undefined {
    for (const o of this.objects.values()) if (o.inventory.includes(item)) return o;
    return undefined;
  }
  private obj(id: number): GameObject | undefined {
    return this.objects.get(id);
  }

  objPid(id: number): number {
    return this.obj(id)?.pid ?? -1;
  }
  objName(id: number): string {
    const o = this.obj(id);
    if (!o) return '';
    if (o === this.world.player && this.playerNameFn) return this.playerNameFn();
    const textId = (o.proto as { textId?: number } | undefined)?.textId;
    if (textId === undefined) return '';
    return this.protoNames[o.type]?.get(textId)?.text ?? '';
  }
  dudeObj(): number {
    return this.world.player.id;
  }
  objType(id: number): number {
    return this.obj(id)?.type ?? -1;
  }
  objHex(id: number): number {
    return this.obj(id)?.hex ?? -1;
  }
  objElevation(id: number): number {
    return this.obj(id)?.elevation ?? 0;
  }
  moveTo(id: number, hex: number, elevation: number): void {
    const o = this.obj(id);
    if (!o) return;
    moveObject(this.currentMap(), o, hex, elevation);
  }
  animateMoveToHex(id: number, hex: number, run: boolean): void {
    const o = this.obj(id);
    if (!o) return;
    const map = this.currentMap();
    const path = findPath(map, o.elevation, o.hex, hex, o, {
      rules: this.world.rules ?? DEFAULT_RULES,
    });
    if (!path || path.length === 0) return;
    this.world.movement.cancel(o);
    if (this.world.movement.start(o, path, run).ok && o !== this.world.player) this.moving.add(o);
  }
  animateStand(id: number): void {
    const o = this.obj(id);
    if (o) this.world.movement.cancel(o);
  }
  animateRotation(id: number, dir: number): void {
    const o = this.obj(id);
    if (o) o.rotation = (((dir % 6) + 6) % 6) as Direction;
  }
  tileDistance(a: number, b: number): number {
    return hexDistance(a, b);
  }
  tileInDirection(h: number, d: number, n: number): number {
    return hexInDirection(h, (((d % 6) + 6) % 6) as Direction, n);
  }
  tileContainsObjPid(h: number, e: number, pid: number): number {
    return objectsAt(this.currentMap(), e, h).some((o) => o.pid === pid) ? 1 : 0;
  }
  tileObjByPid(h: number, e: number, pid: number): number {
    return objectsAt(this.currentMap(), e, h).find((o) => o.pid === pid)?.id ?? -1;
  }
  /**
   * critter_add_trait 0x458a54 (D): kind 0 = perk (amount != 0 dodaje range 0x496a9c, 0 zdejmuje jedna 0x496afc),
   * kind 1 = obiekt (trait 5 = pakiet AI, 6 = team); zawsze zwraca -1.
   */
  critterAddTrait(id: number, kind: number, trait: number, amount: number): number {
    const o = this.obj(id);
    const r = this.critters.record(o);
    if (!r) {
      this.note('critter_add_trait');
      return -1;
    }
    if (kind === 0) {
      if (amount !== 0) this.critters.addPerk(o, trait);
      else if (this.critters.perkRank(o, trait) > 0) this.critters.removePerk(o, trait, 1);
    } else if (kind === 1) {
      if (trait === 5) r.aiPacket = amount;
      else if (trait === 6) r.team = amount;
      else this.note('critter_add_trait');
    } else this.note('critter_add_trait');
    return -1;
  }
  /** get_critter_stat 0x455c10 (D): f2_stat_level krytera (wszystkie staty, takze pochodne); brak krytera = -1. */
  getCritterStat(id: number, stat: number): number {
    return this.critters.getStat(this.obj(id), stat);
  }
  /** set_critter_stat 0x455ccc -> f2_stat_set_base 0x4af4bc. */
  setCritterStat(id: number, stat: number, v: number): number {
    // stat 0x25 (Current Radiation) gracza: f2_stat_set_base liczy delta = v - biezaca i woła 0x42d3a4 (D)
    if (stat === 37 && this.playerRadiation && this.obj(id) === this.world.player) {
      this.playerRadiation.add(v - this.playerRadiation.level());
      return 0;
    }
    return this.critters.setStat(this.obj(id), stat, v);
  }
  floatMsg(id: number, text: string, color: number): void {
    if (!this.obj(id)) return;
    this.floating.add(id, text, color, this.scheduler.now, this.floatTicks);
    this.world.view.floatingTexts.value = this.floating.list();
  }
  displayMsg(text: string): void {
    const v = this.world.view.notifications;
    v.value = [...v.value, text];
  }
  /** Pole audio wpisu MSG (nazwa pliku mowy bez rozszerzenia); undefined gdy brak listy/wpisu/audio. */
  messageAudio(listId: number, msgId: number): string | undefined {
    const a = this.msgLists.get(listId)?.get(msgId)?.audio.trim();
    return a ? a : undefined;
  }
  messageStr(listId: number, msgId: number): string {
    const list = this.msgLists.get(listId);
    if (!list) this.requestMsgList(listId);
    return list?.get(msgId)?.text ?? '';
  }
  random(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  }
  gameTime(): number {
    return this.world.clock.gameTime();
  }
  gameTimeHour(): number {
    const secs = Math.floor(this.world.clock.ticks / 10) % 86400;
    return Math.floor(secs / 3600) * 100 + Math.floor((secs % 3600) / 60);
  }
  /** Data gry: start 25.07.2241 (Z: dokladna data startu oryginalu niepotwierdzona), 864000 tikow na dobe. */
  private gameDate(): { month: number; day: number } {
    const days = Math.floor(this.world.clock.ticks / 864000);
    let y = 2241;
    let m = 7;
    let d = 25 + days;
    for (;;) {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 31;
      if (d <= len) break;
      d -= len;
      if (++m > 12) {
        m = 1;
        y++;
      }
    }
    return { month: m, day: d };
  }
  gameMonth(): number {
    return this.gameDate().month;
  }
  gameDay(): number {
    return this.gameDate().day;
  }
  /**
   * has_trait 0x458180 (D): kind 0 = ranga perku, 1 = wlasciwosc obiektu (5 pakiet AI, 6 team, 10 rotacja),
   * 2 = trait gracza (0..15). Pole 0x29a (kind 1) = widocznosc (bit Hidden); 0x29d niemodelowane (Z) = 0.
   */
  hasTrait(kind: number, id: number, trait: number): number {
    const o = this.obj(id);
    if (!o) return 0;
    if (kind === 0) return this.critters.perkRank(o, trait);
    if (kind === 2) return this.critters.playerTrait(o, trait);
    if (kind !== 1) return 0;
    if (trait === 10) return o.rotation ?? 0;
    const r = this.critters.record(o);
    if (trait === 5) return r?.aiPacket ?? 0;
    if (trait === 6) return r?.team ?? 0;
    // 0x29a (666) = OBJECT_VISIBILITY, makro `self_visible`/`obj_is_visible_flag`: 1 gdy obiekt nie ma bitu Hidden.
    // Stoi na wejsciu critter_p_proc prawie kazdego NPC (bez tego cala logika krytera byla pomijana).
    if (trait === 0x29a) return (o.flags & 1) === 0 ? 1 : 0;
    return 0;
  }
  objArtFid(id: number): number {
    return this.obj(id)?.fid ?? -1;
  }
  gameTicks(): number {
    return this.world.clock.gameTime();
  }
  addTimerEvent(sid: number, ticks: number, fixedParam: number): void {
    this.scheduler.addTimerEvent(sid, ticks, fixedParam);
  }
  rmTimerEvent(sid: number): void {
    this.scheduler.rmTimerEvent(sid);
  }
  protoData(): number {
    this.note('proto_data');
    return 0;
  }
  createObject(pid: number, hex: number, elevation: number, sid: number): number {
    if (hex < 0 || hex >= 40000 || elevation < 0 || elevation > 2) return -1;
    const loader = this.world.loader as { spawn?: MapLoader['spawn'] };
    if (!loader.spawn) return this.unsupported('create_object') && -1;
    const o = loader.spawn(pid, hex, elevation as 0 | 1 | 2, (id) => this.objects.has(id));
    const map = this.currentMap();
    map.objects.push(o);
    indexObject(map, o);
    this.objects.set(o.id, o);
    // skrypt nowego obiektu (sid = numer wiersza scripts.lst liczony od 1): ladowany asynchronicznie, start w najblizszym tick/flush
    if (sid > 0) this.pendingSpawns.push(this.attachSpawnScript(o, sid));
    return o.id;
  }
  /** Skrypty obiektow utworzonych przez create_object_sid (ladowanie .int jest asynchroniczne). */
  private readonly pendingSpawns: Promise<void>[] = [];
  private nextSpawnSid = 0x00100000;
  /** Czeka na dolaczenie skryptow nowo utworzonych obiektow (testy, hosty). */
  async settleSpawns(): Promise<void> {
    while (this.pendingSpawns.length) await this.pendingSpawns.shift();
  }
  private async attachSpawnScript(o: GameObject, sid: number): Promise<void> {
    const lst = await this.loadLst();
    const entry = lst[sid - 1];
    if (!entry?.name) {
      this.log.push({
        kind: 'missingScript',
        message: `create_object_sid: indeks ${sid} poza scripts.lst`,
      });
      return;
    }
    const script = await this.loadIntByName(entry.name);
    if (!script) return;
    // typ skryptu wg typu obiektu: item 2, critter 4, scenery 3 (reszta 3)
    const t = o.type === 1 ? 4 : o.type === 0 ? 2 : 3;
    let newSid = (t << 24) | this.nextSpawnSid++;
    while (this.scheduler.get(newSid)) newSid = (t << 24) | this.nextSpawnSid++;
    o.scriptId = newSid;
    this.scheduler.adopt({
      sid: newSid,
      script,
      ownerObjectId: o.id,
      localVarCount: entry.localVars,
    });
    const msgs = await this.msgs.dialog(sid - 1).catch(() => undefined);
    if (msgs) this.msgLists.set(sid, msgs);
  }
  destroyObject(id: number): void {
    const o = this.obj(id);
    if (!o || o === this.world.player) return;
    const map = this.currentMap();
    // przedmiot w ekwipunku (np. holodysk Lynette, 0x152): zdejmij z kontenera, inaczej zostaje "duchem"
    for (const holder of [this.world.player, ...map.objects]) {
      if (holder.inventory?.length) this.inventory.rmObjFromInven(holder.id, id);
    }
    moveObject(map, o, -1);
    map.objects = map.objects.filter((x) => x !== o);
    this.objects.delete(id);
    this.moving.delete(o);
    this.world.movement.cancel(o);
    if (o.scriptId !== -1) this.scheduler.unregister(o.scriptId);
  }
  loadMap(mapIndexOrName: number | string, startElevation: number): void {
    this.pendingMapLoad = { map: mapIndexOrName, elevation: startElevation };
  }
  /**
   * Konsumuje zadanie load_map (0x80e4) dla hosta: rozwiazuje indeks mapy resolverem (maps.txt), dolacza
   * nadpisanie startu (override_map_start: hex = y * 200 + x). Brak zadania lub nieznana mapa => undefined.
   */
  takeMapLoad(
    resolveIndex: (index: number) => string | undefined,
  ): { name: string; hex?: number; elevation?: number } | undefined {
    const req = this.pendingMapLoad;
    if (!req) return undefined;
    this.pendingMapLoad = undefined;
    const o = this.mapStartOverride;
    this.mapStartOverride = undefined;
    // skrypty podaja nazwe z rozszerzeniem ("DNSlvRun.map", dcmetzge); loader przyjmuje nazwe bez
    const name =
      typeof req.map === 'string' ? req.map.replace(/\.map$/i, '') : resolveIndex(req.map);
    if (!name) return undefined;
    return o ? { name, hex: o.y * 200 + o.x, elevation: o.elevation } : { name };
  }
  overrideMapStart(x: number, y: number, elevation: number, rotation: number): void {
    this.mapStartOverride = { x, y, elevation, rotation };
  }
  gfade(): void {}
  playSfx(): void {}
  /** Swiatlo ustawione przez skrypt (set_light_level), ulamek 0.25..1; undefined = skrypt nie ustawil. */
  scriptLightLevel: number | undefined = undefined;
  /** Host (render) dostaje zmiane swiatla od razu. */
  onLightLevel: ((ambient: number) => void) | undefined = undefined;
  setLightLevel(level: number): void {
    // exe: clamp 0x4000..0x10000 (render-order.md); ulamek 0.25..1
    const v = Math.min(0x10000, Math.max(0x4000, Math.trunc(Number(level) || 0))) / 0x10000;
    this.scriptLightLevel = v;
    this.onLightLevel?.(v);
  }
  /** Mapy odwiedzone w tej sesji (metarule 14 TEST_FIRSTRUN: 1 przy pierwszym wejsciu na mape). */
  readonly visitedMaps = new Set<string>();
  /** Numery umiejetnosci oznaczonych jako tag gracza (metarule 40); host ustawia wg postaci. */
  taggedSkills: ReadonlySet<number> = new Set();
  /** Wartosc zwrotna skryptu zapisana przez scr_return (0x80a2, [script+0x28]); odczyt: returnValueOf. */
  private readonly scriptReturn = new WeakMap<ScriptInstance, number>();
  returnValueOf(instance: ScriptInstance): number {
    return this.scriptReturn.get(instance) ?? 0;
  }
  /** Srodek kamery (kafel; tile_set_center = metarule3 108, [0x66be34]); domyslnie srodek mapy. */
  cameraCenter = 20100;
  /** Indeksy map znanych (metarule 19 MAP_KNOWN, Z: oryginal czyta flage z tablicy map swiata); ustawia host. */
  readonly knownMaps = new Set<number>();
  /** True gdy trwa ladowanie zapisu gry (metarule 22 IS_LOADGAME); ustawiane przez hosta. */
  loadingSave = false;
  /** Znane obszary mapy swiata: area -> stan (mark_area_known, metarule 17). */
  readonly knownAreas = new Map<number, number>();
  /** Obszar samochodu gracza (metarule 30), -1 gdy brak; stan poczatkowy z 0x4bc984. */
  get carArea(): number {
    return this.car.parkedArea;
  }
  set carArea(v: number) {
    this.car.parkedArea = v;
    if (v >= 0) this.car.owned = true;
  }
  /** Stan samochodu gracza (Zadanie 36): paliwo/obszar/bagaznik; carFuel i carArea sa jego widokiem. */
  readonly car: CarState = (() => {
    const c = new CarState();
    c.fuel = CAR_FUEL_MAX;
    return c;
  })();
  /** Flaga ruchu samochodu ([0x672e64], ustawiana przez metarule 31). */
  carMoving = false;
  /** Wartosc zapisana metarule 52 (pole +0x24 protoz pid 0x1c7), czytana metarule 53. */
  metarule52Value = 0;
  /** Rodzaj obrazen ostatniego trafienia (metarule 49 WEAPON_DAMAGE_TYPE, 6 = wybuch); host ustawia przy damage_p_proc, Z: zrodlo w exe niezbadane. */
  weaponDamageType = 0;
  /** Premie statystyk gracza z sfall 0x815b/0x815d. */
  readonly pcExtraStats = new Map<number, number>();
  /** Paliwo samochodu (metarule3 110); poczatkowo 80000 (0x13880, 0x4bc999). */
  get carFuel(): number {
    return this.car.fuel;
  }
  set carFuel(v: number) {
    this.car.fuel = v;
  }
  /** Stany podkafli mapy swiata (metarule3 105), klucz `x,y` we wspolrzednych swiata; brak wpisu = 0 (Z: znaczenie wartosci). Ustawia host. */
  readonly subtileStates = new Map<string, number>();
  /** Poziom przemocy z fallout2.cfg (violence_level, 0-3), metarule 48; domyslnie 3 (maksymalny). */
  violenceLevel = 3;
  /** Filtr wulgaryzmow z fallout2.cfg (language_filter), metarule 47; domyslnie 0. */
  languageFilter = 0;
  /** Pozycja gracza na mapie swiata (metarule 44 = x, 45 = y; 0x4c47a4); ustawiana przez hosta. */
  worldX = 0;
  worldY = 0;
  /** Obszar mapy swiata, w ktorym jest gracz (metarule 46; 0x4c47c0, -1 = blad); ustawiane przez hosta. */
  currentTown = 0;
  /** Pozycje obszarow mapy swiata ustawione przez wm_area_set_pos (0x80e5 -> 0x4c4710): area -> {x, y}. */
  readonly areaPositions = new Map<number, { x: number; y: number }>();
  /**
   * Zakonczenie gry zgloszone przez skrypt: metarule 13 = METARULE_SIGNAL_END_GAME (W: naglowek skryptow F2;
   * oryginal ustawia flage wyjscia z petli gry, potem pokaz slajdow 0x43f788 i napisy). Host czyta flage i odpala EndgameFlow.run.
   */
  endGameRequested = false;
  /** Smierc gracza z poziomu skryptu (kill_critter na graczu); host odpala EndgameFlow.runDeath. */
  playerDeathRequested = false;
  /** Opcjonalne powiadomienia hosta (wywolywane raz, przy pierwszym zgloszeniu). */
  onEndGame?: () => void;
  onPlayerDeath?: () => void;
  /**
   * Radiacja gracza po stronie hosta (sesja: odpornosc, flaga polnocy, komunikaty; 0x42d3a4). Gdy ustawione,
   * radiation_inc/dec i set_critter_stat(stat 0x25) na graczu ida tym torem zamiast do licznika obiektu.
   */
  playerRadiation?: { add(delta: number): void; level(): number };
  /** Smierc gracza z zewnatrz skryptow (np. radiacja, 0x42d63c -> 0x42da64): zabija gracza i zglasza smierc. */
  requestPlayerDeath(): void {
    const p = this.world.player;
    if (critterKill(p)) this.battle.deaths.push(p.id);
    this.signalPlayerDeath();
  }
  /** Zdejmuje zgloszenia (po obsluzeniu przez hosta). */
  clearEndSignals(): void {
    this.endGameRequested = false;
    this.playerDeathRequested = false;
  }
  private signalEndGame(): void {
    if (this.endGameRequested) return;
    this.endGameRequested = true;
    this.onEndGame?.();
  }
  private signalPlayerDeath(): void {
    if (this.playerDeathRequested) return;
    this.playerDeathRequested = true;
    this.onPlayerDeath?.();
  }
  /**
   * Zgloszenie okna windy (metarule 15, flaga 8 w 0x664954): typ -> 0x6649a8, kondygnacja startowa -> 0x6649ac.
   * Host (UI) odbiera je przez `onElevatorRequest` albo `takeElevatorRequest`.
   */
  elevatorRequest: { type: number; level: number } | undefined;
  onElevatorRequest?: (req: { type: number; level: number }) => void;
  takeElevatorRequest(): { type: number; level: number } | undefined {
    const r = this.elevatorRequest;
    this.elevatorRequest = undefined;
    return r;
  }
  /**
   * metarule(15) = 0x4a466c (D, specyfikacja formatu): argument = domyslny typ windy; kryter-wlasciciel skryptu (obiekt z +4 = kafel,
   * +0x28 = kondygnacja) szuka w oknie 10x10 kafli (wiersz/kolumna -5..+4 wokol swojego kafla, ta sama kondygnacja)
   * obiektu pid 0x200050d (stub windy); jego dane scenery [0] = typ, [1] = kondygnacja startowa nadpisuja domyslne
   * (kondygnacja domyslnie = biezaca 0x519578). Typ -1 => zwraca -1, inaczej ustawia flage 8 i zwraca 0.
   */
  private requestElevator(arg: Value | undefined, instance?: ScriptInstance): Value {
    const selfId = instance ? (this.scheduler.entryOf(instance)?.ownerObjectId ?? -1) : -1;
    const self = selfId === -1 ? undefined : this.obj(selfId);
    if (!self || self.hex === -1) return int(-1);
    let type = arg?.t === 'int' ? arg.v : arg?.t === 'obj' ? arg.v : 0;
    let level: number = this.world.player.elevation;
    const sx = self.hex % 200;
    const sy = Math.floor(self.hex / 200);
    let stub: GameObject | undefined;
    for (let dy = -5; dy < 5 && !stub; dy++) {
      for (let dx = -5; dx < 5 && !stub; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || x >= 200 || y < 0 || y >= 200) continue;
        const hex = y * 200 + x;
        stub = this.world.map.objects.find(
          (o) => o.pid === 0x200050d && o.hex === hex && o.elevation === self.elevation,
        );
      }
    }
    if (stub && stub.extra?.kind === 'elevator') {
      type = stub.extra.raw[0] ?? 0;
      level = stub.extra.raw[1] ?? 0;
    }
    if (type === -1) return int(-1);
    const req = { type, level };
    this.elevatorRequest = req;
    this.onElevatorRequest?.(req);
    return int(0);
  }
  metarule(id: number, arg?: Value, instance?: ScriptInstance): Value {
    if (id === 15) return this.requestElevator(arg, instance);
    if (id === 13) {
      this.signalEndGame();
      return int(0);
    }
    // 44/45 = pozycja gracza na mapie swiata x/y (0x4c47a4), 46 = biezacy obszar (0x4c47c0, tablica 0x4594a0),
    // 47 = language_filter, 48 = violence_level (config_get_int 0x42c05c, klucze z 0x505f6c/0x505f7c); D (specyfikacja formatu)
    if (id === 44) return int(this.worldX);
    if (id === 45) return int(this.worldY);
    if (id === 46) return int(this.currentTown);
    if (id === 47) return int(this.languageFilter);
    if (id === 48) return int(this.violenceLevel);
    if (id === 49) return int(this.weaponDamageType);
    // 51 = typ zabicia krytera (0x459838 -> 0x42d920, D wg specyfikacja formatu): nie-kryter -1; kryter = pole killType protoka.
    // Gracz (0x42d920, D): stat 34 (plec) == 1 ? 1 : 0, nie pole protoka (0 = mezczyzna, 1 = kobieta).
    if (id === 51) {
      const o = arg?.t === 'obj' ? this.obj(arg.v) : undefined;
      const k = (o?.proto as { killType?: number } | undefined)?.killType;
      if (o?.extra?.kind !== 'critter') return int(-1);
      if (o === this.world.player) return int(this.getCritterStat(o.id, 34) === 1 ? 1 : 0);
      return int(typeof k === 'number' ? k : 0);
    }
    if (id === 16) return int(this.inventory.party.size);
    if (id === 17) return int(this.knownAreas.get(arg?.t === 'int' ? arg.v : -1) ?? 0);
    if (id === 14) return int(this.firstRunFlag ? 1 : 0);
    // 18 = WHO_ON_DRUGS: 1 gdy w kolejce zdarzen jest efekt narkotyku (typ 0) dla obiektu (0x4a26a8); kolejki efektow brak => 0
    if (id === 18) return int(0);
    // 40 = skill tagged: 1 gdy numer umiejetnosci jest w 4 slotach tagow gracza (0x4aa52c)
    if (id === 40) return int(this.taggedSkills.has(arg?.t === 'int' ? arg.v : -1) ? 1 : 0);
    // 19 = MAP_KNOWN(indeks mapy): 1 gdy mapa znana (Z: zrodlo flagi w oryginale niezbadane)
    if (id === 19) return int(this.knownMaps.has(arg?.t === 'int' ? arg.v : -1) ? 1 : 0);
    if (id === 22) return int(this.loadingSave ? 1 : 0);
    // 1 i 28 nie istnieja w vanilla (lancuch cmp 0x4594a0 nic nie wklada), 31 = start samochodu (0x4c4e94):
    // brak paliwa = -1, inaczej flaga ruchu [0x672e64] = 1 i 0 (D); 52/53 = zapis/odczyt pola +0x24 protoz pid 0x1c7 (D)
    if (id === 1 || id === 28) return int(0);
    if (id === 31) {
      if (this.carFuel <= 0) return int(-1);
      this.carMoving = true;
      this.car.owned = true;
      return int(0);
    }
    if (id === 52) {
      this.metarule52Value = arg?.t === 'obj' || arg?.t === 'int' ? arg.v : 0;
      return int(1);
    }
    if (id === 53) return int(this.metarule52Value);
    // 30 = obszar, w ktorym stoi samochod gracza (0x4c4e8c zwraca slowo 0x672e68; poczatkowo -1, init 0x4bc984)
    if (id === 30) return int(this.carArea);
    return this.unsupported(`metarule(${id})`);
  }
  metarule3(id: number, a?: Value, b?: Value): Value {
    // 0, 1, 31, 45, 300 nie istnieja w vanilla (lancuch cmp 0x457110 nic nie wklada), wynik 0
    if (id === 0 || id === 1 || id === 31 || id === 45 || id === 300) return int(0);
    // 100 = rm_fixed_timer_event(obj, param): usuwa zdarzenia timera skryptu obiektu (wg sid, bez filtra po param)
    if (id === 100) {
      const o = a?.t === 'obj' ? this.obj(a.v) : undefined;
      if (o && o.scriptId !== -1) this.scheduler.rmTimerEvent(o.scriptId);
      return int(0);
    }
    // 108 = tile_set_center(tile, flags=1) (0x4b12f8): ustawia srodek kamery; 0 = sukces, -1 gdy kafel < 0 lub >= 40000 (D)
    if (id === 108) {
      const t = a?.t === 'int' ? a.v : -1;
      if (t < 0 || t >= 40000) return int(-1);
      this.cameraCenter = t;
      return int(0);
    }
    // 110 = samochod bez paliwa: 1 gdy paliwo (0x672e6c) <= 0 (0x4c4e7c, wynik porownany z 1 w 0x457311)
    // 105 = stan podkafla swiata (x, y): 0x4c3740 czyta pole stanu z tablicy kafli swiata (kafel 350x300, podkafel 50x50), zawsze zwraca 0 (sukces)
    if (id === 105)
      return int(
        this.subtileStates.get(`${a?.t === 'int' ? a.v : 0},${b?.t === 'int' ? b.v : 0}`) ?? 0,
      );
    if (id === 110) return int(this.carFuel <= 0 ? 1 : 0);
    return this.unsupported(`metarule3(${id})`);
  }
  private readonly critterExtraStats = new Map<string, number>();
  unsupported(opName: string, args: Value[] = []): Value {
    const num = (i: number): number => {
      const v = args[i];
      return v && (v.t === 'int' || v.t === 'obj' || v.t === 'float') ? v.v : -1;
    };
    // sfall/patch 0x815b/0x815d: premie skryptowe statystyk gracza (Z: tylko magazyn wartosci)
    if (opName === 'set_pc_extra_stat') {
      this.pcExtraStats.set(num(0), num(1));
      return int(0);
    }
    if (opName === 'get_pc_extra_stat') return int(this.pcExtraStats.get(num(0)) ?? 0);
    // sfall 0x815f/0x8161: premie statystyk dowolnego krytera (W, magazyn wartosci klucz obiekt:stat)
    if (opName === 'set_critter_extra_stat') {
      this.critterExtraStats.set(`${num(0)}:${num(1)}`, num(2));
      return int(0);
    }
    if (opName === 'get_critter_extra_stat')
      return int(this.critterExtraStats.get(`${num(0)}:${num(1)}`) ?? 0);
    if (opName === 'mark_area_known') {
      // (typ, obszar, stan): zapis stanu; typ nie jest rozrozniany (Z)
      this.knownAreas.set(num(1), num(2));
      return int(0);
    }
    // 0x80f5 (0x45835c): w oryginale dla dwoch niezerowych obiektow zawsze 0 (warunek zle zlozony, drugi obiekt
    // porownywany sam ze soba); wyjatek przy zerowym drugim argumencie (UB) tu tez 0
    if (opName === 'script_op_80f5') return int(0);
    // tile_is_visible (0x4584b0 -> 0x45404c):
    // model z 0x45404c: d = |srodek_kamery - kafel|; widoczny gdy d % 200 < 5 albo d / 200 < 5 (D)
    if (opName === 'tile_is_visible') {
      const d = Math.abs(this.cameraCenter - (args[0]?.t === 'int' ? args[0].v : 0));
      return int(d % 200 < 5 || Math.trunc(d / 200) < 5 ? 1 : 0);
    }
    // 0x80f9 (0x458534): ustawia globalny wskaznik [0x518848] = wlasciciel skryptu (animacja); bez efektu dla logiki, no-op
    if (opName === 'script_op_80f9') return int(0);
    // get_poison (0x45ac44): dla krytera [obj+0x60] (poziom zatrucia), inaczej 0; zatrucie niemodelowane => 0
    if (opName === 'get_poison') return int(0);
    // poison(obj, ile) (0x45ab90 -> 0x42d210): dziala tylko na graczu ([0x6610b8]); dla innych krytterow zwraca -1 i loguje
    // blad. Dla gracza: ile -= ile*odpornosc_na_trucizne(stat 0x20)/100, poziom [[gracz+0x2c]+0x34] += ile (min 0), potem
    // zdarzenie kolejki typu 5 (tik trucizny). Zatrucie niemodelowane (jak get_poison) => bez efektu (Z).
    if (opName === 'poison') return int(0);
    // animate_stand_obj 0x80cc (0x455dc8) i 0x80cd (0x455e7c, wersja "reverse": 0x414aa8 zamiast 0x4149d0): zdejmuja 1 arg
    // (obiekt; 0 => wlasciciel skryptu), przy wlaczonych animacjach (flaga 0x510944 bit0 == 0) rejestruja pojedyncza
    // animacje stania i ja uruchamiaja. Modelujemy tylko przerwanie ruchu obiektu; kierunek "reverse" i brak obiektu (Z).
    if (opName === 'animate_stand_obj') {
      if (num(0) > 0) this.animateStand(num(0));
      return int(0);
    }
    // obj_on_screen (0x45c878): ta sama elewacja i przeciecie prostokata obiektu z oknem gry; kamery brak w engine-core => elewacja
    if (opName === 'obj_on_screen') {
      const o = this.obj(num(0));
      return int(o && o.elevation === this.world.player.elevation ? 1 : 0);
    }
    // set_map_start(x, y, elev, rot) (0x454314): elev 0..2, kafel y*200+x; zapisuje poczatek mapy (globale 0x631d68..70)
    if (opName === 'set_map_start') {
      const [x, y, elev, rot] = [num(0), num(1), num(2), num(3)];
      const hex = y * 200 + x;
      if (elev >= 0 && elev <= 2 && hex >= 0 && hex < 40000) {
        const h = this.currentMap().header;
        h.playerHex = hex;
        h.playerElevation = elev;
        h.playerOrientation = rot;
      }
      return int(0);
    }
    // load_map(mapa, param) 0x80e4 (0x45755c): mapa to indeks (int) albo nazwa (str, 0x4bf9bc); indeks < 0 => nic.
    // Zapisuje param w danych przejscia ([0x5186c0]+0x6c) i przechodzi na mape z kaflem/elewacja/obrotem -1 (domyslne).
    // Znaczenie param oraz zwiazek z "startElevation" w hooks.loadMap: Z.
    if (opName === 'script_op_80e4') {
      const m = args[0];
      const map = m && m.t === 'str' ? m.v : num(0);
      if (map === -1 || map === -2) this.pendingWorldMap = { townMap: map === -2 };
      else if (map !== '' && !(typeof map === 'number' && map < 0)) this.loadMap(map, num(1));
      return int(0);
    }
    // wm_area_set_pos(obszar, x, y) 0x80e5 (0x457680 -> 0x4c4710): ustawia pozycje obszaru na mapie swiata
    if (opName === 'wm_area_set_pos') {
      this.areaPositions.set(num(0), { x: num(1), y: num(2) });
      return int(0);
    }
    // set_exit_grids(elew, mapa, elew_docelowa, kafel_docelowy, rotacja) 0x80e6 (0x457730): patrz exit-grid.ts
    if (opName === 'set_exit_grids') {
      setExitGrids(this.currentMap(), num(0), num(1), num(2), num(3));
      return int(0);
    }
    // kill_critter(obj, anim) 0x80ed (0x457ad4 -> 0x42da64): zabija krytera; anim (wariant animacji smierci) tylko wizualny.
    // Brak obiektu => blad skryptu (log). Zatrzymanie skryptu przy samobojstwie ([prog+0x81] |= 1) Z.
    if (opName === 'kill_critter') {
      const o = this.obj(num(0));
      if (!o) {
        this.note(opName);
        return int(0);
      }
      if (critterKill(o)) this.battle.deaths.push(o.id);
      if (o === this.world.player) this.signalPlayerDeath();
      return int(0);
    }
    // kill_critter_type(pid, anim) 0x80ee (0x457cb4): zabija wszystkie zywe, nieukryte (flaga 0x1) krytery o danym pid
    // na wszystkich elewacjach; anim == 0 => obiekt usuwany z mapy (0x48b0fc), inaczej zabity.
    if (opName === 'kill_critter_type') {
      const pid = num(0);
      const remove = num(1) === 0;
      for (const o of [...this.currentMap().objects]) {
        if (o.pid !== pid || o.type !== 1 || o.flags & 1 || o === this.world.player) continue;
        if (remove) this.destroyObject(o.id);
        else if (critterKill(o)) this.battle.deaths.push(o.id);
      }
      return int(0);
    }
    // radiation_inc/dec(obj, ile) 0x80fd/0x80fe (0x458760/0x458800 -> 0x42d3a4): tylko gracz; odpornosc niemodelowana (Z)
    if (opName === 'radiation_inc' || opName === 'radiation_dec') {
      const o = this.obj(num(0));
      if (!o) {
        this.note(opName);
        return int(0);
      }
      const n = num(1);
      if (o === this.world.player && this.playerRadiation) {
        this.playerRadiation.add(opName === 'radiation_inc' ? n : -n);
        return int(0);
      }
      critterAdjustRads(o, o === this.world.player, opName === 'radiation_inc' ? n : -n);
      return int(0);
    }
    // critter_rm_trait(obj, kind, trait, amount) 0x458c2c (D): kind 0 zdejmuje WSZYSTKIE rangi perku; zwraca -1
    if (opName === 'critter_rm_trait') {
      const o = this.obj(num(0));
      if (o?.type === 1 && num(1) === 0) this.critters.removePerk(o, num(2));
      else this.note(opName);
      return int(-1);
    }
    // critter_mod_skill(obj, skill, amount) 0x45b840 (D): tylko gracz; zawsze 0
    if (opName === 'critter_mod_skill') {
      this.critters.modSkill(this.obj(num(0)), num(1), num(2));
      return int(0);
    }
    const extra = this.extraB.handle(opName, args, {
      ticks: this.world.clock.ticks,
      obj: (id) => this.obj(id),
    });
    if (extra) return extra;
    this.note(opName);
    return int(0);
  }

  /** Staty/perki/traity/skille krytykow (critter-stats.ts). */
  readonly critters = new CritterStatsModel({
    isPlayer: (o) => o === this.world.player,
    playerRecord: () => this.opts.playerRecord?.(),
    context: () => ({
      ...defaultRulesContext(),
      clock: this.world.clock,
      rng: { int: (a, b) => this.random(a, b) },
    }),
  });

  /** Opkody VM czesc B (script-ops-b.ts). */
  readonly extraB = new ExtraOpsB();

  // ---- BattleHooks (model: battle-model.ts) ----
  readonly battle: BattleModel;
  /** Domyslne uzycie obiektu z opkodu use_obj bez nadpisania w use_p_proc (podpina warstwa gry); true = obsluzone. */
  onDefaultUse?: (source: number, target: number) => boolean;
  critterDamage = (id: number, d: number): void => this.battle.critterDamage(id, d);
  attack = (i: ScriptInstance, v: number, a: number[]): void => this.battle.attack(i, v, a);
  attackSetup = (i: ScriptInstance, a: number, d: number): void => this.battle.attackSetup(i, a, d);
  useObjOnObj = (i: ScriptInstance, it: number, t: number): void =>
    this.battle.useObjOnObj(i, it, t);
  explosion = (t: number, e: number, d: number): void => this.battle.explosion(t, e, d);
  scrReturn = (i: ScriptInstance, v: number): void => this.battle.scrReturn(i, v);
  useObj = (i: ScriptInstance, it: number): void => this.battle.useObj(i, it);
  dropObj = (i: ScriptInstance, it: number): void => this.battle.dropObj(i, it);
  pickupObj = (i: ScriptInstance, it: number): void => this.battle.pickupObj(i, it);

  // ---- Batch4Hooks (model: batch4-model.ts) ----
  readonly batch4: Batch4Model;
  critterHeal = (id: number, n: number): number => this.batch4.critterHeal(id, n);
  critterState = (id: number): number => this.batch4.critterState(id);
  critterIsFleeing = (id: number): number => this.batch4.critterIsFleeing(id);
  critterSetFleeState = (id: number, on: boolean): void => this.batch4.critterSetFleeState(id, on);
  critterInjure = (id: number, f: number, clear: boolean): void =>
    this.batch4.critterInjure(id, f, clear);
  pcStat = (stat: number): number => this.batch4.pcStat(stat);
  moveInventory = (a: number, b: number): void => this.batch4.moveInventory(a, b);
  attemptPlacement = (id: number, t: number, e: number): number =>
    this.batch4.attemptPlacement(id, t, e);
  animate = (id: number, code: number, arg: number): void => this.batch4.animate(id, code, arg);

  // ---- InventoryHooks (model: inventory-model.ts) ----
  partyMemberObj = (pid: number): number => this.inventory.partyMemberObj(pid);
  partyAdd = (id: number): void => this.inventory.partyAdd(id);
  partyRemove = (id: number): void => this.inventory.partyRemove(id);
  invenCountPid = (who: number, pid: number): number => this.inventory.invenCountPid(who, pid);
  invenObjByPid = (who: number, pid: number): number => this.inventory.invenObjByPid(who, pid);
  invenSlotObj = (who: number, slot: number): number => this.inventory.invenSlotObj(who, slot);
  invenCount = (who: number): number => this.inventory.invenCount(who);
  // ---- GapHooks (opcodes-gaps.ts) ----
  invenUnwield = (instance: ScriptInstance): void => {
    const self = this.scheduler.entryOf(instance)?.ownerObjectId ?? -1;
    if (self !== -1) this.inventory.unwieldHand(self);
  };
  /**
   * terminate_combat (0x8153, 0x45ca84): wola host walki (`onTerminateCombat`, rejestruje go CombatController);
   * bez walki w toku nic sie nie dzieje (jak w exe, gdzie opkod dziala tylko przy fladze walki).
   */
  onTerminateCombat?: (selfId: number) => void;
  terminateCombat = (instance: ScriptInstance): void => {
    const self = this.scheduler.entryOf(instance)?.ownerObjectId ?? -1;
    this.onTerminateCombat?.(self);
  };
  /** Lista art/critters/critters.lst (nazwy bazowe, 6 znakow), ladowana leniwie; puste do czasu zaladowania. */
  private critterArt: string[] = [];
  private critterArtLoading = false;
  private loadCritterArt(): void {
    if (this.critterArtLoading) return;
    this.critterArtLoading = true;
    void openGameFile(this.opts.vfs, 'art/critters/critters.lst')
      .then((b) => {
        this.critterArt = parseLst(b).map((e) => lstName(e).replace(/\..*$/, ''));
      })
      .catch(() => undefined);
  }
  /**
   * sfx_build_char_name (0x45b9c4 -> 0x451604): nazwa bazowa z listy art wg FID obiektu + litery broni/animacji.
   * Tylko krytery (typ 1); inne typy FID i brak listy daja pusty string (exe: -1 z 0x4192b0 -> NULL).
   */
  sfxBuildCharName = (obj: number, anim: number, extra: number): string => {
    this.loadCritterArt();
    const o = this.obj(obj);
    const b = this.opts.sfxNames;
    if (!o || !b || ((o.fid >> 24) & 0xf) !== 1) return '';
    const base = this.critterArt[o.fid & 0xfff];
    if (!base) return '';
    return b.charName(base, anim, (o.fid >> 12) & 0xf, extra) ?? '';
  };
  /**
   * sfx_build_weapon_name (0x45bcac -> 0x451760): `W<akcja><bron><tryb><material>XX1`. Bajt dzwieku broni to soundId
   * proto itemu (+0x64 w pamieci), damageType to dane[3] broni (+0x30), material celu z proto celu (krytery: 'F').
   */
  sfxBuildWeaponName = (
    effect: number,
    weapon: number,
    hitMode: number,
    target: number,
  ): string => {
    const b = this.opts.sfxNames;
    if (!b) return '';
    const w = this.obj(weapon)?.proto;
    const wi = w?.kind === 'item' ? w : undefined;
    const weaponChar = wi && wi.soundId > 0 ? String.fromCharCode(wi.soundId) : '';
    const t = target === -1 ? undefined : this.obj(target);
    let material: number | undefined;
    if (t) {
      const tp = t.proto as { material?: number } | undefined;
      // krytery (typ FID 1) i proto bez materialu: indeks -1 daje litere 'F' (0x451760: material poza 0..7)
      material = ((t.fid >> 24) & 0xf) === 1 || tp?.material === undefined ? -1 : tp.material;
    }
    const r = b.weaponName({
      action: effect,
      weaponChar,
      hitMode,
      ...(material !== undefined ? { material } : {}),
      ...(wi?.subtype === 3 && wi.data[3] !== undefined ? { damageType: wi.data[3] } : {}),
    });
    if (r !== null) return r;
    // brak broni: %c z bajtem 0 obcina napis po literze akcji (exe), tj. "W<akcja>"
    return `W${'RAOFHOCLNU'[effect] ?? ''}`;
  };
  invenIndexPtr = (who: number, index: number): number => this.inventory.invenIndexPtr(who, index);
  addObjToInven = (who: number, item: number): void => this.inventory.addObjToInven(who, item);
  rmObjFromInven = (who: number, item: number): void => this.inventory.rmObjFromInven(who, item);
  addMultObjsToInven = (who: number, item: number, n: number): void =>
    this.inventory.addMultObjsToInven(who, item, n);
  rmMultObjsFromInven = (who: number, item: number, n: number): number =>
    this.inventory.rmMultObjsFromInven(who, item, n);
  wieldObjCritter = (who: number, item: number): void => this.inventory.wieldObjCritter(who, item);
  itemSubtype = (id: number): number => this.inventory.itemSubtype(id);
  itemCapsTotal = (id: number): number => this.inventory.itemCapsTotal(id);
  itemCapsAdjust = (id: number, amount: number): number =>
    this.inventory.itemCapsAdjust(id, amount);

  // ---- MiscHooks (model: misc-model.ts) ----
  /** Skrypty, ktore wywolaly script_overrides (flaga +0x44 oryginalu). */
  readonly overridden = new WeakSet<ScriptInstance>();
  /** Indeks biezacej mapy (ustawiany przy ladowaniu); domyslnie mapId z naglowka. */
  mapIndex: number | undefined;
  uiEnabled = true;
  mouseMask = 0;
  currentScriptAction = 0;
  currentObjBeingUsedWith = -1;
  scriptOverrides = (instance: ScriptInstance): void => void this.overridden.add(instance);
  curMapIndex = (): number => this.mapIndex ?? this.currentMap().header.mapId;
  tileDirection = (a: number, b: number): number =>
    a < 0 || b < 0 || a >= 40000 || b >= 40000 ? 0 : directionTo(a, b);
  setObjHidden = (id: number, hide: boolean): void => {
    const o = this.obj(id);
    if (o) misc.setObjHidden(o, hide);
  };
  objIsLocked = (id: number): number => {
    const o = this.obj(id);
    return o ? misc.objIsLocked(o) : 0;
  };
  setObjLocked = (id: number, locked: boolean): void => {
    const o = this.obj(id);
    if (o) misc.setObjLocked(o, locked);
  };
  objIsOpen = (id: number): number => {
    const o = this.obj(id);
    return o ? misc.objIsOpen(o) : 0;
  };
  setObjOpen = (id: number, open: boolean): void => {
    const o = this.obj(id);
    if (o) misc.setObjOpen(o, open);
  };
  gameTimeAdvance = (ticks: number): void => this.world.clock.advance(ticks);
  setUiEnabled = (on: boolean): void => void (this.uiEnabled = on);
  mouseButtons = (): number => this.mouseMask;
  scriptAction = (): number => this.currentScriptAction;
  objBeingUsedWith = (): number => this.currentObjBeingUsedWith;

  // ---- CombatHooks (reguly: rules-skills.ts) ----
  /** Doswiadczenie gracza (give_exp_points); rank Swift Learner nie jest jeszcze modelowany (0). */
  pcExperience = 0;
  swiftLearnerRank = 0;
  giveExpPoints = (xp: number): void => {
    this.pcExperience = addExperience(this.pcExperience, xp, this.swiftLearnerRank);
  };
  isCritter = (id: number): boolean => this.obj(id)?.type === 1;
  skillValue = (critter: number, skill: number): number => {
    const o = this.obj(critter);
    return this.critters.record(o)
      ? this.critters.skill(o, skill)
      : skillValue(skill, (s) => this.getCritterStat(critter, s));
  };
  rollVsSkill = (
    critter: number,
    skill: number,
    mod: number,
  ): { degree: number; delta: number } => {
    // skill poza 0..17: oryginal zwraca stopien 1 bez rzutu (0x4aaaa4)
    if (!Number.isInteger(skill) || skill < 0 || skill >= SKILL_COUNT)
      return { degree: 1, delta: 0 };
    const chance = this.skillValue(critter, skill) + mod;
    // stat 0xf (szansa krytyka) = Szczescie (stat 6)
    const crit = this.getCritterStat(critter, 6);
    return rollAgainst(chance, crit, this.gameTicks(), (a, b) => this.random(a, b));
  };
  /** Stan skradania gracza (flaga 0x42e2f8 bit 0); skradanie nie jest jeszcze modelowane. */
  pcSneaking = false;
  /** Wynik ostatniego rzutu skradania gracza ([0x56d77c], D: pisze go wylacznie zdarzenie 0x42e32c, 1 sukces / 0 porazka). */
  pcSneakRollOk = false;
  /** Zrodlo stanu skradania z arkusza gracza (apps/web); gdy ustawione, nadpisuje pola `pcSneaking`/`pcSneakRollOk`. */
  pcSneakSource?: () => { sneaking: boolean; rollOk: boolean };
  private sneakState(): { sneaking: boolean; rollOk: boolean } {
    return this.pcSneakSource?.() ?? { sneaking: this.pcSneaking, rollOk: this.pcSneakRollOk };
  }
  /** Bit 0 flagi 0x510944 (D: ustawia 0x421a34 na koncu startu walki, zeruja 0x421efc/0x422194): walka trwa. */
  inCombat: () => boolean = () => false;
  usingSkill = (critter: number, skill: number): number =>
    skill === 8 && critter === this.dudeObj() && this.sneakState().sneaking ? 1 : 0;
  statCheck = (critter: number, stat: number, mod: number): { degree: number; delta: number } =>
    statCheck(this.getCritterStat(critter, stat), mod, (a, b) => this.random(a, b));
  canSee = (src: number, target: number): boolean => {
    const a = this.obj(src);
    const b = this.obj(target);
    if (!a || !b || a.hex < 0 || a.elevation !== b.elevation) return false;
    return canSeeInRange(
      hexDistance(b.hex, a.hex),
      this.getCritterStat(src, 1),
      inFrontCone(a.rotation, directionTo(a.hex, b.hex)),
      {
        targetIsPlayer: target === this.dudeObj(),
        sneaking: this.sneakState().sneaking,
        // 0x42e3f4 (D): wynik rzutu liczy sie tylko przy wlaczonym skradaniu (bit 0 flag proto gracza)
        sneakSuccess: this.sneakState().sneaking && this.sneakState().rollOk,
        sneakSkill: this.skillValue(this.dudeObj(), 8),
        doubled: this.inCombat(),
      },
    );
  };
  animBusy = (id: number): boolean => {
    const o = this.obj(id);
    return !!o && this.world.movement.stateOf(o) !== undefined;
  };
  /** Rejestr sekwencji animacji (reg_anim_*) nie jest jeszcze modelowany: begin/clear/end bez efektu. */
  regAnimFunc = (op: number, value: number): void => {
    if (op === 2) this.animateStand(value);
  };

  private note(opName: string): void {
    this.log.push({ kind: 'unsupported', message: opName });
  }
}
