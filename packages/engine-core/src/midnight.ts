import { GameClock } from './game-clock.js';
import type { EventQueue, GameEvent } from './event-queue.js';
import type { GameObject } from './game-object.js';

/** Progi dni gry z 0x4a3690 (D): `dni >=` prog, kazdy slajd pokazywany raz (flagi 0x596c78+msg). */
export const MIDNIGHT_DAY_THRESHOLDS = [90, 180, 270, 360] as const;

/** Numer komunikatu slajdu dla progu dni (0x4a3690): 90->0xc, 180->0xd, 270->0xe, 360->0xf. */
export const DAY_THRESHOLD_MSG: Readonly<Record<number, number>> = {
  90: 0xc,
  180: 0xd,
  270: 0xe,
  360: 0xf,
};

/** Wejscie/wyjscie progu dni 0x4a3690: zmienne globalne, flagi obejrzanych slajdow, slajd i zakonczenie. */
export interface DayThresholdIO {
  gvar(index: number): number;
  setGvar(index: number, value: number): void;
  /** 0x44eb04: czy slajd o tym numerze komunikatu byl juz pokazany. */
  slideSeen(msg: number): boolean;
  /** 0x44e690: pokazuje slajd i oznacza go jako obejrzany. */
  showSlide(msg: number): void;
  /** Sekwencja zakonczenia gry (0x4c46cc x2, 0x4c4634); `msg` = 4 (gvar 7) lub 0xf (dzien 360). */
  endGame(msg: number): void;
}

/** GVAR 7 (!= 0 = przymusowe zakonczenie), GVAR 494 (stan Enklawy, < 3), GVAR 47 (-15 po slajdzie 0xe). */
export const GVAR_FORCED_ENDING = 7;
export const GVAR_ENCLAVE_STATE = 0x1ee;
export const GVAR_DAY_PENALTY = 0x2f;

/**
 * Progi dni 0x4a3690 (asm, D poza oznaczonymi): gvar 7 != 0 => zakonczenie (msg 4). Inaczej dla dni >= 360
 * (niezaleznie od gvar 494) slajd 0xf jesli niewidziany => zakonczenie; dla dni < 360 i gvar 494 < 3:
 * >=270 slajd 0xe (i gvar 47 -= 15, W: tylko przy pokazaniu), >=180 slajd 0xd, >=90 slajd 0xc.
 */
export function applyDayThresholds(days: number, io: DayThresholdIO): void {
  if (io.gvar(GVAR_FORCED_ENDING) !== 0) {
    io.endGame(4);
    return;
  }
  if (days >= 360) {
    if (!io.slideSeen(0xf)) {
      io.endGame(0xf);
      io.setGvar(GVAR_DAY_PENALTY, io.gvar(GVAR_DAY_PENALTY) - 15);
    }
    return;
  }
  if (io.gvar(GVAR_ENCLAVE_STATE) >= 3) return;
  const th = days >= 270 ? 270 : days >= 180 ? 180 : days >= 90 ? 90 : 0;
  if (th === 0) return;
  const msg = DAY_THRESHOLD_MSG[th]!;
  if (io.slideSeen(msg)) return;
  io.showSlide(msg);
  if (th === 270) io.setGvar(GVAR_DAY_PENALTY, io.gvar(GVAR_DAY_PENALTY) - 15);
}

export interface MidnightHooks {
  /** Dzienny reset (0x49d4b8): czyszczenie dziennych bitow obiektow (bit 0x04 w obj+0x3f/0x3b). */
  dailyReset(): void;
  /** Progi dni 0x4a3690; bez tego hooka progi sa pomijane. */
  dayThresholds?: DayThresholdIO;
  /** Flaga 0x44eb14 ([0x518e28]): trwa film/slajd; wtedy cala polnoc nie robi nic (D). */
  moviePlaying?(): boolean;
  /** Flaga 0x444d2c ([0x5186d4]): gra zakonczona/koncowka; wtedy progi dni sa pomijane (D). */
  gameEnded?(): boolean;
  /** Promieniowanie 0x42d4f4 na polnoc (kolejkowanie zdarzenia typu 6); W: wywolywane po resecie. */
  radiation?(): void;
}

/**
 * Opoznienie do najblizszej polnocy (0x4a3570): `10*(3600*(23-h) + 60*(59-m) + 60)` ticków,
 * czyli zaokraglone do minuty (sekundy ignorowane).
 */
export function midnightDelay(clock: GameClock): number {
  const { hour, minute } = clock.date;
  return 10 * (3600 * (23 - hour) + 60 * (59 - minute) + 60);
}

/** Usuwa zdarzenia typu 4 i kolejkuje nowe na najblizsza polnoc. */
export function scheduleMidnight(queue: EventQueue, clock: GameClock): void {
  queue.removeByKind('midnight');
  queue.add({
    atTick: clock.ticks + midnightDelay(clock),
    kind: 'midnight',
    objId: 0,
    payload: null,
  });
}

/**
 * Handler zdarzenia 'midnight' (0x4a3620): bramka 0x44eb14 (film), dzienny reset, progi dni (bramka
 * 0x444d2c), ponowne zaplanowanie. Inne zdarzenia: 0.
 */
export function handleMidnight(
  e: GameEvent,
  queue: EventQueue,
  clock: GameClock,
  hooks: MidnightHooks,
): number {
  if (e.kind !== 'midnight') return 0;
  if (hooks.moviePlaying?.()) return 0;
  hooks.dailyReset();
  if (hooks.dayThresholds && !hooks.gameEnded?.()) {
    applyDayThresholds(Math.floor(clock.ticks / GameClock.TICKS_PER_DAY), hooks.dayThresholds);
  }
  hooks.radiation?.();
  scheduleMidnight(queue, clock);
  return 0;
}

/**
 * Poziom z callbacku 0x42d618 (D): przegladanie zdarzen typu 6 przez 0x4a2790 ustawia [0x56d7cc] na poziom
 * (`*(int*)data`) KAZDEGO napotkanego zdarzenia, wiec po przejsciu zostaje poziom OSTATNIEGO w kolejnosci
 * (kolejka posortowana po czasie, czyli najpozniejszego); 0 gdy brak. Callback zwraca 0, wiec zdarzenia
 * zostaja w kolejce. Wynik to `pendingLevel` dla `radiationMidnightCheck`.
 */
export function pendingRadiationLevel(queue: EventQueue): number {
  const evs = queue.peek((e) => e.kind === 'radiation');
  const last = evs[evs.length - 1];
  const level = (last?.payload as { level?: unknown } | null | undefined)?.level;
  return typeof level === 'number' ? level : 0;
}

/** Bit 0x04 gornego bajtu pola danych typu (+0x3b przedmiot, +0x3f scenery) = 0x04000000 slowa u32. */
export const DAILY_OBJECT_BIT = 0x04000000;

/**
 * Dzienna petla po obiektach mapy 0x49d4b8 -> 0x49d480 (D, specyfikacja formatu): baza danych typu = obj+0x2c.
 * Typ 2 (scenery): `and byte [obj+0x3f], 0xfb`, czyli u32 pod +0x3c (pierwsze slowo danych podtypu:
 * drzwi/schody/winda/drabina = `extra.raw[0]`, zwykle scenery go nie ma) traci 0x04000000.
 * Typ 0 (przedmiot): `and byte [obj+0x3b], 0xfb`, czyli u32 pod +0x38 (`extra.flags`) traci 0x04000000.
 * Inne typy bez zmian; dzieci ekwipunku nie sa odwiedzane (petla 0x48b3a8/0x48b41c idzie po obiektach mapy).
 */
export function clearDailyObjectBits(objects: Iterable<GameObject>): void {
  for (const o of objects) {
    const x = o.extra;
    if (o.type === 2) {
      if ('raw' in x && x.raw.length > 0) x.raw[0] = (x.raw[0] ?? 0) & ~DAILY_OBJECT_BIT;
    } else if (o.type === 0 && x.kind === 'item') {
      x.flags = (x.flags & ~DAILY_OBJECT_BIT) >>> 0;
    }
  }
}
