// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentHint,
  dismissHint,
  fireHint,
  hintForKey,
  hintForMenu,
  hintForTap,
  loadTutorial,
  resetTutorialForTest,
  skipTutorial,
} from './tutorial-hints';

describe('samouczek w grze', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTutorialForTest();
  });
  it('kazda podpowiedz pada raz i przezywa przeladowanie', () => {
    expect(fireHint('move')).toBe('move');
    expect(currentHint.value).toBe('move');
    dismissHint();
    expect(currentHint.value).toBeNull();
    expect(fireHint('move')).toBeNull();
    resetTutorialForTest();
    expect(fireHint('move')).toBeNull();
    expect(fireHint('inventory')).toBe('inventory');
  });
  it('pominiecie wylacza wszystkie podpowiedzi na stale', () => {
    fireHint('move');
    skipTutorial();
    expect(currentHint.value).toBeNull();
    expect(fireHint('save')).toBeNull();
    resetTutorialForTest();
    expect(loadTutorial().off).toBe(true);
    expect(fireHint('interact')).toBeNull();
  });
  it('uszkodzony zapis i nieznane zdarzenia sa ignorowane', () => {
    localStorage.setItem('f2.tutorial', '{"fired":["zly",5,"save"],"off":"tak"}');
    const s = loadTutorial();
    expect([...s.fired]).toEqual(['save']);
    expect(s.off).toBe(false);
    localStorage.setItem('f2.tutorial', 'nie json');
    expect(loadTutorial().fired.size).toBe(0);
  });

  it('hintForTap (interceptTap): obsluzony obiekt = interact, puste pole = move, kazde raz', () => {
    expect(hintForTap(true)).toBe('interact');
    expect(hintForTap(true)).toBeNull();
    expect(hintForTap(false)).toBe('move');
    expect(hintForTap(false)).toBeNull();
  });
  it('hintForKey: F5 = save raz; inne klawisze nic; ekwipunek przez fireHint raz', () => {
    expect(hintForKey('a')).toBeNull();
    expect(hintForKey('F5')).toBe('save');
    expect(hintForKey('F5')).toBeNull();
    expect(fireHint('inventory')).toBe('inventory');
    expect(fireHint('inventory')).toBeNull();
  });
  it('po skipTutorial zadne podpowiedzi z tap/klawisza nie padaja', () => {
    skipTutorial();
    expect(hintForTap(true)).toBeNull();
    expect(hintForKey('F5')).toBeNull();
  });

  it('hintForMenu: otwarcie menu akcji = actionMenu, tylko raz', () => {
    expect(hintForMenu()).toBe('actionMenu');
    expect(hintForMenu()).toBeNull();
  });
});
