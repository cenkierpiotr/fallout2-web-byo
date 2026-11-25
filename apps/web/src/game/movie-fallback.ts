/**
 * Zastepczy tekst dla filmow, ktorych nie ma w MASTER.DAT (adestroy, car, cartucci, enclave; dokumentacja techniczna
 * world-speech-movies.md). `play_gmovie` zwraca wtedy 'missing' (skrypt idzie dalej, bez flagi obejrzano);
 * dodatkowo gracz widzi krotka, pomijalna plansze tekstowa zamiast cichego przeskoku. Brak lore: tekst
 * jest neutralny (nazwa pliku), bo nie znamy tresci filmow.
 */

export const MISSING_MOVIE_NAMES: readonly string[] = ['adestroy', 'car', 'cartucci', 'enclave'];

/** Czas wyswietlenia planszy zastepczej (ms); Esc/klik skraca. */
export const FALLBACK_HOLD_MS = 3000;

type Locale = 'pl' | 'en';

/**
 * Slajdy progow dni (0x4a3690): w oryginale to zwykle filmy artimer1..4 odtwarzane przez 0x44e690 (D z
 * dekompilacji: funkcja otwiera `art\\cuts\\<nazwa>.mve` i gra MVE, nie ma osobnego ekranu slajdow). Gdy
 * biblioteka filmow nie ma pliku, pokazujemy plansze z liczba dni (90/180/270/360, D) zamiast cichego skoku.
 */
export const SLIDE_MOVIE_DAYS: Readonly<Record<string, number>> = {
  artimer1: 90,
  artimer2: 180,
  artimer3: 270,
  artimer4: 360,
};

export function fallbackText(name: string, locale: Locale): string | null {
  const n = name.toLowerCase().replace(/\.mve$/, '');
  const days = SLIDE_MOVIE_DAYS[n];
  if (days !== undefined) {
    return locale === 'pl'
      ? `[Plansza zastepcza: minelo ${days} dni. Film "${n}" nie jest dostepny w plikach gry.]`
      : `[Placeholder: ${days} days have passed. Movie "${n}" is not available in the game files.]`;
  }
  if (!MISSING_MOVIE_NAMES.includes(n)) return null;
  return locale === 'pl'
    ? `[Film "${n}" nie jest dostepny w oryginalnych plikach gry. Pomijam.]`
    : `[Movie "${n}" is not available in the original game files. Skipping.]`;
}

export interface FallbackDeps {
  locale(): Locale;
  /** Pokazuje tekst (string) lub chowa plansze (null). */
  show(text: string | null): void;
}

let pending: { timer: ReturnType<typeof setTimeout>; done: () => void } | null = null;

/** Pokazuje tekst zastepczy na FALLBACK_HOLD_MS (lub do skipMissingFallback); film spoza listy: nic. */
export function playMissingFallback(name: string, deps: FallbackDeps): Promise<void> {
  const text = fallbackText(name, deps.locale());
  if (text === null) return Promise.resolve();
  // nowa plansza konczy poprzednia (inaczej jej promise wisialby na zawsze)
  pending?.done();
  return new Promise<void>((resolve) => {
    deps.show(text);
    let finished = false;
    const entry = {
      timer: setTimeout(() => done(), FALLBACK_HOLD_MS),
      done: () => done(),
    };
    const done = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(entry.timer);
      if (pending === entry) {
        pending = null;
        deps.show(null);
      }
      resolve();
    };
    pending = entry;
  });
}

export function skipMissingFallback(): void {
  pending?.done();
}
