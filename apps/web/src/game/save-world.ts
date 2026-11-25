import {
  GameClock,
  EventQueue,
  type GameMap,
  type GameObject,
  type GlobalVarsJSON,
  type PartyStateJSON,
  type MapRegistry,
  type MapStateJSON,
  type SaveItem,
  type SaveMapObject,
  type SavePlayer,
  type SaveSettings,
  type SaveWorld,
  type World,
} from '@f2/engine-core';

/** Flagi zalozenia przedmiotu na obiekcie (lewa reka, prawa reka, pancerz). */
export const FLAG_LEFT_HAND = 0x1000000;
export const FLAG_RIGHT_HAND = 0x2000000;
export const FLAG_WORN = 0x4000000;
const EQUIP_MASK = FLAG_LEFT_HAND | FLAG_RIGHT_HAND | FLAG_WORN;

/** Dane postaci gracza, ktorych nie niesie `GameObject` (statystyki, skille, perki, postep). */
export interface PlayerSheet {
  hp: number;
  radiation: number;
  poison: number;
  baseStats: number[];
  statBonuses: number[];
  skills: number[];
  taggedSkills: number[];
  skillUseSlots: { skill: number; atTick: number }[];
  perks: Record<string, number>;
  traits: number[];
  kills: number[];
  progress: SavePlayer['progress'];
  sneaking: boolean;
  /** Wynik ostatniego rzutu zdarzenia skradania 0x42e32c ([0x56d77c]); brak = porazka. */
  sneakRollOk?: boolean;
}

/** Indeksy statow plci i wieku (rules Stat.Gender = 34, Stat.Age = 33): domyslnie mezczyzna, 25 lat (nie 5). */
const STAT_AGE = 33;
const STAT_GENDER = 34;

export function defaultSheet(): PlayerSheet {
  const baseStats = new Array<number>(35).fill(5);
  baseStats[STAT_AGE] = 25;
  baseStats[STAT_GENDER] = 0;
  return {
    hp: 30,
    radiation: 0,
    poison: 0,
    baseStats,
    statBonuses: new Array<number>(35).fill(0),
    skills: new Array<number>(18).fill(0),
    taggedSkills: [],
    skillUseSlots: [],
    perks: {},
    traits: [],
    kills: new Array<number>(19).fill(0),
    progress: { level: 1, xp: 0, freeSkillPoints: 0, reputation: 0, karma: 0, perkPending: false },
    sneaking: false,
  };
}

/** Stan sesji poza `World` (to, co zapis zawiera dodatkowo). */
export interface SessionState {
  sheet: PlayerSheet;
  queue: EventQueue;
  rng: { seed: number };
  globals: Record<string, number>;
  settings: SaveSettings;
  scriptTimers: Record<string, number>;
  modData: Record<string, unknown>;
  /** Gra zakonczona (sekwencja konca odpalona); zapisywana (save v6), by wczytanie nie powtarzalo konca. */
  gameEnded: boolean;
  /** Bit 0x2 flagi gracza: czeka test promieniowania o polnocy (save v7; D 0x42d403/0x42d604). */
  radiationFlag: boolean;
}

export function defaultSessionState(): SessionState {
  return {
    sheet: defaultSheet(),
    queue: new EventQueue(),
    rng: { seed: 1 },
    globals: {},
    settings: { gameDifficulty: 1, combatDifficulty: 1, violence: 2 },
    scriptTimers: {},
    modData: {},
    gameEnded: false,
    radiationFlag: false,
  };
}

export function equippedSlotOf(flags: number): SaveItem['equippedSlot'] {
  if (flags & FLAG_LEFT_HAND) return 'left';
  if (flags & FLAG_RIGHT_HAND) return 'right';
  if (flags & FLAG_WORN) return 'armor';
  return null;
}

/** Bron: extra.raw = [naboje, PID zaladowanej amunicji] (obj+0x3c / +0x40, D 0x479190). */
function weaponAmmo(o: GameObject): { ammo: number | null; ammoPid: number | null } {
  if (o.extra.kind !== 'item' || o.extra.raw.length < 2) return { ammo: null, ammoPid: null };
  const ammoPid = o.extra.raw[1] ?? -1;
  if (ammoPid === -1) return { ammo: null, ammoPid: null };
  return { ammo: o.extra.raw[0] ?? 0, ammoPid };
}

export function toSaveItem(o: GameObject): SaveItem {
  const { ammo, ammoPid } = weaponAmmo(o);
  return {
    pid: o.pid,
    count: o.quantity ?? 1,
    equippedSlot: equippedSlotOf(o.flags),
    ammo,
    ammoPid,
    contents: o.inventory.map(toSaveItem),
  };
}

export function toSavePlayer(player: GameObject, sheet: PlayerSheet): SavePlayer {
  return {
    objId: player.id,
    hex: player.hex,
    elevation: player.elevation,
    orientation: player.rotation,
    flags: player.flags & ~EQUIP_MASK,
    inventory: player.inventory.map(toSaveItem),
    hp: sheet.hp,
    radiation: sheet.radiation,
    poison: sheet.poison,
    baseStats: [...sheet.baseStats],
    statBonuses: [...sheet.statBonuses],
    skills: [...sheet.skills],
    taggedSkills: [...sheet.taggedSkills],
    skillUseSlots: sheet.skillUseSlots.map((s) => ({ ...s })),
    perks: { ...sheet.perks },
    traits: [...sheet.traits],
    kills: [...sheet.kills],
    progress: { ...sheet.progress },
    sneaking: sheet.sneaking,
    ...(sheet.sneakRollOk ? { sneakRollOk: true } : {}),
  };
}

export function sheetFromSave(p: SavePlayer): PlayerSheet {
  return {
    hp: p.hp,
    radiation: p.radiation,
    poison: p.poison,
    baseStats: [...p.baseStats],
    statBonuses: [...p.statBonuses],
    skills: [...p.skills],
    taggedSkills: [...p.taggedSkills],
    skillUseSlots: p.skillUseSlots.map((s) => ({ ...s })),
    perks: { ...p.perks },
    traits: [...p.traits],
    kills: [...p.kills],
    progress: { ...p.progress },
    sneaking: p.sneaking,
    ...(p.sneakRollOk ? { sneakRollOk: true } : {}),
  };
}

function toSaveMapObject(o: GameObject): SaveMapObject {
  return {
    objId: o.id,
    pid: o.pid,
    hex: o.hex,
    orientation: o.rotation,
    flags: o.flags,
    hp: 0,
    scriptLocalId: o.scriptId >= 0 ? o.scriptId : null,
    inventory: o.inventory.map(toSaveItem),
  };
}

/** Migawka zywej mapy (bez gracza) w formacie rejestru map / zapisu. */
export function captureMapState(map: GameMap, tick: number, playerId?: number): MapStateJSON {
  const elevations: { objects: SaveMapObject[] }[] = [0, 1, 2].map((e) => ({
    objects: map.objects.filter((o) => o.elevation === e && o.id !== playerId).map(toSaveMapObject),
  }));
  return {
    name: map.name,
    lastVisitTick: tick,
    mapVars: Array.from(map.localVars),
    scriptLocals: {},
    elevations,
  };
}

/** Sklada `SaveWorld` z prawdziwego `World` + stanu sesji + rejestru map. */
export function buildSaveWorld(
  world: World,
  state: SessionState,
  registry: MapRegistry,
  encounter = false,
  extras?: { snapshot(): { party: PartyStateJSON | null; gvars: GlobalVarsJSON | null } },
): SaveWorld {
  const ex = extras?.snapshot();
  const current =
    world.scripts?.captureCurrentMapState() ??
    captureMapState(world.map, world.clock.ticks, world.player.id);
  const maps = registry.serialize().filter((m) => m.name !== current.name);
  maps.push(current);
  return {
    clock: new GameClock(world.clock.ticks),
    queue: state.queue,
    rng: { ...state.rng },
    globals: { ...state.globals },
    player: toSavePlayer(world.player, state.sheet),
    currentMap: {
      name: world.map.name,
      elevation: world.player.elevation,
      ...(encounter ? { encounter: true } : {}),
    },
    maps,
    settings: { ...state.settings },
    scriptTimers: { ...state.scriptTimers },
    modData: structuredClone(state.modData),
    ...(state.gameEnded ? { gameEnded: true } : {}),
    ...(state.radiationFlag ? { radiationFlag: true } : {}),
    ...(ex ? { party: ex.party, gvars: ex.gvars } : {}),
    ...(world.scripts?.movieFlags ? { movieFlags: Array.from(world.scripts.movieFlags) } : {}),
  };
}
