import type { GameObject } from './game-object.js';

/**
 * Model krytera dla opkodow batch4 (critter_heal/state/injure/flee). Stan zyje w pamieci silnika:
 * HP seedowane z `extra.raw[7]` (gdy plik mapy ma >7 pol; Z: indeks), flagi obrazen z `raw[2]`
 * (pole +0x44 oryginalu), flaga ucieczki = bit 0x400 pola +0x3c. Maksimum HP dostarcza wywolujacy (proto).
 */
const TYPE_CRITTER = 1;
export const DMG_DEAD = 0x80;
export const DMG_KNOCKED_OUT = 0x01;
export const DMG_MASK = 0x7c;

interface State {
  /** undefined = pelne HP (brak danych w mapie). */
  hp: number | undefined;
  flags: number;
  flee: boolean;
  /** Poziom promieniowania (obj+0x5c, 0x42d3a4); stan tylko dla gracza. */
  rads: number;
}
const states = new WeakMap<GameObject, State>();

const isCritterObj = (o: GameObject): boolean => o.type === TYPE_CRITTER;

function st(o: GameObject): State {
  let s = states.get(o);
  if (!s) {
    const raw = o.extra.kind === 'critter' ? o.extra.raw : undefined;
    s = {
      hp: raw && raw.length > 7 ? raw[7] : undefined,
      flags: raw && raw.length > 2 ? (raw[2] ?? 0) : 0,
      flee: false,
      rads: 0,
    };
    states.set(o, s);
  }
  return s;
}

/** critter_state: 0 zdrowy, 1 martwy, 2 lezy lub nieprzytomny, plus okaleczenia (flagi & 0x7c); -1 gdy nie krytter. */
export function critterState(o: GameObject): number {
  if (!isCritterObj(o)) return -1;
  const s = st(o);
  if ((s.hp !== undefined && s.hp <= 0) || s.flags & DMG_DEAD) return 1;
  if (s.flags & DMG_KNOCKED_OUT) return 2;
  const anim = (o.fid & 0xff0000) >> 16;
  return (anim === 0x30 || anim === 0x31 ? 2 : 0) | (s.flags & DMG_MASK);
}

export function critterInjure(o: GameObject, flags: number, clear: boolean): void {
  if (!isCritterObj(o)) return;
  const s = st(o);
  const f = flags & DMG_MASK;
  s.flags = clear ? s.flags & ~f : s.flags | f;
}

export const critterIsFleeing = (o: GameObject): number =>
  isCritterObj(o) ? (st(o).flee ? 1 : 0) : -1;

export function critterSetFlee(o: GameObject, on: boolean): void {
  if (isCritterObj(o)) st(o).flee = on;
}

/** critter_heal: HP rosnie do `maxHp`; zwraca 0 (Z: kody wyniku 0x42d1a4 inne niz 0 nie sa rozpoznane). */
export function critterHeal(o: GameObject, amount: number, maxHp: number): number {
  if (!isCritterObj(o)) return -1;
  const s = st(o);
  const cur = s.hp ?? maxHp;
  if (cur <= 0 || s.flags & DMG_DEAD) return 0;
  s.hp = Math.min(maxHp, cur + amount);
  return 0;
}

export const critterHp = (o: GameObject, maxHp: number): number => st(o).hp ?? maxHp;

/** Flaga obiektu "niesmiertelny" (0x400, D: test w 0x424ee8; Z: czy to pole +0x24 obiektu). */
const OBJ_INVULNERABLE = 0x400;

/**
 * critter_damage: odejmuje `damage` od HP (min. 0 obrazen); gdy HP <= 0 i krytter nie jest niesmiertelny,
 * ustawia flage DMG_DEAD (D: 0x424ee8). Redukcje DT/DR (0x413660) nie sa modelowane (Z). Zwraca true gdy zginal.
 */
export function critterDamage(o: GameObject, damage: number, maxHp: number): boolean {
  if (!isCritterObj(o)) return false;
  const s = st(o);
  const cur = s.hp ?? maxHp;
  if (s.flags & DMG_DEAD) return false;
  s.hp = cur - Math.max(0, damage);
  if (s.hp <= 0 && !(o.flags & OBJ_INVULNERABLE)) {
    s.flags |= DMG_DEAD;
    return true;
  }
  return false;
}

/**
 * kill_critter / kill_critter_type (0x457ad4 / 0x457cb4 -> 0x42da64): bezposrednie zabicie krytera (HP 0 i DMG_DEAD),
 * bez sprawdzania niesmiertelnosci (w odroznieniu od critter_damage). Zwraca true gdy wczesniej zyl.
 */
export function critterKill(o: GameObject): boolean {
  if (!isCritterObj(o)) return false;
  const s = st(o);
  if ((s.hp !== undefined && s.hp <= 0) || s.flags & DMG_DEAD) return false;
  s.hp = 0;
  s.flags |= DMG_DEAD;
  return true;
}

/**
 * radiation_inc/dec (0x458760 / 0x458800 -> 0x42d3a4): zmienia poziom promieniowania; oryginal dziala tylko na graczu
 * (dla innych zwraca -1). Odpornosc (stat 0x1f) obniza dodatni przyrost o odsetek `resistPct`; poziom nie schodzi
 * ponizej 0 (Z: dolne ograniczenie i zdarzenia kolejki 0x42d3a4 nie zbadane). Zwraca 0 albo -1.
 */
export function critterAdjustRads(
  o: GameObject,
  isPlayer: boolean,
  amount: number,
  resistPct = 0,
): number {
  if (!isPlayer || !isCritterObj(o)) return -1;
  const s = st(o);
  const a = amount > 0 ? amount - Math.trunc((amount * resistPct) / 100) : amount;
  s.rads = Math.max(0, s.rads + a);
  return 0;
}

export const critterRads = (o: GameObject): number => (isCritterObj(o) ? st(o).rads : 0);

/** Stan krytera do zapisu mapy: HP (undefined = pelne) i flagi obrazen. */
export function critterSnapshot(o: GameObject): { hp: number | undefined; flags: number } | null {
  if (!isCritterObj(o)) return null;
  const s = st(o);
  return { hp: s.hp, flags: s.flags };
}

/** Odtwarza HP i flagi obrazen krytera po ponownym zaladowaniu mapy. */
export function critterRestoreState(o: GameObject, hp: number | undefined, flags: number): void {
  if (!isCritterObj(o)) return;
  const s = st(o);
  s.hp = hp;
  s.flags = flags;
}
