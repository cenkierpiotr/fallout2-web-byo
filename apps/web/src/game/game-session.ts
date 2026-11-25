import {
  CritterStatsModel,
  GameCommands,
  AutosaveTimer,
  MapRegistry,
  SaveCommands,
  createSignal,
  formatGameDate,
  moveObject,
  rest as restWorld,
  type RestMode,
  type RestResult,
  type RestWorld,
  type AutosavePolicy,
  type AutosaveState,
  type ExitGrid,
  type GameView,
  type Hex,
  type Result,
  type SaveItem,
  type SaveMeta,
  type SaveResult,
  type SaveStore,
  type Signal,
  type World,
  type GameEvent,
  handleMidnight,
  scheduleMidnight,
  clearDailyObjectBits,
} from '@f2/engine-core';
import { buildMidnightHooks, type MidnightHost } from './midnight-host';
import {
  adjustRadiation,
  defaultRulesContext,
  partyBestSkill,
  type RadiationAdjustResult,
} from '@f2/rules';
import { createSheetCritter } from './sheet-critter';
import { handleRadiationQueueEvent, radiationMidnight, type RadiationEnv } from './radiation-host';
import type { BarterSnapshot } from '@f2/app/src/barter-binding';
import { handleChemEvent, type ChemEnv } from './chem';
import { handleExplosionQueueEvent } from './explosive-host';
import type { SessionExtras } from './session-extras';
import { PartyFollower } from './party-follow';
import {
  commitBarter,
  createBarter,
  inventoryWeight,
  type BarterOpenOptions,
  type BarterSetup,
} from './barter-open';
import { inventoryFromSave, restoreMapObjects, type ProtoSource } from './restore-world';
import {
  buildSaveWorld,
  captureMapState,
  defaultSessionState,
  sheetFromSave,
  type SessionState,
} from './save-world';

/** Indeks skilla Barter w tablicy 18 skilli. */
export const SKILL_BARTER = 15;
const STAT_STRENGTH = 0;
const STAT_CARRY_WEIGHT = 12;
const PERK_MASTER_TRADER = 'master-trader';
const STAT_MAX_HP = 7;
const STAT_HEALING_RATE = 14;

export interface SessionView extends GameView {
  clock: Signal<{ dateText: string; hour: number; ticks: number }>;
  barter: Signal<BarterSnapshot | null>;
  saves: Signal<SaveMeta[]>;
}

export interface GameSessionDeps {
  world: World;
  store: SaveStore;
  locale(): 'pl' | 'en';
  now(): number;
  engineVersion: string;
  characterName?(): string;
  policy?: AutosavePolicy;
  getThumbnail?(): Promise<string | null>;
  /** Wskaznik autozapisu w UI. */
  onAutosave?(state: AutosaveState, slot: string | null): void;
  isInDialog?(): boolean;
  /** Trwa walka: zapisy blokowane (`save-in-combat`). */
  isInCombat?(): boolean;
  /** Zapewnia zaladowanie assetow/sprite'ow przed przejsciem na mape (opcjonalne). */
  state?: SessionState;
  /** Druzyna, dziennik zadan i gvars (zapis/odczyt razem ze swiatem). */
  extras?: SessionExtras;
  registry?: MapRegistry;
  /** Hooki polnocy: film trwa, koniec gry, slajdy progow dni (domyslnie no-op). */
  midnight?: MidnightHost;
  /** Prototypy (ProtoCache): potrzebne do odtworzenia obiektow mapy i ekwipunku przy wczytaniu. */
  protos?: ProtoSource;
}

/** Autozapis cykliczny co 5 min czasu rzeczywistego (oprocz autozapisu przy zmianie mapy). */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 5 * 60_000;

export type BarterFail = 'no-session' | 'not-found' | 'unknown';

export class GameSession {
  readonly world: World;
  readonly commands: GameCommands;
  readonly registry: MapRegistry;
  readonly state: SessionState;
  readonly saveCommands: SaveCommands;
  readonly view: SessionView;
  /** Dodatkowe handlery zdarzen kolejki (np. skradanie 0x42e32c); undefined = zdarzenie obce. */
  readonly eventHandlers: ((e: GameEvent) => number | undefined)[] = [];
  private barterSetup: { setup: BarterSetup; merchant: World['player'] } | null = null;

  constructor(private readonly d: GameSessionDeps) {
    this.world = d.world;
    this.policy = d.policy ?? {
      onMapChange: true,
      rotate: 3,
      intervalMs: DEFAULT_AUTOSAVE_INTERVAL_MS,
    };
    this.follow = new PartyFollower({ world: d.world, enemiesNearby: () => this.enemiesNearby() });
    this.state = d.state ?? defaultSessionState();
    this.registry = d.registry ?? d.world.scripts?.registry ?? new MapRegistry();
    const base = d.world.view;
    this.view = Object.assign(base, {
      clock: createSignal({ dateText: '', hour: 0, ticks: 0 }),
      barter: createSignal<BarterSnapshot | null>(null),
      saves: createSignal<SaveMeta[]>([]),
    }) as SessionView;
    this.commands = new GameCommands(d.world);
    this.saveCommands = new SaveCommands({
      store: d.store,
      getWorld: () => {
        this.beforeSave?.();
        return buildSaveWorld(this.world, this.state, this.registry, false, d.extras);
      },
      setWorld: (w, meta) => {
        this.playBaseMs = meta.playTimeMs ?? 0;
        this.playStartMs = d.now();
        this.applyLoaded(w);
      },
      playTimeMs: () => this.playBaseMs + (d.now() - this.playStartMs),
      ...(d.onAutosave ? { onAutosave: d.onAutosave } : {}),
      isInDialog: d.isInDialog ?? (() => false),
      ...(d.isInCombat ? { isInCombat: d.isInCombat } : {}),
      now: d.now,
      characterName: d.characterName ?? (() => 'Wybraniec'),
      locale: d.locale,
      engineVersion: d.engineVersion,
      policy: this.policy,
      ...(d.getThumbnail ? { getThumbnail: d.getThumbnail } : {}),
    });
    this.playStartMs = d.now();
    this.autosaveTimer = new AutosaveTimer(this.saveCommands, () => this.policy);
    this.ensureMidnightScheduled();
    this.syncClock();
  }

  /** Czas gry rzeczywisty: baza z wczytanego zapisu + czas od startu/wczytania. */
  private playBaseMs = 0;
  private playStartMs = 0;
  private readonly policy: AutosavePolicy;
  private readonly autosaveTimer: AutosaveTimer;

  /** Towarzysze podazaja za graczem poza walka (walka steruje nimi sama). */
  private readonly follow: PartyFollower;
  /** Hook tuz przed zbudowaniem zapisu (UI dopisuje do `state.modData`, np. stan mapy swiata). */
  beforeSave: (() => void) | null = null;
  private restMinutes = 0;
  /** Czy w poblizu sa wrogowie (blokuje odpoczynek); podmieniane przez walke (M6+). */
  enemiesNearby: () => boolean = () => false;

  private pendingMap: { name: string; hex: Hex; elevation: number } | null = null;
  private pendingInventory: SaveItem[] = [];

  /** Stan z zapisu na zywy swiat (synchronicznie); zmiana mapy dokonczy `afterLoad`. */
  private applyLoaded(w: ReturnType<typeof buildSaveWorld>): void {
    const world = this.world;
    world.clock = w.clock;
    this.state.queue = w.queue;
    this.state.rng = w.rng;
    this.state.globals = w.globals;
    this.state.settings = w.settings;
    this.state.scriptTimers = w.scriptTimers;
    this.state.modData = w.modData;
    this.state.gameEnded = w.gameEnded === true;
    this.state.radiationFlag = w.radiationFlag === true;
    this.state.sheet = sheetFromSave(w.player);
    this.registry.load(w.maps);
    this.d.extras?.restore({ party: w.party ?? null, gvars: w.gvars ?? null });
    // flagi obejrzanych filmow (slot 21); brak skryptow = nie ma gdzie ich trzymac
    if (world.scripts?.movieFlags && w.movieFlags) world.scripts.movieFlags.set(w.movieFlags);
    world.player.rotation = (w.player.orientation % 6) as typeof world.player.rotation;
    this.pendingInventory = w.player.inventory;
    this.ensureMidnightScheduled();
    this.pendingMap = {
      name: w.currentMap.name,
      hex: w.player.hex,
      elevation: w.player.elevation,
    };
  }

  private syncClock(): void {
    const c = this.world.clock;
    this.view.clock.value = {
      dateText: formatGameDate(c, this.d.locale()),
      hour: c.hour,
      ticks: c.ticks,
    };
  }

  private async afterLoad(): Promise<void> {
    const p = this.pendingMap;
    this.pendingMap = null;
    if (!p) return;
    const w = this.world;
    const ticks = w.clock.ticks;
    // druzyna sprzed wczytania nie moze przejsc na wczytana mape (zbior odtwarza rebindParty)
    w.scripts?.inventory.party.clear();
    if (w.map.name !== p.name) {
      await this.commands.travelTo(p.name, p.hex, p.elevation);
      // travelTo przesuwa gracza, ale nie zegar; przywracamy czas z zapisu
      w.clock.ticks = ticks;
    } else {
      w.movement.cancel(w.player);
      moveObject(w.map, w.player, p.hex, p.elevation as 0 | 1 | 2);
      // ta sama mapa: zmienne lokalne skryptow i timery z zapisu
      const same = this.registry.get(w.map.name);
      if (same) w.scripts?.applySavedScriptState(same);
    }
    const protos = this.d.protos;
    if (protos) {
      // obiekty mapy i ekwipunek gracza odtwarzane z zapisu (rejestr zawiera tez biezaca mape)
      const st = this.registry.get(w.map.name);
      if (st) await restoreMapObjects(w.map, st, protos, w.player);
      w.player.inventory = await inventoryFromSave(this.pendingInventory, protos);
      moveObject(w.map, w.player, p.hex, p.elevation as 0 | 1 | 2);
    }
    this.view.player.value = {
      hex: w.player.hex,
      elevation: w.player.elevation,
      moving: false,
    };
    this.view.currentMap.value = { name: w.map.name, elevation: w.player.elevation };
    this.d.extras?.rebindParty();
    this.syncClock();
  }

  // ----- mapa / petla -----

  /** Srodowisko chemii (arkusz gracza + wspolna kolejka zdarzen + zegar gry). */
  chemEnv(): ChemEnv {
    return {
      sheet: this.state.sheet,
      queue: this.state.queue,
      rng: this.state.rng,
      globals: this.state.globals,
      ...(this.d.extras ? { gvars: this.d.extras.globalAccess() } : {}),
      ticks: this.world.clock.ticks,
      radiation: (delta) => void this.addPlayerRadiation(delta),
    };
  }

  /** Przetwarza zdarzenia czasowe do biezacego ticku (wygasanie lekow, odstawienie). */
  private processTimed(): void {
    const env = this.chemEnv();
    this.state.queue.processUntil(this.world.clock.ticks, (e) => {
      for (const h of this.eventHandlers) {
        const r = h(e);
        if (r !== undefined) return r;
      }
      if (e.kind === 'midnight') return this.onMidnight(e);
      if (e.kind === 'radiation') return this.onRadiationEvent(e);
      return handleExplosionQueueEvent(this, e) ?? handleChemEvent(env, e) ?? 0;
    });
  }

  /** Polnoc 0x4a3620: dzienny reset bitow obiektow mapy (0x49d4b8) i ponowne zaplanowanie polnocy. */
  private onMidnight(e: GameEvent): number {
    const hooks = buildMidnightHooks({
      host: this.d.midnight,
      ended: {
        get: () => this.state.gameEnded,
        set: (v) => {
          this.state.gameEnded = v;
        },
      },
      gvars: this.d.extras?.globalAccess(),
      movieFlags: this.world.scripts?.movieFlags,
      dailyReset: () => clearDailyObjectBits(this.world.map.objects),
      radiation: {
        flag: {
          get: () => this.state.radiationFlag,
          set: (v) => {
            this.state.radiationFlag = v;
          },
        },
        check: (flagWas) => radiationMidnight(this.radiationEnv(), flagWas),
      },
    });
    return handleMidnight(e, this.state.queue, this.world.clock, hooks);
  }

  private radiationEnv(): RadiationEnv {
    return {
      critter: createSheetCritter(() => this.state.sheet),
      queue: this.state.queue,
      rng: this.state.rng,
      ticks: this.world.clock.ticks,
      playerId: this.world.player.id,
      onEvent: (r) => {
        this.d.midnight?.radiationEvent?.(r);
        // 0x42d63c: surowy SPECIAL <= 0 => 0x42da64 (zabicie gracza), D; sekwencje smierci odpala host z sygnalu
        if (r.dead) this.world.scripts?.requestPlayerDeath?.();
      },
    };
  }

  /** Zdarzenie typu 6 (0x42d740): kary poziomu promieniowania (faza 0) albo ich cofniecie (faza 1). */
  private onRadiationEvent(e: GameEvent): number {
    return handleRadiationQueueEvent(this.radiationEnv(), e);
  }

  /**
   * Dawka promieniowania gracza (0x42d3a4): odpornosc, komunikaty; przy dawce netto > 0 ustawia flage
   * (bit 0x2), ktora uruchamia test o polnocy. Zwraca wynik reguly (komunikaty do UI).
   */
  addPlayerRadiation(amount: number, geiger = false): RadiationAdjustResult {
    const r = adjustRadiation(
      createSheetCritter(() => this.state.sheet),
      amount,
      defaultRulesContext(),
      geiger,
    );
    if (r.needsMidnightCheck) this.state.radiationFlag = true;
    return r;
  }

  /** Radiacja gracza dla ScriptRuntime (radiation_inc/dec, set_critter_stat 0x25). */
  playerRadiationPort(): { add(delta: number): void; level(): number } {
    return {
      add: (d) => void this.addPlayerRadiation(d),
      level: () => this.state.sheet.radiation ?? 0,
    };
  }

  /** Kolejkuje polnoc, jesli kolejka jej nie ma (nowa gra; zapis z kolejka ja zachowuje). */
  ensureMidnightScheduled(): void {
    if (this.state.queue.peek((e) => e.kind === 'midnight').length === 0) {
      scheduleMidnight(this.state.queue, this.world.clock);
    }
  }

  /** Krok symulacji (wolany przez petle gry): ruch, zegar, kolejka zdarzen. */
  update(dtTicks: number): { exit?: ExitGrid } {
    const r = this.commands.update(dtTicks);
    this.processTimed();
    this.follow.update(dtTicks);
    this.syncClock();
    void this.autosaveTimer.tick(this.d.now()).catch(() => undefined);
    return r;
  }

  /** Przejscie na inna mape: stan opuszczanej mapy trafia do rejestru, potem autozapis. */
  async travelTo(name: string, hex?: Hex, elevation?: number): Promise<Result> {
    this.registry.snapshot(
      this.world.scripts?.captureCurrentMapState() ??
        captureMapState(this.world.map, this.world.clock.ticks, this.world.player.id),
    );
    const r = await this.commands.travelTo(name, hex, elevation);
    if (r.ok) {
      this.syncClock();
      this.autosaveTimer.reset(this.d.now());
      void this.saveCommands.onMapChange().catch(() => undefined);
    }
    return r;
  }

  // ----- odpoczynek -----

  maxHp(): number {
    const sh = this.state.sheet;
    return Math.max(sh.hp, (sh.baseStats[STAT_MAX_HP] ?? 0) + (sh.statBonuses[STAT_MAX_HP] ?? 0));
  }

  /** Odpoczynek wg time.md: zegar, kolejka zdarzen, leczenie co 180 min. */
  rest(mode: RestMode): RestResult {
    const sh = this.state.sheet;
    const w: RestWorld = {
      clock: this.world.clock,
      queue: this.state.queue,
      enemiesNearby: this.enemiesNearby,
      healingRate: () =>
        Math.max(
          1,
          (sh.baseStats[STAT_HEALING_RATE] ?? 1) + (sh.statBonuses[STAT_HEALING_RATE] ?? 0),
        ),
      hp: () => sh.hp,
      maxHp: () => this.maxHp(),
      heal: (n) => {
        sh.hp = Math.min(this.maxHp(), sh.hp + n);
      },
      restMinutes: this.restMinutes,
      handleEvent: () => 0,
    };
    const r = restWorld(w, mode);
    this.restMinutes = w.restMinutes ?? 0;
    this.world.scripts?.syncClock();
    this.syncClock();
    return r;
  }

  // ----- zapisy -----

  async save(slot: string, name = ''): Promise<SaveResult> {
    const r = await this.saveCommands.save(slot, name);
    await this.refreshSaves();
    return r;
  }
  async load(slot: string): Promise<SaveResult> {
    const r = await this.saveCommands.load(slot);
    if (r.ok) await this.afterLoad();
    return r;
  }
  quickSave(): Promise<SaveResult> {
    return this.save('quick', 'quick');
  }
  async quickLoad(): Promise<SaveResult> {
    return this.load('quick');
  }
  async refreshSaves(): Promise<void> {
    this.view.saves.value = await this.saveCommands.saves.list();
  }

  // ----- handel -----

  /** Otwiera sesje handlu z `merchant`; parametry z arkusza gracza, nadpisywalne w `over`. */
  openBarter(
    merchant: World['player'],
    over: Partial<BarterOpenOptions['params']> & {
      merchantName?: string;
      nameOf?: BarterOpenOptions['nameOf'];
    } = {},
  ): BarterSnapshot {
    const { player } = this.world;
    const sh = this.state.sheet;
    const carryMax =
      25 + 25 * (sh.baseStats[STAT_STRENGTH] ?? 5) + (sh.statBonuses[STAT_CARRY_WEIGHT] ?? 0);
    const sync = (): void => {
      this.view.barter.value = this.barterSetup ? this.barterSetup.setup.binding.snapshot() : null;
    };
    const setup = createBarter(player, merchant, {
      merchantName: over.merchantName ?? 'Handlarz',
      ...(over.nameOf ? { nameOf: over.nameOf } : {}),
      params: {
        merchantBarter: over.merchantBarter ?? this.merchantBarterSkill(merchant),
        partyBestBarter:
          over.partyBestBarter ?? this.partyBestBarterSkill(sh.skills[SKILL_BARTER] ?? 0),
        barterMod: over.barterMod ?? 0,
        masterTrader: over.masterTrader ?? (sh.perks[PERK_MASTER_TRADER] ?? 0) > 0,
        playerFreeCarry: over.playerFreeCarry ?? carryMax - inventoryWeight(player.inventory),
      },
      onChange: sync,
    });
    this.barterSetup = { setup, merchant };
    const snap = setup.binding.snapshot();
    this.view.barter.value = snap;
    return snap;
  }

  /**
   * Skill Barter kupca (`skill_level(B, 15)` w f2_barter_compute_value 0x474b2c, D): 4*CH + punkty z prototypu NPC
   * (rekord krytera ze skryptow, a bez runtime'u swiezy rekord z prototypu). Nie-krytery (pojemnik): 0.
   */
  private merchantBarterSkill(merchant: World['player']): number {
    const model =
      this.world.scripts?.critters ??
      (this.fallbackCritters ??= new CritterStatsModel({
        isPlayer: (o) => o === this.world.player,
        context: () => defaultRulesContext(),
      }));
    return Math.max(0, model.skill(merchant, SKILL_BARTER));
  }
  private fallbackCritters: CritterStatsModel | undefined;

  /**
   * `f2_party_best_skill(Barter)` 0x4955c8 (D): najlepszy Barter wsrod gracza i widocznych krytterow druzyny
   * (nie samego gracza). Gracz podawany z arkusza (`playerSkill`), towarzysze z rekordu krytera.
   */
  private partyBestBarterSkill(playerSkill: number): number {
    const model = this.world.scripts?.critters;
    const levels = [playerSkill];
    if (model) {
      for (const o of this.world.scripts?.inventory.partyObjects() ?? []) {
        if (o === this.world.player || o.hidden || o.extra.kind !== 'critter') continue;
        levels.push(model.skill(o, SKILL_BARTER));
      }
    }
    return partyBestSkill(levels);
  }

  readonly barter = {
    move: (side: 'player' | 'merchant', itemId: number, count: number, to: 'table' | 'inventory') =>
      this.barterSetup?.setup.binding.commands.move(side, itemId, count, to) ?? NO_SESSION,
    accept: () => {
      const b = this.barterSetup;
      if (!b) return NO_SESSION;
      const r = b.setup.binding.commands.accept();
      if (r.ok) commitBarter(b.setup, this.world.player, b.merchant);
      return r;
    },
    balance: () => this.barterSetup?.setup.binding.commands.balance() ?? NO_SESSION,
    cancel: () => {
      this.barterSetup?.setup.binding.commands.cancel();
    },
    close: () => {
      this.barterSetup = null;
      this.view.barter.value = null;
    },
  };
}

const NO_SESSION = { ok: false, reason: 'session-closed' } as const;
