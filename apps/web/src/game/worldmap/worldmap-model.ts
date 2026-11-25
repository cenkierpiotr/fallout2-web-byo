import {
  TICKS_PER_TRAVEL_ITERATION,
  scaleTravelTicks,
  burnFuel,
  carStepCalls,
  checkEncounter,
  pickEncounterEntry,
  stepCost,
  travelStep,
  subtileAt,
  tileIndexAt,
  type Gvars,
  type Rng,
  type WmEnv,
} from '@f2/rules';
import type { AreaDef, EncounterRelation, EntranceDef } from '@f2/formats';
import {
  AREA_RADIUS,
  SUB_COLS,
  SUB_ROWS,
  TILES_WIDE,
  WORLD_H,
  WORLD_W,
  mapNameOf,
  toWmEntry,
  type WorldmapData,
} from './worldmap-data';

/** Pojemnosc baku (D, 0x4c5244). */
export const FUEL_MAX = 80_000;
/** Bazowe spalanie na iteracje petli podrozy (0x4bfe0c wola 0x4c4da4 z eax=0x64; D). */
export const FUEL_PER_ITERATION = 100;
/** Promien odslaniania mgly w podkaflach (Z). */
export const FOG_RADIUS = 1;
/** Co ile px ruchu sprawdzamy spotkanie (regula wymaga |dx|,|dy| >= 3). */
const ENCOUNTER_WINDOW_PX = 3;

export interface TravelEnv {
  rng: Rng;
  /** Godzina gry w formacie HHMM. */
  hhmm: number;
  /** Tiki gry od poczatku. */
  gameTicks: number;
  difficulty: 0 | 1 | 2;
  luck: number;
  outdoorsman: number;
  pathfinder: number;
  /** Flagi rules.fixes.* (pathfinderFix); brak = zachowanie oryginalu. */
  fixes?: Readonly<Record<string, boolean>>;
  perks: { explorer: number; ranger: number; scout: number };
  gvars: Gvars;
  player(stat: string): number;
}

export interface EncounterEvent {
  kind: 'encounter';
  /** true = gracz moze zdecydowac (wykryte), false = wchodzi od razu. */
  prompt: boolean;
  xp: number;
  tableIndex: number;
  entryIndex: number;
  /** Nazwa pliku mapy lokalnej (z maps.txt) albo undefined gdy nie rozwiazano. */
  mapName: string | undefined;
  special: boolean;
  /** Grupy NPC wpisu tabeli (Enc: z worldmap.txt); puste dla scen specjalnych (mape obsluguje jej skrypt). */
  groups: { name: string; min: number; max: number }[];
  relation?: 'AMBUSH' | 'FIGHTING' | 'AND';
  /** Pelny lancuch relacji `Enc:` (kto z kim walczy / zasadza sie na gracza). */
  relations?: EncounterRelation[];
}
export interface CityEvent {
  kind: 'city';
  area: number;
}
export type TravelEvent =
  EncounterEvent | CityEvent | { kind: 'arrived' } | { kind: 'no-fuel'; area: number };

export interface WorldmapSnapshot {
  x: number;
  y: number;
  fuel: number;
  car: boolean;
  fog: string;
  known: number[];
  entrancesOn: Record<string, boolean>;
  counters: Record<string, number>;
  specialDone: boolean;
  ticksSinceCheck: number;
}

const key = (a: number, e: number): string => `${a}:${e}`;

/** Stan i symulacja podrozy po mapie swiata (bez UI); rng i srodowisko wstrzykiwane. */
export class WorldmapModel {
  x: number;
  y: number;
  fuel = 0;
  car = false;
  target: { x: number; y: number; area?: number } | null = null;
  /** 0 = nieodkryte, 1 = widziane; indeks row * SUB_COLS + col. */
  readonly fog = new Uint8Array(SUB_COLS * SUB_ROWS);
  readonly known = new Set<number>();
  private readonly entrancesOn = new Map<string, boolean>();
  private readonly counters = new Map<string, number>();
  private specialDone = false;
  private stepCounter = 1;
  private movedSinceCheck = 0;
  private ticksSinceCheck = 0;
  private lastCheckPos: { x: number; y: number };
  private fromArea = -1;

  constructor(
    readonly data: WorldmapData,
    start?: { x: number; y: number },
  ) {
    const a0 = data.areas[0];
    this.x = start?.x ?? a0?.worldPos.x ?? 0;
    this.y = start?.y ?? a0?.worldPos.y ?? 0;
    this.lastCheckPos = { x: this.x, y: this.y };
    data.areas.forEach((a, i) => {
      if (a.startState === 'On') this.known.add(i);
      a.entrances.forEach((e, k) => this.entrancesOn.set(key(i, k), e.state === 'On'));
    });
    this.reveal();
  }

  // ----- obszary -----

  radiusOf(a: AreaDef): number {
    return AREA_RADIUS[a.size];
  }

  /** Obszar, w ktorego kole lezy punkt (najblizszy srodkiem), tylko znany. */
  areaAt(x: number, y: number): number {
    let best = -1;
    let bd = Infinity;
    this.data.areas.forEach((a, i) => {
      if (!this.known.has(i)) return;
      const d = Math.hypot(a.worldPos.x - x, a.worldPos.y - y);
      if (d <= this.radiusOf(a) && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Czy miasto jest widoczne: znane (skrypt/start) i odslonieta mgla w jego podkaflu. */
  areaVisible(i: number): boolean {
    const a = this.data.areas[i];
    if (!a || !this.known.has(i)) return false;
    return this.fogAt(a.worldPos.x, a.worldPos.y) === 1;
  }

  markKnown(i: number): void {
    if (this.data.areas[i]) this.known.add(i);
  }

  setEntrance(area: number, entrance: number, on: boolean): void {
    this.entrancesOn.set(key(area, entrance), on);
  }

  /** Aktywne wejscia obszaru (w kolejnosci city.txt); gdy zadne nie jest wlaczone, pierwsze (regula pliku). */
  entrancesOf(area: number): { index: number; def: EntranceDef; map: string | undefined }[] {
    const a = this.data.areas[area];
    if (!a) return [];
    let list = a.entrances
      .map((def, index) => ({ index, def, map: mapNameOf(this.data.maps, def.mapLookupName) }))
      .filter((e) => this.entrancesOn.get(key(area, e.index)));
    if (list.length === 0 && a.entrances[0])
      list = [
        {
          index: 0,
          def: a.entrances[0],
          map: mapNameOf(this.data.maps, a.entrances[0].mapLookupName),
        },
      ];
    return list;
  }

  // ----- mgla wojny -----

  fogAt(x: number, y: number): 0 | 1 {
    const c = Math.floor(x / 50);
    const r = Math.floor(y / 50);
    if (c < 0 || r < 0 || c >= SUB_COLS || r >= SUB_ROWS) return 0;
    return this.fog[r * SUB_COLS + c] as 0 | 1;
  }

  reveal(radius = FOG_RADIUS): void {
    const c0 = Math.floor(this.x / 50);
    const r0 = Math.floor(this.y / 50);
    for (let r = r0 - radius; r <= r0 + radius; r++)
      for (let c = c0 - radius; c <= c0 + radius; c++)
        if (c >= 0 && r >= 0 && c < SUB_COLS && r < SUB_ROWS) this.fog[r * SUB_COLS + c] = 1;
  }

  // ----- teren -----

  cellAt(x: number, y: number) {
    const tile = this.data.cfg.tiles[tileIndexAt(x, y, TILES_WIDE)];
    if (!tile) return undefined;
    const { col, row } = subtileAt(x, y);
    return { tile, cell: tile.cells[row]?.[col] };
  }

  terrainAt(x: number, y: number): string {
    return this.cellAt(x, y)?.cell?.terrain ?? 'Desert';
  }

  terrainCost(x: number, y: number): number {
    return this.data.cfg.data.terrainTypes[this.terrainAt(x, y)] ?? 1;
  }

  // ----- cel -----

  setTarget(x: number, y: number, area?: number): void {
    const cx = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(WORLD_H - 1, Math.round(y)));
    this.target = area === undefined ? { x: cx, y: cy } : { x: cx, y: cy, area };
    this.fromArea = this.areaAt(this.x, this.y);
  }

  setTargetArea(i: number): boolean {
    const a = this.data.areas[i];
    if (!a || !this.known.has(i)) return false;
    this.setTarget(a.worldPos.x, a.worldPos.y, i);
    return true;
  }

  stop(): void {
    this.target = null;
  }

  /** Pojazd: Highwayman dziala tylko z paliwem. */
  get driving(): boolean {
    return this.car && this.fuel > 0;
  }

  // ----- symulacja -----

  /**
   * Jedna iteracja podrozy (TICKS_PER_TRAVEL_ITERATION tikow gry): kroki wg kosztu terenu i licznika,
   * paliwo, mgla, wejscie do miasta, test spotkania. Zwraca zdarzenia i liczbe tikow do zegara gry.
   */
  iterate(env: TravelEnv): { events: TravelEvent[]; ticks: number } {
    const events: TravelEvent[] = [];
    if (!this.target) return { events, ticks: 0 };
    if (this.x === this.target.x && this.y === this.target.y) {
      const area = this.target.area ?? this.areaAt(this.x, this.y);
      this.target = null;
      return { events: [area >= 0 ? { kind: 'city', area } : { kind: 'arrived' }], ticks: 0 };
    }
    if (this.car && this.fuel <= 0) {
      this.car = false;
      this.target = null;
      return { events: [{ kind: 'no-fuel', area: this.areaAt(this.x, this.y) }], ticks: 0 };
    }
    const wasDriving = this.driving;
    const calls = carStepCalls(wasDriving, env.gvars);
    const ticks = scaleTravelTicks(TICKS_PER_TRAVEL_ITERATION, env.pathfinder, env.fixes);
    let stop = false;
    for (let i = 0; i < calls && this.target; i++) {
      const cost = stepCost(this.terrainCost(this.x, this.y), env.pathfinder, env.fixes);
      const st = travelStep(this.stepCounter, cost);
      this.stepCounter = st.counter;
      if (!st.moved) continue;
      this.stepToward(this.target);
      this.reveal(FOG_RADIUS + (env.perks.scout ? 1 : 0));
      if (this.x === this.target.x && this.y === this.target.y) {
        const area = this.target.area ?? this.areaAt(this.x, this.y);
        this.target = null;
        events.push(area >= 0 ? { kind: 'city', area } : { kind: 'arrived' });
        stop = true;
        break;
      }
      const inArea = this.areaAt(this.x, this.y);
      if (inArea >= 0 && inArea !== this.fromArea && this.target.area === undefined) {
        this.target = null;
        events.push({ kind: 'city', area: inArea });
        stop = true;
        break;
      }
    }
    if (wasDriving) {
      // 0x4bfe0c/0x4c4da4 (D): paliwo spala sie RAZ na iteracje (baza 0x64), po wszystkich wywolaniach kroku
      this.fuel = burnFuel(this.fuel, FUEL_PER_ITERATION, env.gvars);
      if (this.fuel < 1) {
        // brak paliwa zatrzymuje podroz i samochod, ktory zostaje w biezacym miescie (zdarzenie wygrywa z przybyciem)
        this.fuel = 0;
        this.car = false;
        this.target = null;
        return { events: [{ kind: 'no-fuel', area: this.areaAt(this.x, this.y) }], ticks };
      }
    }
    if (stop) return { events, ticks };
    this.ticksSinceCheck += TICKS_PER_TRAVEL_ITERATION;
    const enc = this.checkEncounterAt(env);
    if (enc) {
      this.target = null;
      events.push(enc);
    }
    return {
      events,
      ticks: scaleTravelTicks(TICKS_PER_TRAVEL_ITERATION, env.pathfinder, env.fixes),
    };
  }

  private stepToward(t: { x: number; y: number }): void {
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    this.x += ax * 2 >= ay ? Math.sign(dx) : 0;
    this.y += ay * 2 >= ax ? Math.sign(dy) : 0;
    this.movedSinceCheck += 1;
  }

  private checkEncounterAt(env: TravelEnv): EncounterEvent | null {
    if (this.movedSinceCheck < ENCOUNTER_WINDOW_PX) return null;
    // Z: oryginal podaje dx/dy z okna ruchu; tu oba rowne przebytemu dystansowi (Czebyszew), by prosta linia tez mogla trafic.
    const moved = Math.max(
      Math.abs(this.x - this.lastCheckPos.x),
      Math.abs(this.y - this.lastCheckPos.y),
    );
    const elapsed = this.ticksSinceCheck;
    this.lastCheckPos = { x: this.x, y: this.y };
    this.movedSinceCheck = 0;
    this.ticksSinceCheck = 0;
    const found = this.cellAt(this.x, this.y);
    if (!found?.cell) return null;
    const { cfg } = this.data;
    const slotName = (n: string): number =>
      cfg.data.frequencies[n as keyof typeof cfg.data.frequencies] ?? 0;
    const slots: [number, number, number] = [
      slotName(found.cell.morning),
      slotName(found.cell.afternoon),
      slotName(found.cell.night),
    ];
    const res = checkEncounter(
      {
        elapsedTicks: elapsed,
        dx: moved,
        dy: moved,
        inCity: this.areaAt(this.x, this.y) >= 0,
        gameTicks: env.gameTicks,
        specialDone: this.specialDone,
        hhmm: env.hhmm,
        slotFrequencies: slots,
        difficulty: env.difficulty,
        car: this.driving,
        outdoorsman: env.outdoorsman,
      },
      env.rng,
    );
    if (res.kind === 'none') return null;
    const forced = res.kind === 'special';
    const table = cfg.tables.find(
      (t) => t.lookupName.toLowerCase() === found.cell!.encTable.toLowerCase(),
    );
    if (!table) return null;
    const wmEnv: WmEnv = {
      player: (s) => env.player(s),
      global: (i) => env.gvars[i] ?? 0,
      time: () => env.hhmm,
      numCritters: () => 0,
      rand: (pct) => env.rng.int(1, 100) <= pct,
    };
    const entries = table.entries.map((e, i) => {
      const w = toWmEntry(e);
      const c = this.counters.get(key(table.index, i));
      if (c !== undefined) w.counter = c;
      return w;
    });
    const terrainMaps = (cfg.randomMaps as Record<string, string[]>)[found.cell.terrain] ?? [];
    const pick = pickEncounterEntry({
      // wymuszona scena specjalna (> 35 dnia): tylko wpisy ze flaga Special, bez rzutu na wykrycie
      entries: forced ? entries.map((e) => (e.special ? e : { ...e, counter: 0 })) : entries,
      luck: env.luck,
      perks: env.perks,
      difficulty: env.difficulty,
      tableMaps: table.maps,
      terrainMaps,
      env: wmEnv,
      rng: env.rng,
    });
    if (forced) this.specialDone = true;
    if (pick.entryIndex < 0) return null;
    this.counters.set(key(table.index, pick.entryIndex), pick.newCounter);
    if (pick.special) this.specialDone = true;
    return {
      kind: 'encounter',
      prompt: forced ? false : res.prompt,
      xp: forced ? 0 : res.xp,
      tableIndex: table.index,
      entryIndex: pick.entryIndex,
      mapName: pick.map === undefined ? undefined : mapNameOf(this.data.maps, pick.map),
      special: pick.special,
      groups: pick.special ? [] : (table.entries[pick.entryIndex]?.encounters ?? []),
      ...(table.entries[pick.entryIndex]?.relation
        ? { relation: table.entries[pick.entryIndex]!.relation! }
        : {}),
      ...(table.entries[pick.entryIndex]?.relations
        ? { relations: table.entries[pick.entryIndex]!.relations! }
        : {}),
    };
  }

  /** Ustawia pozycje na srodku obszaru (wyjscie z mapy lokalnej na swiat). */
  placeAtArea(i: number): void {
    const a = this.data.areas[i];
    if (!a) return;
    this.x = a.worldPos.x;
    this.y = a.worldPos.y;
    this.lastCheckPos = { x: this.x, y: this.y };
    this.known.add(i);
    this.target = null;
    this.reveal();
  }

  // ----- zapis -----

  snapshot(): WorldmapSnapshot {
    return {
      x: this.x,
      y: this.y,
      fuel: this.fuel,
      car: this.car,
      fog: bytesToB64(this.fog),
      known: [...this.known],
      entrancesOn: Object.fromEntries(this.entrancesOn),
      counters: Object.fromEntries(this.counters),
      specialDone: this.specialDone,
      ticksSinceCheck: this.ticksSinceCheck,
    };
  }

  restore(s: WorldmapSnapshot): void {
    this.x = s.x;
    this.y = s.y;
    this.fuel = s.fuel;
    this.car = s.car;
    this.fog.set(b64ToBytes(s.fog).subarray(0, this.fog.length));
    this.known.clear();
    s.known.forEach((k) => this.known.add(k));
    for (const [k, v] of Object.entries(s.entrancesOn)) this.entrancesOn.set(k, v);
    this.counters.clear();
    for (const [k, v] of Object.entries(s.counters)) this.counters.set(k, v);
    this.specialDone = s.specialDone;
    this.ticksSinceCheck = s.ticksSinceCheck;
    this.lastCheckPos = { x: this.x, y: this.y };
    this.movedSinceCheck = 0;
    this.target = null;
  }
}

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s);
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
