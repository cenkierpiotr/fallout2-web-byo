// Kontrola sojusznikow w strefie wybuchu / serii dla AI (silnik gry 0x4213e8, wlasciwe cialo 0x4213fc, ramka 0xe8 B).
// D wg specyfikacja formatu; Z oznaczone w komentarzach. Zob. dokumentacja techniczna (tryb obszarowy 0x429db4).
//
// Sygnatura (Watcom): 0x4213fc(eax=attacker, edx=weapon, ebx=hitMode, ecx=target, stack: outSteps*, exclude*).
//   0x4213e8 = wrapper z exclude = 0 (outSteps = argument stosu); 0x4217bc(attacker, target, weapon, exclude=ebx)
//   = wrapper z hitMode = 2 i outSteps = 0.
// Wolajacy (D): 0x42958e i 0x429712 (wybor broni 0x4293bc, hitMode 2, out 0: != 0 -> flaga "skipTable", indeks 999),
//   0x429ea7/0x429ee7/0x429f20 (tryb obszarowy 0x429db4, hitMode 3, out 0, po to-hit >= 85/50/95: wynik != 0 blokuje),
//   0x42a8ea (atak 0x42a7d8, hitMode 2, out = &lokalna), 0x42a59e przez 0x4217bc (kontrola toru: obiekt zatrzymujacy
//   tor 0x4163c8 jako exclude, "Friendly was in the way!" 0x500a4c -> 1).
// Wynik: 1 = sojusznik oberwie (blokada), 0 = czysto. Gdy outSteps != null i atakujacy stoi w promieniu wybuchu,
//   *out = promien - dystans + 1 (heksow do wyjscia ze strefy), wynik 0 (Z: konsument w 0x42a8ea nieodtworzony).

/** Animacje ataku serii: 0x47860c(weapon, hitMode) == 0x2e (burst) lub 0x2f (continuous), D. */
export const ANIM_FIRE_BURST = 0x2e;
export const ANIM_FIRE_CONTINUOUS = 0x2f;
/** Pid krytera, dla ktorego funkcja zawsze zwraca 0 (D: cmp [attacker+0x64], 0x10001e0). Z: ktory to kryter. */
export const ALLY_CHECK_EXEMPT_PID = 0x10001e0;
/** Komunikat debug 0x500a4c. */
export const FRIENDLY_IN_WAY_MESSAGE = 'Friendly was in the way!';
/** Statystyki DT/DR: 0x11 + typ obrazen (DT), 0x18 + typ (DR), D. */
export const STAT_DT_BASE = 0x11;
export const STAT_DR_BASE = 0x18;

export interface AllyCandidate {
  id: number;
  /** obj+0x50 (team_num). */
  team: number;
  /** 0x42dd18 != 0 (martwy / HP <= 0 / flaga 0x80). */
  dead: boolean;
  /** obj+0x54 (who_hit_me), id obiektu lub undefined. Gdy == id wlasny, kryter jest pomijany (Z: sens). */
  whoHitMeId?: number | undefined;
  /** stat(0x11 + typ) i stat(0x18 + typ) (0x4aef48). */
  dt: (damageType: number) => number;
  dr: (damageType: number) => number;
}

export interface AllyFireInput {
  attackerId: number;
  attackerPid: number;
  attackerTeam: number;
  /** Stat 4 (Inteligencja) atakujacego. */
  intelligence: number;
  targetId: number;
  /** 0x47910c(weapon, hitMode): promien wybuchu (3 granat, 2 rakieta wg klasy/typu), 0 = brak. */
  radius: number;
  /** 0x47860c(weapon, hitMode); istotne tylko przy radius <= 0. */
  attackAnim: number;
  /** 0x4783b8(weapon, 0) -> max obrazen z protoku broni. */
  maxDamage: number;
  /** 0x478570(attacker, weapon): typ obrazen. */
  damageType: number;
  /** Dodatkowy obiekt (parametr stosu [0xfc]): blokujacy tor. */
  excludeId?: number | undefined;
  /** Czy wolajacy podal wskaznik wyniku (0x42a8ea). */
  wantSteps?: boolean;
  /** Wszyscy walczacy (lista 0x56d390, licznik 0x56d37c). */
  critters: readonly AllyCandidate[];
  /** 0x48bbd4 (odleglosc heksowa z korekta multihex) miedzy obiektami o id. */
  distance: (a: number, b: number) => number;
  /** Cele dodatkowe serii (0x423488 po 0x4243a8): id obiektow na torze serii. Z: sam rozklad. */
  burstVictims?: () => readonly number[];
}

export interface AllyFireResult {
  /** 1 = blokada (sojusznik w strefie / na torze), 0 = czysto. */
  result: 0 | 1;
  /** *out (heksy do wyjscia ze strefy), 0 gdy nie ustawiono. */
  steps: number;
  /** Wypisano "Friendly was in the way!". */
  friendlyInWay: boolean;
}

const cTrunc = (n: number): number => Math.trunc(n);

/** Czy kryter `c` oberwie: ((max - DT) * DR) / 100 > 0 (D, idiv; uwaga: mnozone przez DR, nie 100 - DR). */
function takesDamage(c: AllyCandidate, maxDamage: number, damageType: number): boolean {
  return cTrunc(((maxDamage - c.dt(damageType)) * c.dr(damageType)) / 100) > 0;
}

export function allyFireCheck(i: AllyFireInput): AllyFireResult {
  const clean: AllyFireResult = { result: 0, steps: 0, friendlyInWay: false };
  if (i.attackerPid === ALLY_CHECK_EXEMPT_PID) return clean;
  const isAlly = (c: AllyCandidate): boolean =>
    c.team === i.attackerTeam &&
    c.id !== i.attackerId &&
    c.id !== i.targetId &&
    !c.dead &&
    c.whoHitMeId !== c.id;

  if (i.radius > 0) {
    let radius = i.radius;
    if (i.intelligence < 5) radius = Math.max(0, radius - (5 - i.intelligence));
    if (
      i.excludeId !== undefined &&
      i.excludeId !== 0 &&
      i.distance(i.targetId, i.excludeId) < radius
    ) {
      return { result: 1, steps: 0, friendlyInWay: true };
    }
    for (const c of i.critters) {
      if (!isAlly(c)) continue;
      if (i.distance(i.targetId, c.id) >= radius) continue;
      if (takesDamage(c, i.maxDamage, i.damageType))
        return { result: 1, steps: 0, friendlyInWay: false };
    }
    const dAttacker = i.distance(i.targetId, i.attackerId);
    if (dAttacker > radius) return clean;
    if (!i.wantSteps) return { result: 1, steps: 0, friendlyInWay: false };
    return { result: 0, steps: radius - dAttacker + 1, friendlyInWay: false };
  }

  if (i.attackAnim !== ANIM_FIRE_BURST && i.attackAnim !== ANIM_FIRE_CONTINUOUS) return clean;
  const victims = i.burstVictims?.() ?? [];
  if (i.excludeId !== undefined && i.excludeId !== 0 && victims.includes(i.excludeId)) {
    return { result: 1, steps: 0, friendlyInWay: true };
  }
  for (const id of victims) {
    const c = i.critters.find((x) => x.id === id);
    if (c && isAlly(c) && takesDamage(c, i.maxDamage, i.damageType)) {
      return { result: 1, steps: 0, friendlyInWay: false };
    }
  }
  return clean;
}
