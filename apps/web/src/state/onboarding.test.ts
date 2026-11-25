// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STEPS,
  advance,
  skipAll,
  initialState,
  loadState,
  saveState,
  labelForPatch,
  tutorialHint,
  type OnboardingState,
} from './onboarding';

describe('onboarding', () => {
  beforeEach(() => localStorage.clear());

  it('kolejnosc krokow i przejscie do done', () => {
    expect(STEPS).toEqual(['folder', 'detect', 'profile', 'scale', 'tutorial']);
    let s: OnboardingState = initialState();
    const seen: string[] = [];
    while (!s.done) {
      seen.push(STEPS[s.step] as string);
      s = advance(s);
    }
    expect(seen).toEqual([...STEPS]);
  });

  it('skip konczy od razu', () => {
    expect(skipAll()).toEqual({ step: STEPS.length, done: true });
  });

  it('stan zapisuje sie i wraca; drugi start po done nie pokazuje onboardingu', () => {
    saveState({ step: STEPS.length, done: true });
    expect(loadState().done).toBe(true);
  });

  it('uszkodzony zapis daje stan poczatkowy', () => {
    localStorage.setItem('f2.onboarding', '{zle');
    expect(loadState()).toEqual(initialState());
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 99, done: 'x' }));
    expect(loadState()).toEqual(initialState());
  });

  it('etykieta wydania gry', () => {
    expect(labelForPatch('1.02.25')).toBe('patch 1.02.25');
    expect(labelForPatch('vanilla')).toBe('vanilla');
    expect(labelForPatch('unknown')).toBe('unknown');
  });

  it('podpowiedz samouczka odpala sie raz na zdarzenie', () => {
    const fired = new Set<string>();
    expect(tutorialHint(fired, 'move')).toBe('move');
    expect(tutorialHint(fired, 'move')).toBeNull();
    expect(tutorialHint(fired, 'inventory')).toBe('inventory');
  });
});

describe('releaseLabel', () => {
  it('zweryfikowane wydanie z DAT2 daje jego nazwe', async () => {
    const { releaseLabel } = await import('./onboarding');
    expect(
      releaseLabel({ phase: 'done', result: { status: 'verified', edition: 'GOG 1.02' } }),
    ).toBe('GOG 1.02');
  });
  it('w trakcie weryfikacji zwraca tekst oczekiwania, w innych przypadkach undefined', async () => {
    const { releaseLabel } = await import('./onboarding');
    expect(releaseLabel({ phase: 'running' }, 'sprawdzam')).toBe('sprawdzam');
    expect(releaseLabel({ phase: 'running' })).toBeUndefined();
    expect(releaseLabel({ phase: 'idle' })).toBeUndefined();
    expect(releaseLabel({ phase: 'done', result: { status: 'unknown' } })).toBeUndefined();
    expect(
      releaseLabel({ phase: 'done', result: { status: 'invalid', edition: 'x' } }),
    ).toBeUndefined();
  });

  it('migracja zapisu sprzed kroku scale: tutorial (3) -> 4, done (4) -> 5; zapis v2 bez zmian', () => {
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 3, done: false }));
    expect(STEPS[loadState().step]).toBe('tutorial');
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 4, done: true }));
    expect(loadState()).toEqual({ step: 5, done: true });
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 2, done: false }));
    expect(loadState().step).toBe(2);
    saveState({ step: 3, done: false });
    expect(loadState()).toEqual({ step: 3, done: false });
    expect(STEPS[loadState().step]).toBe('scale');
  });
});
