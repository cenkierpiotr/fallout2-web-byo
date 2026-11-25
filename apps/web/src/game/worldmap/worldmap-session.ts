import {
  Perk,
  Skill,
  Stat,
  skillLevel,
  statLevel,
  type SkillCritter,
  type SkillsContext,
} from '@f2/rules';
import type { CarState, CarStateJSON } from '@f2/engine-core';
import type { GameSession } from '../game-session';
import { critterKill, directionTo, findPath, isHexBlocked } from '@f2/engine-core';
import {
  planCombatRequest,
  planEncounterGroup,
  spawnGroup,
  type CombatRequest,
} from './worldmap-group';
import type { EncounterEvent } from './worldmap-model';
import { createSheetCritter } from '../sheet-critter';
import type { SessionExtras } from '../session-extras';
import type { MapEntry } from '../../screens/map/maps-txt';
import { WorldmapController, hhmmOf, type WorldmapHost } from './worldmap-controller';
import { loadWorldmapData } from './worldmap-load';
import type { WorldmapSnapshot } from './worldmap-model';

/** Klucz w `SessionState.modData`, pod ktorym trzymany jest stan mapy swiata (zapis gry). */
export const WORLDMAP_KEY = 'worldmap';

const RESULT_DEAD = 0x80;

const PERK_BY_NAME: Readonly<Record<string, number>> = {
  explorer: Perk.Explorer,
  pathfinder: Perk.Pathfinder,
  scout: Perk.Scout,
  ranger: Perk.Ranger,
  'cautious nature': Perk.CautiousNature,
  'fortune finder': Perk.FortuneFinder,
};

/** Atrapa gvars: odczyt po indeksie wprost z GlobalVars sesji (brak = 0). */
export function gvarsOf(
  extras: Pick<SessionExtras, 'gvars'> | undefined,
): Readonly<Record<number, number>> {
  return new Proxy({} as Record<number, number>, {
    get: (_t, k) =>
      typeof k === 'string' && /^\d+$/.test(k) ? (extras?.gvars.get(Number(k)) ?? 0) : undefined,
  });
}

/** Samochod gracza: zywy widok na pola ScriptRuntime (paliwo, ruch, obszar). */
function carOf(rt: {
  carFuel: number;
  carMoving: boolean;
  carArea: number;
  car?: CarState;
}): NonNullable<WorldmapHost['car']> {
  return {
    ...(rt.car ? { state: rt.car } : {}),
    get fuel() {
      return rt.carFuel;
    },
    set fuel(v: number) {
      rt.carFuel = v;
    },
    get moving() {
      return rt.carMoving;
    },
    set moving(v: boolean) {
      rt.carMoving = v;
    },
    get area() {
      return rt.carArea;
    },
    set area(v: number) {
      rt.carArea = v;
    },
  };
}

/** Fragment obiektu towarzysza potrzebny do liczenia skilla (proto krytera + stan zgonu). */
export interface PartyMemberLike {
  proto: {
    kind: string;
    baseStats?: (number | undefined)[];
    bonusStats?: (number | undefined)[];
    skills?: number[];
  };
  extra: { kind: string; raw?: ArrayLike<number> };
}

/**
 * Najlepszy poziom skilla w druzynie (Z: 0x495520-podobny f2_party_best_skill): max z gracza i zywych towarzyszy.
 * Towarzysz liczony jak NPC (`isPlayer: false`): baza + mnoznik statow + punkty z proto, bez tagow/perkow gracza.
 */
export function partyBestSkill(
  own: number,
  members: readonly PartyMemberLike[],
  skill: Skill,
  ctx: SkillsContext,
): number {
  let best = own;
  for (const m of members) {
    const p = m.proto;
    if (p.kind !== 'critter') continue;
    if (m.extra.kind === 'critter' && ((m.extra.raw?.[3] ?? 0) & RESULT_DEAD) !== 0) continue;
    const npc = {
      isPlayer: false,
      baseStats: p.baseStats ?? [],
      bonusStats: p.bonusStats ?? [],
      skillRaw: p.skills ?? [],
      tags: [-1, -1, -1, -1],
      perkRanks: {},
      traits: [-1, -1],
      curHP: 1,
      curPoison: 0,
      curRad: 0,
      blinded: false,
      carriedWeight: 0,
      heldItemPids: [],
      hasRealWeaponInHand: false,
      apLeft: 0,
    } as unknown as SkillCritter;
    best = Math.max(best, skillLevel(npc, skill, ctx));
  }
  return best;
}

/** Most sesja gry -> WorldmapHost (zegar, statystyki, perki, gvars). */
export function hostFromSession(
  session: GameSession,
  extras: SessionExtras | undefined,
  fixes?: Readonly<Record<string, boolean>>,
): WorldmapHost {
  const sheet = (): GameSession['state']['sheet'] => session.state.sheet;
  const critter = createSheetCritter(sheet);
  const rng = {
    int: (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1)),
  };
  const ctx = (): SkillsContext => ({
    fixes: { ...(fixes ?? {}) },
    rng,
    clock: session.world.clock,
    difficulty: session.state.settings.gameDifficulty,
  });
  const stat = (s: Stat): number => statLevel(critter, s, ctx());
  const clamp = (n: number): 0 | 1 | 2 => (n <= 0 ? 0 : n >= 2 ? 2 : 1);
  return {
    ticks: () => session.world.clock.ticks,
    advance: (n) => {
      session.world.clock.advance(n);
      session.world.scripts?.syncClock();
    },
    rng,
    difficulty: () => clamp(session.state.settings.gameDifficulty),
    player: (s) => {
      const k = s.toLowerCase();
      if (k === 'level') return sheet().progress.level;
      if (k === 'perception') return stat(Stat.Perception);
      if (k === 'luck') return stat(Stat.Luck);
      return 0;
    },
    luck: () => stat(Stat.Luck),
    outdoorsman: () => {
      const own = skillLevel(critter, Skill.Outdoorsman, ctx());
      const members = session.world.scripts?.inventory.partyObjects() ?? [];
      return partyBestSkill(own, members, Skill.Outdoorsman, ctx());
    },
    perk: (name) => {
      const id = PERK_BY_NAME[name.toLowerCase()];
      return id === undefined ? 0 : (sheet().perks[id] ?? 0);
    },
    gvars: gvarsOf(extras),
    ...(session.world.scripts ? { car: carOf(session.world.scripts) } : {}),
    ...(fixes ? { fixes } : {}),
  };
}

/** Buduje kontroler mapy swiata dla sesji: dane z gry, stan z zapisu, znane obszary ze skryptow. */
export async function createWorldmapForSession(args: {
  session: GameSession;
  extras: SessionExtras | undefined;
  read: (path: string) => Promise<string>;
  maps: MapEntry[];
  knownAreas: ReadonlyMap<number, number>;
  fixes?: Readonly<Record<string, boolean>>;
}): Promise<WorldmapController> {
  const data = await loadWorldmapData(args.read, args.maps);
  const ctl = new WorldmapController(data, hostFromSession(args.session, args.extras, args.fixes));
  const saved = args.session.state.modData[WORLDMAP_KEY] as WorldmapSnapshot | undefined;
  if (saved) ctl.restore(saved);
  restoreCar(args.session);
  ctl.syncKnownAreas(args.knownAreas);
  return ctl;
}

export const CAR_KEY = 'car';

export function saveWorldmap(session: GameSession, ctl: WorldmapController): void {
  session.state.modData[WORLDMAP_KEY] = ctl.snapshot();
  saveCar(session);
}

/** Klucz w `modData`: zapis zrobiony, gdy ekran mapy swiata byl otwarty (wczytanie wraca na mape swiata). */
export const WORLDMAP_OPEN_KEY = 'worldmapOpen';

/**
 * Stan mapy swiata i samochodu do zapisu gry (wolane tuz przed kazdym zapisem, takze autozapisem).
 * `ctl` = kontroler sesji, jesli ekran mapy swiata byl juz tworzony; `open` = ekran jest teraz widoczny.
 */
export function captureWorldmapForSave(
  session: GameSession,
  ctl: WorldmapController | null,
  open: boolean,
): void {
  if (ctl) saveWorldmap(session, ctl);
  if (open) session.state.modData[WORLDMAP_OPEN_KEY] = 1;
  else delete session.state.modData[WORLDMAP_OPEN_KEY];
}

/** Czy wczytany zapis zostal zrobiony na ekranie mapy swiata. */
export function worldmapWasOpen(session: GameSession): boolean {
  return session.state.modData[WORLDMAP_OPEN_KEY] === 1;
}

/** Samochod do zapisu (modData): paliwo, obszar, bagaznik. Bez skryptow nic nie zapisuje. */
export function saveCar(session: GameSession): void {
  const car = session.world.scripts?.car;
  if (car) session.state.modData[CAR_KEY] = car.toJSON();
}

/** Odtwarza samochod z zapisu (brak wpisu = stan domyslny); wolac po zaladowaniu sesji. */
export function restoreCar(session: GameSession): boolean {
  const car = session.world.scripts?.car;
  const j = session.state.modData[CAR_KEY] as CarStateJSON | undefined;
  if (!car || !j || j.version !== 1) return false;
  car.restoreFrom(j);
  return true;
}

const pendingCombatRequests = new WeakMap<GameSession, CombatRequest[]>();

/** Zadania walki ustawione przez spawn spotkania (jednorazowe; exe 0x4a45d4) do przekazania w `CombatStartOptions.requests`. */
export function takeCombatRequests(session: GameSession): CombatRequest[] {
  const r = pendingCombatRequests.get(session) ?? [];
  pendingCombatRequests.delete(session);
  return r;
}

/** Po wejsciu na mape spotkania: tworzy grupe NPC wpisu tabeli wokol gracza. Zwraca liczbe utworzonych krytterow. */
export function spawnEncounterGroups(
  session: GameSession,
  extras: SessionExtras | undefined,
  ctl: WorldmapController,
  ev: EncounterEvent,
  fixes?: Readonly<Record<string, boolean>>,
  /** Heksy `random_start_point` mapy spotkania (formacje inne niz Surrounding); brak = heks gracza. */
  starts?: readonly number[],
): number {
  const rt = session.world.scripts;
  if (!rt || ev.groups.length === 0) return 0;
  const host = hostFromSession(session, extras, fixes);
  const w = session.world;
  const elevation = w.player.elevation;
  const members = planEncounterGroup(ctl.data.cfg, ev, w.player.hex, {
    rng: host.rng,
    player: (s) => host.player(s),
    global: (i) => host.gvars[i] ?? 0,
    time: () => hhmmOf(host.ticks()),
    free: (h) => h >= 0 && h < 40000 && !isHexBlocked(w.map, elevation, h),
    reachable: (h) => findPath(w.map, elevation, w.player.hex, h, w.player) !== null,
    // exe 0x42dd18: druzyna = zywy krytter, niewidoczny odpada; poziom nie jest warunkiem
    partySize:
      1 +
      (rt.inventory.partyObjects() ?? []).filter(
        (o) =>
          o.id !== w.player.id &&
          !o.hidden &&
          o.extra.kind === 'critter' &&
          ((o.extra.raw[3] ?? 0) & 0x80) === 0,
      ).length,
    cautiousNature: host.perk('cautious nature') > 0,
    fortuneFinder: host.perk('fortune finder') > 0,
    ...(starts ? { starts } : {}),
  });
  const spawner = {
    createObject: (pid: number, hex: number, el: number, sid: number) =>
      rt.createObject(pid, hex, el, sid),
    addMultObjsToInven: (w: number, i: number, c: number) => rt.addMultObjsToInven(w, i, c),
    wieldObjCritter: (w: number, i: number) => rt.wieldObjCritter(w, i),
    critterAddTrait: (id: number, k: number, t: number, a: number) =>
      rt.critterAddTrait(id, k, t, a),
    killCritter: (id: number) => {
      const o = w.map.objects.find((x) => x.id === id);
      if (o) critterKill(o);
    },
    faceTowards: (id: number, target: number) => {
      const o = w.map.objects.find((x) => x.id === id);
      if (o) o.rotation = directionTo(o.hex, target);
    },
  };
  const firstByGroup = new Map<number, number>();
  const ids = spawnGroup(spawner, members, elevation, { player: w.player.hex, firstByGroup });
  const req = planCombatRequest(ev.relations, firstByGroup, w.player.id);
  if (req) pendingCombatRequests.set(session, [req]);
  return ids.length;
}
