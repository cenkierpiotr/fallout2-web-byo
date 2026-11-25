// Pakiety AI walki z AI.TXT (R14). D, patrz dokumentacja techniczna; interpretacje oznaczone Z sa jawnymi zalozeniami.
// Modul jest czysty (bez zaleznosci od formats): `normalizeAiPacket` przyjmuje strukturalnie surowy rekord parseAiTxt.

export type AiHurtFlag = 'blind' | 'crippled' | 'crippled_arms' | 'crippled_legs';
export type AiMsgKind =
  | 'attack'
  | 'move'
  | 'run'
  | 'miss'
  | 'hitEyes'
  | 'hitGroin'
  | 'hitHead'
  | 'hitLeftArm'
  | 'hitLeftLeg'
  | 'hitRightArm'
  | 'hitRightLeg'
  | 'hitTorso';

/** Strukturalny odpowiednik `AiPacketRaw` z @f2/formats. */
export interface AiPacketSource {
  name: string;
  packetNum: number;
  aggression: number;
  maxDist: number;
  minToHit: number;
  minHp: number;
  chance: number;
  /** secondary_freq (+0x1c): mianownik losowania trybu obszarowego `rand(1,secondary_freq)==1`. */
  secondaryFreq?: number;
  hurtTooMuch: ReadonlySet<string>;
  areaAttackMode?: string;
  runAwayMode?: string;
  bestWeapon?: string;
  distance?: string;
  attackWho?: string;
  chemUse?: string;
  disposition?: string;
  msgRanges: Record<AiMsgKind, readonly [number, number]>;
}

/** Kolejnosc enum wg tablicy 0x5180bc (D): stay_close=0 ... stay=4. */
export type AiDistance = 'stay_close' | 'charge' | 'snipe' | 'on_your_own' | 'stay';
export type AiAttackWho =
  'none' | 'whomever_attacking_me' | 'strongest' | 'weakest' | 'whomever' | 'closest';
/** Kolejnosc enum wg tablicy 0x51806c (D); `unset` = brak klucza w AI.TXT (-1 w pakiecie). */
export type AiAreaMode =
  'unset' | 'always' | 'sometimes' | 'be_sure' | 'be_careful' | 'be_absolutely_sure';

export interface AiPacket {
  name: string;
  packetNum: number;
  aggression: number;
  maxDist: number;
  minToHit: number;
  minHp: number;
  /** Szansa taunta 0..100. */
  chance: number;
  /** secondary_freq (+0x1c); brak = 0. */
  secondaryFreq?: number;
  hurtTooMuch: ReadonlySet<AiHurtFlag>;
  /** Indeks trybu ucieczki 0..5 (po dekrementacji w loaderze), -1 = uzyj `minHp`. */
  runAwayIndex: number;
  /** Surowy indeks best_weapon dla chooseBestWeapon (-1 brak). */
  bestWeapon: number;
  distance: AiDistance;
  attackWho: AiAttackWho;
  areaMode: AiAreaMode;
  /** chem_use 0..5 wg tablicy 0x5180e4 (D): clean, stims_when_hurt_little, stims_when_hurt_lots, sometimes, anytime, always. */
  chemUse: number;
  msgRanges: Record<AiMsgKind, readonly [number, number]>;
}

/** Tablica 0x518138 (D): procent max HP, jaki wolno stracic przed ucieczka, wg trybu 0..5. */
export const RUN_AWAY_PERCENT: readonly number[] = [0, 25, 40, 60, 75, 100];

/** Nazwy enum run_away_mode wg tablicy 0x518080 (D: 7 wpisow); loader odejmuje 1 (none -> -1). */
export const RUN_AWAY_NAMES = [
  'none',
  'coward',
  'finger_hurts',
  'bleeding',
  'not_feeling_good',
  'tourniquet',
  'never',
] as const;
/** best_weapon wg tablicy 0x51809c (D: 8 wpisow) plus `random`; Z: 'never' = brak (-1). */
export const BEST_WEAPON_NAMES = [
  'no_pref',
  'melee',
  'melee_over_ranged',
  'ranged_over_melee',
  'ranged',
  'unarmed',
  'unarmed_over_thrown',
  'random',
] as const;
export const CHEM_USE_NAMES = [
  'clean',
  'stims_when_hurt_little',
  'stims_when_hurt_lots',
  'sometimes',
  'anytime',
  'always',
] as const;

const DISTANCES: readonly string[] = ['stay_close', 'charge', 'snipe', 'on_your_own', 'stay'];
const ATTACK_WHO: readonly string[] = [
  'whomever_attacking_me',
  'strongest',
  'weakest',
  'whomever',
  'closest',
];
const AREA: readonly string[] = [
  'always',
  'sometimes',
  'be_sure',
  'be_careful',
  'be_absolutely_sure',
];

export function normalizeAiPacket(raw: AiPacketSource): AiPacket {
  const ra =
    raw.runAwayMode === undefined ? -1 : RUN_AWAY_NAMES.indexOf(raw.runAwayMode as never) - 1;
  const bw = raw.bestWeapon === undefined ? -1 : BEST_WEAPON_NAMES.indexOf(raw.bestWeapon as never);
  const chem =
    raw.chemUse === undefined ? 0 : Math.max(0, CHEM_USE_NAMES.indexOf(raw.chemUse as never));
  return {
    name: raw.name,
    packetNum: raw.packetNum,
    aggression: raw.aggression,
    maxDist: raw.maxDist,
    minToHit: raw.minToHit,
    minHp: raw.minHp,
    chance: raw.chance,
    secondaryFreq: raw.secondaryFreq ?? 0,
    hurtTooMuch: new Set(
      [...raw.hurtTooMuch].filter((f): f is AiHurtFlag =>
        ['blind', 'crippled', 'crippled_arms', 'crippled_legs'].includes(f),
      ),
    ),
    // 'never' (6) -> 5 = 100% (nigdy nie ucieka); nieznana nazwa -> -1 (prog z min_hp)
    runAwayIndex: ra >= -1 ? Math.min(5, ra) : -1,
    bestWeapon: bw,
    distance: (DISTANCES.includes(raw.distance ?? '') ? raw.distance : 'on_your_own') as AiDistance,
    attackWho: (ATTACK_WHO.includes(raw.attackWho ?? '')
      ? raw.attackWho
      : 'closest') as AiAttackWho,
    areaMode: (AREA.includes(raw.areaAttackMode ?? '')
      ? raw.areaAttackMode
      : 'unset') as AiAreaMode,
    chemUse: chem,
    msgRanges: raw.msgRanges,
  };
}

/** Tabela pakietow po `packet_num`; brak pakietu = blad "Missing AI Packet" (0x4280b4). */
export class AiPacketTable {
  private readonly byNum = new Map<number, AiPacket>();
  constructor(raw: readonly AiPacketSource[]) {
    for (const r of raw)
      if (!this.byNum.has(r.packetNum)) this.byNum.set(r.packetNum, normalizeAiPacket(r));
  }
  get size(): number {
    return this.byNum.size;
  }
  has(num: number): boolean {
    return this.byNum.has(num);
  }
  get(num: number): AiPacket {
    const p = this.byNum.get(num);
    if (!p) throw new Error(`Missing AI Packet ${num}`);
    return p;
  }
  /** Jak `get`, ale null zamiast bledu (krytery bez pakietu w danych, np. packet 0). */
  find(num: number): AiPacket | null {
    return this.byNum.get(num) ?? null;
  }
}

/** Prog HP ucieczki (0x42b100): tryb -1 -> `min_hp` z pakietu, 0..5 -> maxHP - tablica*maxHP/100. */
export function fleeThreshold(p: AiPacket, maxHp: number): number {
  if (p.runAwayIndex < 0) return p.minHp;
  return maxHp - Math.floor(((RUN_AWAY_PERCENT[p.runAwayIndex] ?? 0) * maxHp) / 100);
}

export interface AiStatus {
  hp: number;
  maxHp: number;
  blind?: boolean;
  crippledArms?: boolean;
  crippledLegs?: boolean;
  /** Bit 4 flagi tury krytera (+0x3c, D: ustawiony = krytera juz ucieka; nadawca bitu nieznany, Z). */
  fleeFlag?: boolean;
}

/**
 * Czy krytera ucieka (0x42b130, 0x42b1c2..0x42b1df, D): ucieka gdy ustawiony bit 4 flagi tury, albo stan
 * pasuje do maski `hurt_too_much`, albo curHP < `min_hp` (JGE = kontynuuje walke). `never` ma prog 0, wiec
 * nie ucieka z powodu HP.
 */
export function shouldFlee(p: AiPacket, s: AiStatus): boolean {
  if (s.fleeFlag) return true;
  const h = p.hurtTooMuch;
  const crippled = !!s.crippledArms || !!s.crippledLegs;
  if (
    (h.has('blind') && s.blind) ||
    (h.has('crippled') && crippled) ||
    (h.has('crippled_arms') && s.crippledArms) ||
    (h.has('crippled_legs') && s.crippledLegs)
  ) {
    return true;
  }
  if (p.runAwayIndex === 5) return false;
  return s.hp < fleeThreshold(p, s.maxHp);
}

/** Prog HP (w procentach max HP) wyzwalajacy leczenie wg `chem_use` (0x428480, D); 0 = nie leczy. */
export function chemHealPercent(chemUse: number): number {
  switch (chemUse) {
    case 1:
      return 60;
    case 2:
      return 30;
    case 3:
    case 4:
    case 5:
      return 50;
    default:
      return 0;
  }
}

/** Czy krytera ma teraz uzyc leku leczacego: curHP < maxHP*prog/100 (calkowite) i co najmniej 2 AP (D). */
export function chemShouldHeal(chemUse: number, hp: number, maxHp: number, ap: number): boolean {
  const pct = chemHealPercent(chemUse);
  if (pct === 0 || ap < 2) return false;
  return hp < Math.trunc((maxHp * pct) / 100);
}

/**
 * Szansa (0..100) losowego uzycia leku bez glodu HP: `sometimes` 25 i `anytime` 75 tylko gdy licznik tur
 * (0x510940) % 3 == 0, `always` 100 co ture (D). Losowanie: `rand(0,100)` wlacznie, trafia gdy < szansa.
 */
export function chemRandomChance(chemUse: number, turnCounter: number): number {
  if (chemUse === 5) return 100;
  if (turnCounter % 3 !== 0) return 0;
  if (chemUse === 3) return 25;
  if (chemUse === 4) return 75;
  return 0;
}

export interface AiTargetInfo {
  id: number;
  hp: number;
  distance: number;
  /** Miara sily 0x42b90c = max(obrazenia max, bron) + stat 9 (D). Gdy podana, `strongest`/`weakest` uzywaja kolejnosci z binarki. */
  power?: number;
}

/**
 * Wybor celu wg `attack_who` (0x428f4c). `maxDist` ogranicza kandydatow, chyba ze atakuje `charge` albo cel nas trafil.
 * Z: `strongest` = najwiecej HP, `weakest` = najmniej, `whomever` = losowy, `whomever_attacking_me` = ten, kto trafil
 * ostatni (gdy brak: najblizszy).
 */
export function chooseTarget(
  p: AiPacket,
  foes: readonly AiTargetInfo[],
  whoHitMeId: number | undefined,
  rand: (n: number) => number,
): AiTargetInfo | null {
  const inRange = foes.filter(
    (f) => p.distance === 'charge' || f.id === whoHitMeId || f.distance <= p.maxDist,
  );
  if (inRange.length === 0) return null;
  const nearest = (): AiTargetInfo =>
    [...inRange].sort((a, b) => a.distance - b.distance || a.id - b.id)[0] as AiTargetInfo;
  switch (p.attackWho) {
    case 'whomever_attacking_me':
      return inRange.find((f) => f.id === whoHitMeId) ?? nearest();
    // D (0x428f4c, qsort): z miara `power` kolejnosc binarki: strongest = rosnaco (!), weakest = malejaco.
    // Bez `power` zostaje przyblizenie wg HP (Z).
    case 'strongest':
      return [...inRange].sort((a, b) =>
        a.power !== undefined && b.power !== undefined
          ? a.power - b.power || a.distance - b.distance
          : b.hp - a.hp || a.distance - b.distance,
      )[0] as AiTargetInfo;
    case 'weakest':
      return [...inRange].sort((a, b) =>
        a.power !== undefined && b.power !== undefined
          ? b.power - a.power || a.distance - b.distance
          : a.hp - b.hp || a.distance - b.distance,
      )[0] as AiTargetInfo;
    case 'whomever':
      return inRange[rand(inRange.length)] as AiTargetInfo;
    default:
      return nearest();
  }
}

/**
 * Czy AI wolno ruszac sie ku celowi (`distance`, 0x429fc8, D): `stay` nigdy nie rusza; `stay_close` nie rusza,
 * gdy krytera jest dalej niz 5 heksow od gracza (`distFromDude`, brak = blisko); `charge` zawsze.
 * `snipe`/`on_your_own`: zasieg wg max_dist/broni (Z).
 */
export function mayApproach(
  p: AiPacket,
  wasHit: boolean,
  targetDist: number,
  weaponRange: number,
  distFromDude = 0,
): boolean {
  switch (p.distance) {
    case 'stay':
      return false;
    case 'stay_close':
      return distFromDude <= STAY_CLOSE_LEASH && targetDist <= Math.max(p.maxDist, weaponRange);
    case 'snipe':
      return targetDist <= Math.max(weaponRange, p.maxDist);
    case 'charge':
      return true;
    default:
      return targetDist <= Math.max(p.maxDist, weaponRange) || wasHit;
  }
}

/** Dystans (heksy) od gracza, powyzej ktorego `stay_close` nie rusza sie (0x429fc8, D). */
export const STAY_CLOSE_LEASH = 5;
/** Tablica 0x51820c (D): prog dystansu za graczem dla czlonka druzyny wg `distance` (stay = 50000 = nigdy). */
export const PARTY_FOLLOW_DISTANCE: Readonly<Record<AiDistance, number>> = {
  stay_close: 5,
  charge: 7,
  snipe: 7,
  on_your_own: 7,
  stay: 50000,
};

export interface AreaContext {
  /** Szansa trafienia w cel (0x42436c) dla trybow be_*. */
  toHit?: number | undefined;
  /** Stat Inteligencja (4) i dystans do celu, dla trybu `unset`. */
  intelligence?: number | undefined;
  targetDistance?: number | undefined;
  /** Wynik 0x4213e8 != 0 (sojusznik/gracz w strefie wybuchu); alias liczby sojusznikow. */
  friendsInBlast: number;
}

/**
 * Bron obszarowa wg `area_attack_mode` (0x429db4, D). `randInt(lo,hi)` wlacznie.
 * always -> tak; sometimes -> rand(1,secondary_freq)==1; be_sure/be_careful/be_absolutely_sure -> toHit >= 85/50/95
 * i brak sojusznikow w strefie; unset: IN>=6 i dystans>=10 -> nie, inaczej rand(1,secondary_freq)==1.
 */
export function mayUseAreaWeapon(
  p: AiPacket,
  ctx: AreaContext,
  randInt: (lo: number, hi: number) => number,
): boolean {
  const roll = (): boolean => randInt(1, Math.max(1, p.secondaryFreq ?? 0)) === 1;
  const sure = (min: number): boolean => (ctx.toHit ?? 0) >= min && ctx.friendsInBlast === 0;
  switch (p.areaMode) {
    case 'always':
      return true;
    case 'sometimes':
      return roll();
    case 'be_sure':
      return sure(85);
    case 'be_careful':
      return sure(50);
    case 'be_absolutely_sure':
      return sure(95);
    default:
      if ((ctx.intelligence ?? 0) >= 6 && (ctx.targetDistance ?? 0) >= 10) return false;
      return roll();
  }
}

/** Atak pomijany, gdy szansa trafienia < `min_to_hit` ("Can't possibly Hit Target", 0x42a7d8/0x42ad91, D; dotyczy tez pojedynczego strzalu serii). */
export function acceptableToHit(p: AiPacket, chance: number): boolean {
  return chance >= p.minToHit;
}

/**
 * Taunt 0x42b634: z szansa `chance` (0 = nigdy, 100 = zawsze; `rand` 1..100, trafia gdy rand <= chance)
 * zwraca numer wiersza `combatai.msg` z zakresu pola danego zdarzenia (start..end wlacznie); `randInt(lo,hi)` wlacznie.
 */
export function tauntMsgId(
  p: AiPacket,
  kind: AiMsgKind,
  rand: () => number,
  randInt: (lo: number, hi: number) => number,
): number | null {
  const [lo, hi] = p.msgRanges[kind];
  if (hi < lo || (lo === 0 && hi === 0)) return null;
  if (rand() > p.chance) return null;
  return randInt(lo, hi);
}
