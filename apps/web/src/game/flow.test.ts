import { describe, expect, it } from 'vitest';
import { GameFlow } from './flow';

describe('GameFlow', () => {
  it('przechodzi menu -> kreator -> gra -> smierc -> menu', () => {
    const f = new GameFlow();
    expect(f.screen.value).toBe('menu');
    expect(f.newGame()).toBe(true);
    expect(f.startPlaying()).toBe(true);
    expect(f.die('hp0')).toBe(true);
    expect(f.deathReason.value).toBe('hp0');
    expect(f.toMenu()).toBe(true);
    expect(f.screen.value).toBe('menu');
  });
  it('zakonczenie prowadzi do napisow, potem menu', () => {
    const f = new GameFlow();
    f.startPlaying();
    expect(f.endGame()).toBe(true);
    expect(f.showCredits()).toBe(true);
    expect(f.toMenu()).toBe(true);
  });
  it('ignoruje niedozwolone przejscia', () => {
    const f = new GameFlow();
    expect(f.die()).toBe(false);
    expect(f.endGame()).toBe(false);
    expect(f.screen.value).toBe('menu');
  });
  it('zapamietuje ostatni zapis', () => {
    const f = new GameFlow();
    f.noteSave('quick');
    expect(f.lastSave.value).toBe('quick');
  });
});
