/**
 * Dodatkowe cele eksplozji (0x423c10 compute_explosion_on_extras, specyfikacja formatu R13e). Limit 6, filtr i pierscienie
 * 1..3 wokol kafla = D (specyfikacja formatu silnik gry: 0x479188 zwraca 3; 0x479180 zwraca 2 tylko dla trybu ebx != 0).
 * Kolejnosc kafli wewnatrz pierscienia (start kierunek 2, cykl 6 kierunkow) = Z.
 */
export const EXPLOSION_MAX_EXTRAS = 6;
/** Maksymalny promien dodatkowych celow wybuchu ladunku (D). */
export const EXPLOSION_MAX_RADIUS = 3;

/** Pid dynamitu / plastiku i ich wersji aktywowanych (D: handler 0x4a2828 oraz uzycie 0x49bcb4). */
export const DYNAMITE_PID = 0x33;
export const PLASTIC_PID = 0x55;
export const DYNAMITE_ACTIVE_PID = 0xce;
export const PLASTIC_ACTIVE_PID = 0xd1;
/** Perk Demolition Expert (sprawdzany 0x496b78 na graczu, D). */
export const DEMOLITION_EXPERT_PERK = 0x52;
/** Skill Traps (0xb), ktorym jest rzucany test przy ustawianiu ladunku (D: 0x4aaaa4(gracz, 0xb, 0, 0)). */
export const TRAPS_SKILL = 11;
/** 10 tickow = 1 s (D: czas z dialogu mnozony przez 5 i 2). */
export const EXPLOSIVE_TICKS_PER_SECOND = 10;

export function isExplosivePid(pid: number): boolean {
  return (
    pid === DYNAMITE_PID ||
    pid === PLASTIC_PID ||
    pid === DYNAMITE_ACTIVE_PID ||
    pid === PLASTIC_ACTIVE_PID
  );
}

/** Obrazenia wybuchu wg pid (D, 0x4a2834): dynamit 30-50, plastik 40-80; Demolition Expert +10 do min i max. */
export function explosiveDamageRange(
  pid: number,
  demolitionExpert: boolean,
): { min: number; max: number } | null {
  let r: { min: number; max: number };
  if (pid === DYNAMITE_PID || pid === DYNAMITE_ACTIVE_PID) r = { min: 30, max: 50 };
  else if (pid === PLASTIC_PID || pid === PLASTIC_ACTIVE_PID) r = { min: 40, max: 80 };
  else return null;
  const b = demolitionExpert ? 10 : 0;
  return { min: r.min + b, max: r.max + b };
}

/** Pid po ustawieniu ladunku (D, 0x49bd45): 0x33 -> 0xce, 0x55 -> 0xd1. */
export function activatedExplosivePid(pid: number): number {
  if (pid === DYNAMITE_PID) return DYNAMITE_ACTIVE_PID;
  if (pid === PLASTIC_PID) return PLASTIC_ACTIVE_PID;
  return pid;
}

export interface ExplosiveFuse {
  kind: 'explosion' | 'misfire';
  delayTicks: number;
}

/**
 * Wynik ustawienia ladunku (D: 0x49bd73..0x49bdc4). Z perkiem Demolition Expert test pomijany = wybuch po czasie.
 * Inaczej rzut Traps: 0 (krytyczna porazka) = misfire (typ 11) po pelnym czasie, 1 (porazka) = misfire po polowie
 * czasu, 2/3 (sukces) = wybuch (typ 8) po czasie. Znaczenie liczb wyniku rzutu = W (0x4aaaa4 nie analizowane).
 */
export function explosiveFuse(
  seconds: number,
  rollResult: number,
  demolitionExpert: boolean,
): ExplosiveFuse {
  const ticks = seconds * EXPLOSIVE_TICKS_PER_SECOND;
  if (demolitionExpert) return { kind: 'explosion', delayTicks: ticks };
  if (rollResult === 0) return { kind: 'misfire', delayTicks: ticks };
  if (rollResult === 1) return { kind: 'misfire', delayTicks: ticks >>> 1 };
  return { kind: 'explosion', delayTicks: ticks };
}

export interface ExplosionCandidate {
  isCritter: boolean;
  /** +0x44 & 0x80 (martwy). */
  dead: boolean;
  /** +0x27 & 0x80. */
  hidden: boolean;
  /** 0x426cc4(0) != 0 (semantyka Z). */
  blocked: boolean;
}

export function isExplosionVictimEligible(c: ExplosionCandidate): boolean {
  return c.isCritter && !c.dead && !c.hidden && !c.blocked;
}

/** Dodaje cel bez duplikatow, do limitu 6. */
export function addExplosionExtra(list: readonly number[], id: number): number[] {
  if (list.includes(id) || list.length >= EXPLOSION_MAX_EXTRAS) return [...list];
  return [...list, id];
}

/**
 * Kolejnosc kafli pierscieni eksplozji (0x423c10, D z asm): pierscien r = 1..maxRadius ma 6r kafli.
 * Start pierscienia = start poprzedniego pierscienia przesuniety o kierunek 0 (srodek + r*dir 0); potem kierunek 2
 * przez r krokow, 3 przez r, 4, 5, 0 (po r krokow kazdy) i 1 (r-1 krokow, szosty krok wraca na start i konczy pierscien).
 * Zmiana kierunku co r krokow (licznik modulo r). `neighbor` = 0x4b1a6c z krokiem 1; wynik < 0 przerywa cala
 * funkcje (jak edi == -1 w 0x423d5d). Zachowanie oryginalu na krawedzi mapy (brak wyjscia z petli) jest Z.
 */
export function explosionRingTiles(
  center: number,
  maxRadius: number,
  neighbor: (hex: number, dir: number) => number,
): number[] {
  const out: number[] = [];
  let start = center;
  for (let r = 1; r <= maxRadius; r++) {
    start = neighbor(start, 0);
    if (start < 0) return out;
    let cur = start;
    out.push(cur);
    let dir = 2;
    for (let step = 1; step < 6 * r; step++) {
      cur = neighbor(cur, dir);
      if (cur < 0) return out;
      out.push(cur);
      if (step % r === 0) dir = (dir + 1) % 6;
    }
  }
  return out;
}
