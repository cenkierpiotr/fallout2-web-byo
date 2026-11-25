/** Zegar gry wg dokumentacja techniczna (R15): 10 tickow = 1 s, bez lat przestepnych. */
export interface GameDate {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TPS = 10;
const TICKS_PER_DAY = 864000;
const DAYS_PER_YEAR = 365;

export class GameClock {
  static readonly TICKS_PER_SECOND = TPS;
  static readonly TICKS_PER_MINUTE = 600;
  static readonly TICKS_PER_HOUR = 36000;
  static readonly TICKS_PER_DAY = TICKS_PER_DAY;
  /** Start nowej gry: 08:24 (set_time(302400) w 0x4a51fb). */
  static readonly START_TICKS = 302400;

  private _ticks: number;
  private readonly yearLimitListeners = new Set<() => void>();

  /**
   * Licznik w oryginale to uint32 (DAT 0x51c720); tu zwykly number bez wraparound (limit gry 13 lat
   * = 4.1e9 ticków mieści sie w uint32 tuz przed przepelnieniem, patrz dokumentacja techniczna).
   */
  constructor(ticks: number = GameClock.START_TICKS) {
    if (!Number.isFinite(ticks) || ticks < 0)
      throw new RangeError(`GameClock: nieprawidlowe ticki ${ticks}`);
    this._ticks = ticks;
  }

  /** Licznik ticków (uint32 DAT 0x51c720); kazdy zapis (advance, rest, wczytanie) przechodzi przez setter. */
  get ticks(): number {
    return this._ticks;
  }

  set ticks(v: number) {
    this._ticks = v;
    this.notifyYearLimit();
  }

  /**
   * Zdarzeniowa wersja sprawdzania limitu roku (oryginal sprawdza przy kazdym przesunieciu zegara, 0x4a34cc):
   * listener wolany po kazdym zapisie ticków, gdy limit jest osiagniety. Zwraca funkcje wypisujaca.
   */
  onYearLimit(listener: () => void): () => void {
    this.yearLimitListeners.add(listener);
    return () => void this.yearLimitListeners.delete(listener);
  }

  private notifyYearLimit(): void {
    if (this.yearLimitListeners.size === 0 || !this.yearLimitReached) return;
    for (const l of [...this.yearLimitListeners]) l();
  }

  /** Dlugosc roku gry w tickach (365 dob), dzielnik limitu 0x4a34ca. */
  static readonly TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
  /** Limit gry (0x4a34ca): po `ticks / 315360000 >= 13` wolane 0x440bd0 i flaga konca [0x5186cc] = 2 (D). */
  static readonly YEAR_LIMIT = 13;

  /** Czy uplynelo 13 lat gry (D, 0x4a34ca): dzielenie calkowite `ticks / 315360000 >= 13`. */
  get yearLimitReached(): boolean {
    return Math.floor(this.ticks / GameClock.TICKS_PER_YEAR) >= GameClock.YEAR_LIMIT;
  }

  advance(ticks: number): void {
    if (!Number.isFinite(ticks) || ticks < 0)
      throw new RangeError(`advance: nieprawidlowe ticki ${ticks}`);
    this.ticks = this._ticks + ticks;
  }

  get date(): GameDate {
    const d = Math.floor(this.ticks / TICKS_PER_DAY) + 24;
    let year = Math.floor(d / DAYS_PER_YEAR) + 2241;
    let doy = d % DAYS_PER_YEAR;
    let m = 6;
    while (DAYS_IN_MONTH[m]! <= doy) {
      doy -= DAYS_IN_MONTH[m]!;
      m++;
      if (m > 11) {
        year++;
        m = 0;
      }
    }
    const secs = Math.floor(this.ticks / TPS);
    return {
      year,
      month: m + 1,
      day: doy + 1,
      hour: Math.floor(secs / 3600) % 24,
      minute: Math.floor(secs / 60) % 60,
      second: secs % 60,
    };
  }

  /** Jak game_time (calkowite dziesiate czesci sekundy). */
  gameTime(): number {
    return Math.floor(this.ticks);
  }

  get hour(): number {
    return this.date.hour;
  }
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pl: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'],
} as const;

export function formatGameDate(clock: GameClock, locale: 'pl' | 'en'): string {
  const d = clock.date;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.day} ${MONTHS[locale][d.month - 1]} ${d.year} ${p(d.hour)}:${p(d.minute)}`;
}
