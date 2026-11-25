import {
  BodyPart,
  DamageType,
  SKILL_DEFS,
  ATTACK_MODE_CLASS,
  createRng,
  displayToHit,
  resolveBurst,
  resolveBurstSpread,
  burstRayEnds,
  applyPartyOrders,
  type AiPacketTable,
  type PartyOrders,
  ammoModsOf,
  playerLightPenalty,
  type Difficulty,
  type Rng,
  type SeededRng,
} from '@f2/rules';
import {
  hexInDirection,
  hexNeighbors,
  type Direction,
  findPath,
  hexDistance,
  moveObject,
  type GameObject,
  type World,
} from '@f2/engine-core';
import {
  CombatSession,
  type AttackMode,
  type CombatEnv,
  FISTS,
  weaponInMode,
  type AttackOutcome,
  type Combatant,
  type CombatEvent,
  type CombatSessionSave,
  type WeaponSpec,
} from './combat';
import { inventoryOpenApCost, maxApOf, maxHpOf } from './chem';
import { getCombatAiData } from './combat-ai-data';
import { Perk, Trait, throwRange } from '@f2/rules';
import type { CritterProto } from '@f2/formats';
import {
  createRulesResolver,
  hitChance,
  type HitExtras,
  type ToHitHookFactory,
} from './combat-rules';
import { SHOT_GEOMETRY, coverCountBetween, critterRay, missRedirectHex } from './combat-line';
import { FLAG_LEFT_HAND, FLAG_RIGHT_HAND, type PlayerSheet, type SessionState } from './save-world';

/** Minimalny widok sesji gry potrzebny walce (GameSession spelnia go strukturalnie). */
export interface CombatHost {
  world: Pick<World, 'map' | 'player' | 'movement' | 'scripts'>;
  state: Pick<SessionState, 'sheet' | 'rng'>;
  enemiesNearby: () => boolean;
  /** Druzyna sesji (GameSession.extras): rozkazy towarzyszy nakladane na ich pakiety AI w walce. */
  extras?: { party: { ordersOf(objId: number): PartyOrders } };
}

const STAT = {
  PE: 1,
  AG: 5,
  LK: 6,
  AP: 8,
  AC: 9,
  /** Statystyki SPECIAL zajmuja indeksy 0..6 (ST, PE, EN, CH, IN, AG, LK). */
  SEQ: 13,
  CRIT: 15,
  BETTER: 16,
  DT0: 17,
  DR0: 24,
  /** D (exe, komunikaty combat.msg): stat 0x22 = plec, 1 = zenska. */
  GENDER: 0x22,
} as const;
const SKILL_UNARMED = 3;
const SKILL_MELEE = 4;
const SKILL_THROWING = 5;
const SKILL_SMALL_GUNS = 0;
const SKILL_ENERGY = 2;
const FLAG_NO_BLOCK = 0x10;
/** Bit "martwy" w polu wynikow krytera mapy (raw[3], Z: etykieta pola). */
const RESULT_DEAD = 0x80;
/** Zasieg wykrywania wrogow na starcie walki (hexy) i limit uczestnikow. */
/** Indeks klatki zwlok: renderer przycina do ostatniej klatki klipu smierci. */
export const CORPSE_LAST_FRAME = 255;
export const COMBAT_RADIUS = 20;
export const COMBAT_MAX_FOES = 4;
/** Limit towarzyszy dolaczajacych do walki po stronie gracza. */
export const COMBAT_MAX_ALLIES = 4;

type Stats = (i: number) => number;

/**
 * Sciezka ucieczki: z heksow w promieniu `maxSteps` wybiera ten, ktory najbardziej oddala od wroga
 * (przy remisie krotsza droga) i jest osiagalny w limicie AP; null = przyparty (Z: bez szukania kryjowki).
 */
export function fleePath(
  pathTo: (hex: number) => number[] | null,
  from: number,
  enemy: number,
  maxSteps: number,
): number[] | null {
  const cur = hexDistance(from, enemy);
  const seenHex = new Set<number>([from]);
  let ring = [from];
  const cands: number[] = [];
  for (let step = 1; step <= maxSteps; step++) {
    const next: number[] = [];
    for (const h of ring)
      for (const n of hexNeighbors(h)) {
        if (seenHex.has(n)) continue;
        seenHex.add(n);
        next.push(n);
        if (hexDistance(n, enemy) > cur) cands.push(n);
      }
    ring = next;
  }
  cands.sort(
    (a, b) =>
      hexDistance(b, enemy) - hexDistance(a, enemy) || hexDistance(from, a) - hexDistance(from, b),
  );
  let tries = 0;
  for (const h of cands) {
    if (tries++ >= 12) break;
    const p = pathTo(h);
    if (p && p.length > 0 && p.length <= maxSteps) return p;
  }
  return null;
}

function weaponSkillIndex(w: Pick<WeaponSpec, 'cls' | 'damageType' | 'explosive'>): number {
  if (w.cls === 1) return SKILL_UNARMED;
  if (w.cls === 2) return SKILL_MELEE;
  if (w.cls === 3 || w.explosive) return SKILL_THROWING;
  const d = w.damageType;
  return d === DamageType.Laser || d === DamageType.Plasma || d === DamageType.Electrical
    ? SKILL_ENERGY
    : SKILL_SMALL_GUNS;
}

/** Wartosc skilla (Z: uproszczona f2_skill_level, bez perkow/cech; tag +20). */
export function skillValue(skill: number, stat: Stats, raw: number, tagged: boolean): number {
  const d = SKILL_DEFS[skill];
  if (!d) return 0;
  let sum = 0;
  for (const s of d.stats) sum += stat(s);
  let v = d.base + d.multiplier * sum + d.pointMult * raw;
  if (tagged) v += d.pointMult * raw + 20;
  return Math.min(300, Math.max(0, v));
}

/**
 * Bron z proto przedmiotu. Z (pro.md): nazwy pol `data` broni; przyjete wg ukladu proto F2
 * (1 min, 2 max, 3 typ obrazen, 4 zasieg, 8 koszt AP, 12 pociski serii). Wartosci poza rozsadnym
 * zakresem odrzucane (wtedy piesc).
 */
export function weaponFromObject(
  obj: GameObject | undefined,
  stat: Stats,
  raw: number[],
  tags: number[],
  ammoProto?: (pid: number) => readonly number[] | undefined,
): WeaponSpec | null {
  const p = obj?.proto;
  if (!obj || p?.kind !== 'item' || p.subtype !== 3) return null;
  const d = p.data;
  const min = d[1] ?? 0;
  const max = d[2] ?? 0;
  const dtype = d[3] ?? 0;
  const range = d[4] ?? 0;
  const ap = d[8] ?? 0;
  if (max <= 0 || min > max || min < 0 || ap < 1 || ap > 12 || dtype < 0 || dtype > 6) return null;
  const rounds = Math.max(1, Math.min(d[12] ?? 1, 20));
  // tryby ataku: nibble proto+0x18 (dolny = tryb 1, gorny = tryb 2), kody 6 pojedynczy, 7 seria, 8 plomien; klasa z tablicy 0x5191a8 (D)
  const ext = p.extFlags ?? 0;
  const t1 = ext & 0xf;
  const t2 = (ext >> 4) & 0xf;
  const known = t1 !== 0 || t2 !== 0;
  const modeClass = (t: number): 1 | 2 | 3 | 4 | null => {
    const c = t >= 1 && t <= 8 ? (ATTACK_MODE_CLASS[t] ?? 0) : 0;
    return c >= 1 && c <= 4 ? (c as 1 | 2 | 3 | 4) : null;
  };
  const primaryCls = known ? modeClass(t1) : null;
  const burst =
    known && primaryCls !== null ? (t1 === 7 || t1 === 8 ? rounds : 1) : range > 1 ? rounds : 1;
  const spec: WeaponSpec = {
    name: `pid${obj.pid.toString(16)}`,
    pid: obj.pid,
    minDmg: min,
    maxDmg: max,
    apCost: ap,
    range: Math.max(1, range),
    skill: 0,
    burst: range > 1 || primaryCls !== null ? burst : 1,
    damageType: dtype as DamageType,
    cls: primaryCls ?? (range > 1 ? 4 : 2),
    minSt: d[7] ?? 0,
    ...(((d[11] ?? 0) > 0 ? { weaponPerk: d[11] } : {}) as { weaponPerk?: number }),
    twoHanded: ((p.extFlags ?? 0) & 0x200) !== 0,
  };
  // drugi tryb (data[9] = koszt AP, 0x478c68; data[5] = zasieg drugiego trybu, Z: pole zasiegu)
  const secondaryCls = modeClass(t2);
  if (secondaryCls !== null) {
    const ap2 = d[9] ?? 0;
    spec.apCost2 = ap2 >= 1 && ap2 <= 12 ? ap2 : ap;
    const range2 = d[5] ?? 0;
    spec.secondary = {
      range: Math.max(1, range2 > 0 ? range2 : range),
      burst: t2 === 7 || t2 === 8 ? rounds : 1,
      cls: secondaryCls,
    };
  }
  // D (0x479190): PID zaladowanej amunicji = obj+0x40 (MAP: raw[1] przedmiotu); AC [2], DR [3] proto amunicji
  const ammoPid =
    obj.extra.kind === 'item' && obj.extra.raw.length > 1 ? (obj.extra.raw[1] ?? -1) : -1;
  if (ammoProto && ammoPid !== -1) {
    const m = ammoModsOf(ammoPid, ammoProto);
    spec.ammoAcMod = m.acMod;
    spec.ammoDrMod = m.drMod;
    spec.ammoMult = m.dmgMult;
    spec.ammoDiv = m.dmgDiv;
  }
  const idx = weaponSkillIndex(spec);
  spec.skill = skillValue(idx, stat, raw[idx] ?? 0, tags.includes(idx));
  return spec;
}

function equippedWeapons(
  owner: GameObject,
  stat: Stats,
  raw: number[],
  tags: number[],
  ammoProto?: (pid: number) => readonly number[] | undefined,
): WeaponSpec[] {
  const out: WeaponSpec[] = [];
  for (const it of owner.inventory) {
    if ((it.flags & (FLAG_RIGHT_HAND | FLAG_LEFT_HAND)) === 0) continue;
    const w = weaponFromObject(it, stat, raw, tags, ammoProto);
    if (w) out.push(w);
  }
  return out;
}

/** Heave Ho (perk 35, D 0x478ac9): zasieg rzutu (klasa 3) = min(zasieg z proto, 3 * (ST + 2 * ranga)), takze drugi tryb. */
export function withThrowRange(
  w: WeaponSpec,
  strength: number,
  heaveHoRank: number,
  isPlayer: boolean,
): WeaponSpec {
  const cap = (r: number): number => Math.max(1, throwRange(r, strength, heaveHoRank, isPlayer));
  let out = w;
  if (w.cls === 3) out = { ...out, range: cap(w.range) };
  if (w.secondary?.cls === 3)
    out = { ...out, secondary: { ...w.secondary, range: cap(w.secondary.range) } };
  return out;
}

function stats(
  base: readonly (number | undefined)[],
  bonus: readonly (number | undefined)[],
): Stats {
  return (i) => (base[i] ?? 0) + (bonus[i] ?? 0);
}

function build(
  obj: GameObject,
  stat: Stats,
  raw: number[],
  tags: number[],
  isPlayer: boolean,
  hp: number,
  team: number,
  killType: number,
  sheet?: {
    traits: readonly number[];
    perks: Readonly<Record<string, number>>;
    sneaking?: boolean;
  },
  ammoProto?: (pid: number) => readonly number[] | undefined,
): Omit<Combatant, 'ap'> {
  const fists = {
    ...FISTS,
    skill: skillValue(SKILL_UNARMED, stat, raw[SKILL_UNARMED] ?? 0, tags.includes(SKILL_UNARMED)),
  };
  const heaveHo = isPlayer ? (sheet?.perks[Perk.HeaveHo] ?? 0) : 0;
  const hands = equippedWeapons(obj, stat, raw, tags, ammoProto).map((x) =>
    withThrowRange(x, stat(0), heaveHo, isPlayer),
  );
  const w = hands[0] ?? fists;
  const pe = stat(STAT.PE) || 5;
  const range = (from: number): number[] => Array.from({ length: 7 }, (_, i) => stat(from + i));
  return {
    id: obj.id,
    pid: obj.pid,
    team,
    hp,
    maxAp: Math.max(5, stat(STAT.AP) || 6),
    sequence: stat(STAT.SEQ) || 2 * pe,
    agility: stat(STAT.AG) || 5,
    hex: obj.hex,
    // D (0x4246c6): cel z flaga obiektu +0x25 & 8 (0x800) = wieloheksowy, +15 do trafienia
    ...((obj.flags & 0x800) !== 0 ? { multihex: true } : {}),
    isPlayer,
    name: isPlayer ? 'player' : `npc${obj.pid.toString(16)}`,
    luck: stat(STAT.LK) || 5,
    perception: pe,
    ac: stat(STAT.AC),
    dt: range(STAT.DT0),
    dr: range(STAT.DR0),
    critChance: stat(STAT.CRIT),
    betterCriticals: stat(STAT.BETTER),
    special: Array.from({ length: 7 }, (_, i) => stat(i)),
    killType,
    ...(obj.proto?.kind === 'critter' ? { bodyType: (obj.proto as CritterProto).bodyType } : {}),
    rotation: obj.rotation,
    ...(isPlayer && sheet?.sneaking ? { sneaking: true } : {}),
    ...(stat(STAT.GENDER) === 1 ? { female: true } : {}),
    // perki i traity tylko gracza (atakApCost ignoruje je dla NPC); klucze arkusza to id perku jako tekst
    ...(isPlayer && sheet
      ? {
          traits: [...sheet.traits],
          perks: Object.fromEntries(Object.entries(sheet.perks).map(([k, v]) => [Number(k), v])),
        }
      : {}),
    // +0x44 obiektu krytera = flagi obrazen (raw[3]); 0x4/0x8 = okaleczona lewa/prawa noga (0x42e62c)
    legFlags: obj.extra.kind === 'critter' ? (obj.extra.raw[3] ?? 0) & 0xc : 0,
    // gracz: jedna aktywna bron; NPC: do dwoch broni z rak, z ktorych AI wybiera (best_weapon)
    weapons: isPlayer ? [w] : hands.length > 0 ? hands.slice(0, 2) : [w],
  };
}

/** Jinxed gracza: atut 9 w slocie albo perk 118 (D 0x4238b2). */
export function sheetJinxed(sheet: {
  traits: readonly number[];
  perks: Readonly<Record<string, number>>;
}): boolean {
  return sheet.traits.includes(Trait.Jinxed) || (sheet.perks[Perk.Jinxed] ?? 0) > 0;
}

/** Zapis trwajacej walki (Zadanie 43): stan sesji + generator losowy + celowanie. */
export interface CombatSave {
  version: 1;
  session: CombatSessionSave;
  /** Pelny stan generatora (SeededRng.state()). */
  rng: number;
  aim: BodyPart;
  /** Wybrany tryb ataku gracza (brak = 0); starsze zapisy go nie maja. */
  mode?: AttackMode;
}

export interface CombatStartOptions {
  /** Odtwarza walke z zapisu: uczestnicy z swiata jak zwykle, potem stan z `CombatSave` (bez ruchu AI na starcie). */
  restore?: CombatSave;
  seed?: number;
  difficulty?: Difficulty;
  onChange?: () => void;
  /** Zabicie krytera przez walke: XP z proto (`expForKill`) i typ ciala do licznika zabojstw. */
  onKill?: (xp: number, killType: number) => void;
  /** Pakiety AI z AI.TXT (po packet_num z proto krytera); brak = proste AI. */
  ai?: AiPacketTable;
  /** Wywolywane dla taunta NPC (numer wiersza combatai.msg). */
  onTaunt?: (npcId: number, msgId: number) => void;
  /** Kazde nowe zdarzenie walki (atak, smierc, ruch...), np. do animacji krytterow na mapie. */
  onEvent?: (e: CombatEvent) => void;
  /** Wlasny pathfinder (testy); domyslnie A* z engine-core. */
  path?: (from: number, to: number, o: GameObject) => number[] | null;
  /** Zadania walki ze spawnu spotkania (AMBUSH/FIGHTING); uzywane jest pierwsze: atakujacy otwiera tury i ma ustawiony cel. */
  requests?: readonly { attacker: number; defender: number }[];
  /** Dane proto amunicji (`Proto.data` podtypu 4) po PID z cache; brak = amunicja bez modyfikatorow. */
  ammoProto?: (pid: number) => readonly number[] | undefined;
  /** Swiatlo heksa 0..0x10000 (LightMap, 0x48ad04); brak = kara swiatla pominieta. */
  hexLight?: (hex: number) => number;
  /** Swiatlo otoczenia 0x4000..0x10000 (Solar Scorcher, D 0x478874); brak = bez ograniczenia. */
  ambientLight?: () => number;
}

/**
 * Prawdziwa walka w sesji gry: uczestnicy z proto mapy, resolver z `@f2/rules`, sciezki z A*
 * (engine-core), synchronizacja HP z arkuszem, zabici zostaja jako zwloki (sprite wariantu smierci, ostatnia klatka;
 * animacje atak/unik/smierc na mapie przez onEvent -> AnimDirector w map-screen).
 */
export class CombatController {
  readonly combat: CombatSession;
  /** Celowana czesc ciala dla nastepnego ataku gracza (Uncalled = bez celowania). */
  aim: BodyPart = BodyPart.Uncalled;
  /** Tryb ataku gracza: 0 podstawowy, 1 drugi tryb broni (data[9], 0x478b24). */
  mode: AttackMode = 0;
  private readonly rng: SeededRng;
  private readonly toHitHook: ToHitHookFactory | undefined;

  /**
   * Wejscia z mapy do szansy trafienia: osłona z linii strzalu (0x426cc4, tylko bron dystansowa,
   * wynik liczony przez determineToHit tylko gdy useDistance) i kara swiatla celu (krok 11, tylko
   * gracz jako atakujacy; bron z perkiem broni 0x42 = pelne swiatlo).
   */
  private readonly hitExtras: HitExtras = (a, t, w) => {
    const out: { coverCount?: number; lightPenalty?: number } = {};
    const ao = this.objs.get(a.id);
    const to = this.objs.get(t.id);
    const ranged = w.cls === 3 || w.cls === 4 || (w.cls === undefined && w.range > 1);
    if (ranged && ao && to) out.coverCount = coverCountBetween(this.host.world.map, ao, to);
    const hexLight = this.opts.hexLight;
    if (a.isPlayer && hexLight)
      out.lightPenalty = playerLightPenalty(hexLight(t.hex), w.weaponPerk === 0x42);
    return out;
  };
  private seen = 0;

  private constructor(
    private readonly host: CombatHost,
    parts: Omit<Combatant, 'ap'>[],
    private readonly objs: Map<number, GameObject>,
    private readonly opts: CombatStartOptions,
  ) {
    this.rng = createRng(opts.seed ?? host.state.rng.seed);
    const sfall = host.world.scripts?.sfall;
    this.toHitHook = sfall ? (a, t, p) => sfall.toHitHook(a, t, p) : undefined;
    const { map, player, movement } = host.world;
    const env: CombatEnv = {
      rng: this.rng,
      ...(opts.ambientLight ? { ambientLight: opts.ambientLight } : {}),
      neighbor: (h: number, d: number): number => hexInDirection(h, d as Direction),
      path: (c: Combatant, to: number): number[] | null => {
        const o = this.objs.get(c.id);
        if (!o) return null;
        if (opts.path) return opts.path(c.hex, to, o);
        const p = findPath(map, o.elevation, c.hex, to, o, { doorPolicy: movement.doorPolicy });
        return p ? [...p] : null;
      },
      hitChance: (a: Combatant, t: Combatant, w: WeaponSpec, d: number): number =>
        hitChance(a, t, w, BodyPart.Uncalled, d, this.toHitHook, {
          difficulty: opts.difficulty ?? 'normal',
          playerTeam: 0,
          ...this.hitExtras(a, t, w),
        }),
      flee: (c: Combatant, from: Combatant, maxSteps: number): number[] | null => {
        const o = this.objs.get(c.id);
        if (!o || maxSteps <= 0) return null;
        return fleePath(
          (to) => {
            const p = opts.path
              ? opts.path(c.hex, to, o)
              : findPath(map, o.elevation, c.hex, to, o, { doorPolicy: movement.doorPolicy });
            return p ? [...p] : null;
          },
          c.hex,
          from.hex,
          maxSteps,
        );
      },
      burstSpread: (a, t, w, chance, rng, extras): number =>
        this.burstSpread(a, t, w, chance, rng, extras),
      burstVictims: (a, t, w): number[] => this.burstVictims(a, t, w),
      useHealingChem: (c: Combatant): boolean => {
        const o = this.objs.get(c.id);
        if (!o) return false;
        const it = o.inventory.find(
          (x) =>
            x.proto?.kind === 'item' &&
            x.proto.subtype === 2 &&
            (x.proto.data[0] ?? -1) === 35 &&
            (x.proto.data[3] ?? 0) > 0,
        );
        if (!it || it.proto?.kind !== 'item') return false;
        const heal = it.proto.data[3] ?? 0;
        c.hp = Math.min(c.maxHp ?? c.hp + heal, c.hp + heal);
        const q = it.quantity ?? 1;
        if (q > 1) it.quantity = q - 1;
        else o.inventory.splice(o.inventory.indexOf(it), 1);
        return true;
      },
      onMove: (c: Combatant, path: readonly number[]): void => {
        const o = this.objs.get(c.id);
        if (!o) return;
        if (o === player) movement.start(o, [...path], false);
        else moveObject(map, o, c.hex);
      },
    };
    const request = opts.requests?.find(
      (r) => this.objs.has(r.attacker) && this.objs.has(r.defender),
    );
    if (request) env.request = request;
    const rules = createRulesResolver({
      rng: this.rng,
      difficulty: opts.difficulty ?? 'normal',
      toHitHook: this.toHitHook,
      playerTeam: 0,
      hitExtras: this.hitExtras,
      jinxed: () => sheetJinxed(host.state.sheet),
    });
    this.combat = new CombatSession(
      parts,
      // obrot i skradanie zmieniaja sie poza walka (ruch, skill Sneak): odswiezane tuz przed rzutem (Silent Death)
      (a, t, ctx) => {
        this.syncFacing(a);
        this.syncFacing(t);
        return rules(a, t, ctx);
      },
      (a, b) => hexDistance(a, b),
      env,
    );
    host.enemiesNearby = () => true;
    // terminate_combat ze skryptu (0x8153): konczy te walke; wyrejestrowanie po jej zakonczeniu w sync()
    const scripts = host.world.scripts;
    if (scripts) {
      scripts.onTerminateCombat = (selfId: number): void => {
        this.terminate(selfId);
      };
    }
    if (opts.restore) {
      this.combat.restore(opts.restore.session);
      this.aim = opts.restore.aim;
      this.mode = opts.restore.mode === 1 ? 1 : 0;
      this.seen = 0;
      if (this.combat.ended) host.enemiesNearby = () => false;
      return;
    }
    this.runAi();
    this.sync();
  }

  /**
   * Rozklad celow serii (0x423488 z @f2/rules): trzy promienie od atakujacego po linii (obiekty mapy z 0x4163c8),
   * trafienia glownego celu zwracane, trafienia innych krytterow (takze sojusznikow) dopisane do `extras`.
   * przekierowanie pudla 0x423128 (D, `missRedirectHex`), Z: amunicja (seria bez limitu naboi).
   */
  private burstSpread(
    a: Combatant,
    t: Combatant,
    w: WeaponSpec,
    chance: number,
    rng: Rng,
    extras: { id: number; hits: number }[],
  ): number {
    const ao = this.objs.get(a.id);
    const to = this.objs.get(t.id);
    if (!ao || !to) {
      return resolveBurst(
        { rounds: w.burst, mode: 'burst', targets: [{ id: t.id, toHit: chance, isMain: true }] },
        rng,
      ).mainHits;
    }
    const map = this.host.world.map;
    const chanceFor = (v: Combatant): number =>
      hitChance(a, v, w, BodyPart.Uncalled, hexDistance(a.hex, v.hex), this.toHitHook, {
        difficulty: this.opts.difficulty ?? 'normal',
        playerTeam: 0,
        ...this.hitExtras(a, v, w),
      });
    const r = resolveBurstSpread(
      {
        mode: 'burst',
        toHit: chance,
        critChance: a.critChance ?? 0,
        ammo: w.burst,
        burstRounds: w.burst,
        critsEnabled: true,
        attackerHex: a.hex,
        targetHex: t.hex,
        range: w.range,
        geo: SHOT_GEOMETRY,
        distance: (x, y) => hexDistance(x, y),
        missRedirect: () =>
          missRedirectHex(
            map,
            ao,
            to,
            w.range,
            (o) => {
              const v = this.combat.all.find((c) => c.id === o.id);
              return v ? chanceFor(v) : 0;
            },
            rng,
            (o) => (this.combat.all.find((c) => c.id === o.id)?.hp ?? 1) <= 0,
          ),
        ray: (end, rounds) => {
          const targets: { id: number; toHit: number; isMain: boolean }[] = [];
          for (const o of critterRay(map, ao, end)) {
            const v = o.id === t.id ? t : this.combat.all.find((c) => c.id === o.id);
            if (!v || v.hp <= 0 || v === a) continue;
            targets.push({ id: v.id, toHit: v === t ? chance : chanceFor(v), isMain: v === t });
          }
          const res = resolveBurst({ rounds, mode: 'burst', targets }, rng);
          for (const ex of res.extras) {
            const known = extras.find((e) => e.id === ex.id);
            if (known) known.hits += ex.hits;
            else if (extras.length < 6) extras.push({ id: ex.id, hits: ex.hits });
          }
          return res.mainHits;
        },
        extrasCount: () => extras.length,
      },
      rng,
    );
    return r.hits;
  }

  /** Id krytterow na trzech torach serii (0x4243a8) bez atakujacego; dla kontroli sojusznikow AI. */
  private burstVictims(a: Combatant, t: Combatant, w: WeaponSpec): number[] {
    const ao = this.objs.get(a.id);
    if (!ao) return [];
    const ends = burstRayEnds(
      {
        attackerHex: a.hex,
        range: w.range,
        geo: SHOT_GEOMETRY,
        distance: (x, y) => hexDistance(x, y),
      },
      t.hex,
    );
    const ids = new Set<number>();
    for (const end of [ends.center, ends.left, ends.right]) {
      if (end === null) continue;
      for (const o of critterRay(this.host.world.map, ao, end)) if (o.id !== a.id) ids.add(o.id);
    }
    return [...ids];
  }

  private syncFacing(c: Combatant): void {
    const o = this.objs.get(c.id);
    if (o) c.rotation = o.rotation;
    if (c.isPlayer) c.sneaking = this.host.state.sheet.sneaking;
  }

  /** Czy bron gracza ma drugi tryb ataku. */
  canSecondary(): boolean {
    return this.combat.weaponOf(this.player).secondary !== undefined;
  }

  /** Przelacza tryb ataku gracza (podstawowy / drugi); bez drugiego trybu zostaje 0. */
  toggleMode(): void {
    this.mode = this.mode === 0 && this.canSecondary() ? 1 : 0;
  }

  /** Bron gracza w wybranym trybie (zasieg, seria, koszt AP z `attackCost`). */
  private playerWeapon(): WeaponSpec {
    return weaponInMode(this.combat.weaponOf(this.player), this.mode);
  }

  /** Koszt AP ataku gracza w wybranym trybie (z celowaniem wg `aim`). */
  attackCost(): number {
    const me = this.player;
    const part = this.canAim() ? this.aim : BodyPart.Uncalled;
    return this.combat.attackCost(this.playerWeapon(), part, me, this.mode);
  }

  /** Zapis trwajacej walki (JSON-owalny); null gdy walka zakonczona. */
  snapshot(): CombatSave | null {
    if (this.combat.ended) return null;
    return {
      version: 1,
      session: this.combat.snapshot(),
      rng: this.rng.state(),
      aim: this.aim,
      ...(this.mode === 1 ? { mode: this.mode } : {}),
    };
  }

  /** Wznawia zapisana walke na aktualnym swiecie; null gdy brak uczestnikow. */
  static restore(
    host: CombatHost,
    save: CombatSave,
    opts: CombatStartOptions = {},
  ): CombatController | null {
    if (save.version !== 1) throw new Error('CombatController: nieznana wersja zapisu');
    const { requests: _r, ...rest } = opts;
    void _r;
    return CombatController.start(host, { ...rest, seed: save.rng, restore: save });
  }

  /** terminate_combat (opkod 0x8153): konczy walke i synchronizuje swiat. */
  terminate(selfId?: number): void {
    if (this.combat.ended) return;
    this.combat.terminate(selfId);
    this.sync();
  }

  /** Zaczyna walke z krytera w poblizu gracza; null gdy nikogo nie ma. */
  static start(host: CombatHost, opts: CombatStartOptions = {}): CombatController | null {
    const { map, player } = host.world;
    const allyObjs = (host.world.scripts?.inventory.partyObjects() ?? [])
      .filter((o) => o.id !== player.id && o.elevation === player.elevation && !o.hidden)
      .filter((o) => o.extra.kind !== 'critter' || ((o.extra.raw[3] ?? 0) & RESULT_DEAD) === 0)
      .filter((o) => hexDistance(player.hex, o.hex) <= COMBAT_RADIUS)
      .slice(0, COMBAT_MAX_ALLIES);
    const allyIds = new Set(allyObjs.map((o) => o.id));
    const foes = map.objects
      .filter(
        (o) =>
          o.type === 1 &&
          o.id !== player.id &&
          !allyIds.has(o.id) &&
          o.elevation === player.elevation &&
          !o.hidden,
      )
      .filter((o) => o.extra.kind !== 'critter' || ((o.extra.raw[3] ?? 0) & RESULT_DEAD) === 0)
      .filter((o) => hexDistance(player.hex, o.hex) <= COMBAT_RADIUS)
      .sort((a, b) => hexDistance(player.hex, a.hex) - hexDistance(player.hex, b.hex))
      .slice(0, COMBAT_MAX_FOES);
    if (foes.length === 0) return null;
    const sh: PlayerSheet = host.state.sheet;
    const pStat = stats(sh.baseStats, sh.statBonuses);
    const parts: Omit<Combatant, 'ap'>[] = [
      build(player, pStat, sh.skills, sh.taggedSkills, true, sh.hp, 0, 0, sh, opts.ammoProto),
    ];
    const objs = new Map<number, GameObject>([[player.id, player]]);
    const aiTable = opts.ai ?? getCombatAiData()?.ai;
    for (const f of foes) {
      const p = f.proto;
      const cp = p.kind === 'critter' ? p : null;
      const stat = cp ? stats(cp.baseStats, cp.bonusStats) : (): number => 5;
      const raw = f.extra.kind === 'critter' ? f.extra.raw : null;
      const hp = (raw?.[7] ?? 0) > 0 ? (raw?.[7] as number) : stat(7) || 10;
      const team = raw ? (raw[5] as number) : (cp?.team ?? 1);
      const c = build(
        f,
        stat,
        cp?.skills ?? [],
        [],
        false,
        hp,
        team === 0 ? 1 : team,
        cp?.killType ?? 0,
        undefined,
        opts.ammoProto,
      );
      c.maxHp = Math.max(hp, stat(7));
      if (cp) c.critterFlags = cp.critterFlags;
      const pk = aiTable && cp ? aiTable.find(cp.aiPacket) : null;
      if (pk) c.ai = pk;
      parts.push(c);
      objs.set(f.id, f);
    }
    // towarzysze: ta sama druzyna co gracz (0), walcza wg pakietu AI z proto
    for (const a of allyObjs) {
      const p = a.proto;
      const cp = p.kind === 'critter' ? p : null;
      const stat = cp ? stats(cp.baseStats, cp.bonusStats) : (): number => 5;
      const raw = a.extra.kind === 'critter' ? a.extra.raw : null;
      const hp = (raw?.[7] ?? 0) > 0 ? (raw?.[7] as number) : stat(7) || 10;
      const c = build(
        a,
        stat,
        cp?.skills ?? [],
        [],
        false,
        hp,
        0,
        cp?.killType ?? 0,
        undefined,
        opts.ammoProto,
      );
      c.maxHp = Math.max(hp, stat(7));
      if (cp) c.critterFlags = cp.critterFlags;
      const pk = aiTable && cp ? aiTable.find(cp.aiPacket) : null;
      if (pk) {
        // rozkazy gracza (PartyState.orders, Zadanie 38) nadpisuja pola pakietu AI towarzysza
        const orders = host.extras?.party.ordersOf(
          host.world.scripts?.inventory.partyStateId?.(a.id) ?? a.id,
        );
        c.ai = orders && Object.keys(orders).length > 0 ? applyPartyOrders(pk, orders) : pk;
      }
      parts.push(c);
      objs.set(a.id, a);
    }
    (parts[0] as Combatant).maxHp = sh.hp;
    return new CombatController(host, parts, objs, opts);
  }

  get player(): Combatant {
    return this.combat.all.find((c) => c.isPlayer) as Combatant;
  }
  get foes(): Combatant[] {
    const team = this.player.team;
    return this.combat.all.filter((c) => !c.isPlayer && c.team !== team && c.hp > 0);
  }
  /** Zywi towarzysze gracza w walce. */
  get allies(): Combatant[] {
    const team = this.player.team;
    return this.combat.all.filter((c) => !c.isPlayer && c.team === team && c.hp > 0);
  }
  get playerTurn(): boolean {
    return !this.combat.ended && this.combat.current.isPlayer;
  }
  get ended(): boolean {
    return this.combat.ended;
  }
  /** Przeciwnik na heksie (do tapu na mapie). */
  foeAt(hex: number): Combatant | undefined {
    return this.foes.find((f) => f.hex === hex);
  }
  /** Najblizszy zywy wrog. */
  nearestFoe(): Combatant | undefined {
    const me = this.player;
    return [...this.foes].sort(
      (a, b) => hexDistance(me.hex, a.hex) - hexDistance(me.hex, b.hex),
    )[0];
  }

  /** Czy gracz moze teraz celowac (Fast Shot z bronia dystansowa odbiera celowanie). */
  canAim(): boolean {
    return this.combat.canAim(this.player, this.playerWeapon());
  }

  /** Szansa trafienia gracza w cel (do paska celowania). */
  chance(targetId: number, part: BodyPart = this.aim): number {
    const me = this.player;
    if (!this.canAim()) part = BodyPart.Uncalled;
    const t = this.combat.all.find((c) => c.id === targetId);
    if (!t) return 0;
    return displayToHit(
      hitChance(me, t, this.playerWeapon(), part, hexDistance(me.hex, t.hex), this.toHitHook, {
        difficulty: this.opts.difficulty ?? 'normal',
        playerTeam: 0,
        ...this.hitExtras(me, t, this.playerWeapon()),
      }),
    );
  }

  /**
   * Atak gracza w cel (celowana czesc ciala wg `aim`). Poza zasiegiem podchodzi na ile pozwala AP
   * i atakuje, jesli zostalo AP. Zwraca wynik ataku albo null (nic nie zrobiono / ruch).
   */
  attack(targetId: number): AttackOutcome | null {
    if (!this.playerTurn) return null;
    const me = this.player;
    const t = this.combat.all.find((c) => c.id === targetId);
    if (!t || t.hp <= 0 || t.team === me.team) return null;
    const w = this.playerWeapon();
    let moved = false;
    if (hexDistance(me.hex, t.hex) > w.range) {
      const path = this.combat.pathTo(me, t.hex);
      if (!path || path.length < 2) return null;
      const steps = path.slice(0, -1);
      const upto = steps.findIndex((h) => hexDistance(h, t.hex) <= w.range);
      const need = upto < 0 ? steps.length : upto + 1;
      const n = Math.min(need, me.ap);
      if (n <= 0) return null;
      moved = this.combat.move(me.id, steps[n - 1] as number);
      if (!moved) return null;
      if (n < need) {
        this.sync();
        return null;
      }
    }
    const out = this.combat.attack(me.id, t.id, {
      part: this.canAim() ? this.aim : BodyPart.Uncalled,
      mode: this.mode,
    });
    this.aim = BodyPart.Uncalled;
    this.sync();
    return out ?? (moved ? null : null);
  }

  /** Ruch gracza na heks (koszt AP wg sciezki). */
  moveTo(hex: number): boolean {
    if (!this.playerTurn) return false;
    const ok = this.combat.move(this.player.id, hex);
    this.sync();
    return ok;
  }

  /**
   * Bramka uzycia chemii przez gracza w walce (D, specyfikacja formatu R12b): sam lek kosztuje 0 AP, platne jest OTWARCIE
   * ekwipunku (0x46e7b0): 4 AP, 2 z perkiem Quick Pockets (0x30); brak AP = odmowa (komunikat 0x13). Tylko w jego turze. `after` przenosi HP i zmiany AP z arkusza do uczestnika walki
   * (Z: bonus do AP zmienia tez biezace AP o te sama roznice maksimum, bez spadku ponizej 0).
   */
  chemGate(): { canSpend(): boolean; spend(): void; after(): void } {
    return {
      canSpend: () => this.playerTurn && this.player.ap >= this.inventoryApCost(),
      spend: () => {
        this.combat.spendAp(this.player.id, this.inventoryApCost());
      },
      after: () => {
        const sh = this.host.state.sheet;
        const me = this.player;
        me.hp = sh.hp;
        me.maxHp = Math.max(me.maxHp ?? 0, sh.hp, maxHpOf(sh));
        const newMax = maxApOf(sh);
        me.ap = Math.max(0, me.ap + (newMax - me.maxAp));
        me.maxAp = newMax;
        this.sync();
      },
    };
  }

  /** Koszt AP otwarcia ekwipunku w walce (Quick Pockets = perk 0x30 = 48). */
  private inventoryApCost(): number {
    return inventoryOpenApCost((this.host.state.sheet.perks?.['48'] ?? 0) > 0);
  }

  /** Koniec tury gracza: tury AI do ponownej tury gracza albo konca walki. */
  endTurn(): void {
    if (this.combat.ended) return;
    this.combat.endTurn();
    this.runAi();
    this.sync();
  }

  private runAi(): void {
    let guard = 0;
    while (!this.combat.ended && !this.combat.current.isPlayer && guard++ < 50)
      this.combat.autoTurn();
  }

  /** Taunt NPC: callback z opcji albo tekst z combatai.msg nad krytera (float_msg). */
  private showTaunt(npcId: number, msgId: number): void {
    if (this.opts.onTaunt) return this.opts.onTaunt(npcId, msgId);
    const text = getCombatAiData()?.combatMsg.get(msgId);
    if (text) this.host.world.scripts?.floatMsg(npcId, text, 0);
  }

  private deathAnimOf(id: number): number | undefined {
    for (let i = this.combat.events.length - 1; i >= 0; i--) {
      const e = this.combat.events[i];
      if (e?.kind === 'death' && e.id === id) return e.anim;
    }
    return undefined;
  }

  /** HP gracza do arkusza, zabici zostaja jako zwloki, na koncu sprzatanie stanu walki. */
  private sync(): void {
    const sh = this.host.state.sheet;
    sh.hp = this.player.hp;
    for (const c of this.combat.all) {
      if (c.isPlayer || c.hp > 0) continue;
      const o = this.objs.get(c.id);
      if (o && ((o.extra.kind === 'critter' ? (o.extra.raw[3] ?? 0) : 0) & RESULT_DEAD) === 0) {
        // zwloki: sprite wariantu smierci (ostatnia klatka), bez blokowania heksa i bez celowania
        o.flags |= FLAG_NO_BLOCK;
        if (o.extra.kind === 'critter') o.extra.raw[3] = (o.extra.raw[3] ?? 0) | RESULT_DEAD;
        const anim = this.deathAnimOf(c.id);
        if (anim !== undefined) {
          o.fid = ((1 << 24) | (anim << 16) | (o.fid & 0xfff)) >>> 0;
          o.frame = CORPSE_LAST_FRAME;
        } else o.hidden = true;
        const pr = o.proto;
        const cpr = pr.kind === 'critter' ? pr : null;
        // XP tylko za wrogow gracza; smierc towarzysza nie daje nagrody
        if (c.team !== this.player.team)
          this.opts.onKill?.(cpr?.expForKill ?? 0, cpr?.killType ?? 0);
      }
    }
    if (this.combat.ended) {
      this.host.enemiesNearby = () => false;
      const scripts = this.host.world.scripts;
      if (scripts) delete scripts.onTerminateCombat;
    }
    this.host.state.rng.seed = this.rng.state() & 0x7fffffff;
    for (let i = this.seen; i < this.combat.events.length; i++) {
      const e = this.combat.events[i];
      if (e) this.opts.onEvent?.(e);
      if (e?.kind === 'attack' && e.hit && e.damageType !== undefined)
        this.host.world.scripts?.applyHit(e.target, e.attacker, e.damageType);
      if (e?.kind === 'taunt') this.showTaunt(e.id, e.msgId);
    }
    this.seen = this.combat.events.length;
    this.opts.onChange?.();
  }
}
