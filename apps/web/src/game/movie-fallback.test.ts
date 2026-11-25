import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_HOLD_MS,
  SLIDE_MOVIE_DAYS,
  MISSING_MOVIE_NAMES,
  fallbackText,
  playMissingFallback,
  skipMissingFallback,
} from './movie-fallback';

describe('zastepczy tekst brakujacych filmow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('4 filmy bez pliku w MASTER.DAT maja tekst pl i en z nazwa filmu', () => {
    expect([...MISSING_MOVIE_NAMES].sort()).toEqual(['adestroy', 'car', 'cartucci', 'enclave']);
    for (const n of MISSING_MOVIE_NAMES) {
      expect(fallbackText(n, 'pl')).toContain(n);
      expect(fallbackText(n, 'en')).toContain(n);
      expect(fallbackText(n, 'pl')).not.toBe(fallbackText(n, 'en'));
    }
  });

  it('slajdy progow dni artimer1-4: plansza z liczba dni pl/en, nazwa wielkimi literami i .mve dzialaja', () => {
    expect(Object.keys(SLIDE_MOVIE_DAYS)).toEqual(['artimer1', 'artimer2', 'artimer3', 'artimer4']);
    expect(fallbackText('artimer1', 'pl')).toContain('90 dni');
    expect(fallbackText('ARTIMER2.mve', 'en')).toContain('180 days');
    expect(fallbackText('artimer3', 'en')).toContain('270');
    expect(fallbackText('artimer4', 'pl')).toContain('360');
    expect(fallbackText('artimer4', 'pl')).not.toBe(fallbackText('artimer4', 'en'));
  });

  it('film spoza listy (np. dowolny inny brak) nie ma tekstu: cichy skip', async () => {
    expect(fallbackText('intro', 'pl')).toBeNull();
    const show = vi.fn();
    await playMissingFallback('intro', { locale: () => 'pl', show });
    expect(show).not.toHaveBeenCalled();
  });

  it('pokazuje tekst, po czasie chowa i konczy; nazwa wielkimi literami i z .mve dziala', async () => {
    const show = vi.fn();
    const p = playMissingFallback('ENCLAVE.mve', { locale: () => 'en', show });
    expect(show).toHaveBeenLastCalledWith(expect.stringContaining('enclave'));
    await vi.advanceTimersByTimeAsync(FALLBACK_HOLD_MS);
    await p;
    expect(show).toHaveBeenLastCalledWith(null);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('skipMissingFallback przerywa oczekiwanie natychmiast', async () => {
    const show = vi.fn();
    const p = playMissingFallback('car', { locale: () => 'pl', show });
    skipMissingFallback();
    await p;
    expect(show).toHaveBeenLastCalledWith(null);
  });

  it('skip bez aktywnego zastepnika jest bezpieczny', () => {
    expect(() => skipMissingFallback()).not.toThrow();
  });

  it('nowa plansza konczy poprzednia (promise nie wisi) i ma wlasny timer', async () => {
    const show = vi.fn();
    const d = { locale: () => 'en' as const, show };
    let first = false;
    void playMissingFallback('car', d).then(() => (first = true));
    const p2 = playMissingFallback('enclave', d);
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toBe(true);
    await vi.advanceTimersByTimeAsync(FALLBACK_HOLD_MS);
    await p2;
    expect(show).toHaveBeenLastCalledWith(null);
  });
});
