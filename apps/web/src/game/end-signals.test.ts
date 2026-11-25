import { describe, expect, it, vi } from 'vitest';
import { pollEndSignals, type EndSignalSource } from './end-signals';

const src = (e: boolean, d: boolean): EndSignalSource => ({
  endGameRequested: e,
  playerDeathRequested: d,
  clearEndSignals() {
    this.endGameRequested = false;
    this.playerDeathRequested = false;
  },
});
const flow = () => ({ die: vi.fn(() => true), endGame: vi.fn(() => true) });

describe('pollEndSignals', () => {
  it('brak skryptow lub sygnalow: nic', () => {
    const f = flow();
    expect(pollEndSignals(undefined, f)).toBeNull();
    expect(pollEndSignals(src(false, false), f)).toBeNull();
    expect(f.die).not.toHaveBeenCalled();
    expect(f.endGame).not.toHaveBeenCalled();
  });
  it('zakonczenie: wola endGame i zdejmuje flage', () => {
    const f = flow();
    const s = src(true, false);
    expect(pollEndSignals(s, f)).toBe('ending');
    expect(f.endGame).toHaveBeenCalledOnce();
    expect(s.endGameRequested).toBe(false);
    expect(pollEndSignals(s, f)).toBeNull();
  });
  it('smierc ma pierwszenstwo', () => {
    const f = flow();
    expect(pollEndSignals(src(true, true), f)).toBe('death');
    expect(f.die).toHaveBeenCalledWith('script');
    expect(f.endGame).not.toHaveBeenCalled();
  });

  it('limit 13 lat: smierc z powodem timeout, tylko raz do zmiany ekranu', () => {
    const f = flow();
    expect(pollEndSignals(src(false, false), f, { yearLimitReached: false })).toBeNull();
    expect(f.die).not.toHaveBeenCalled();
    expect(pollEndSignals(src(false, false), f, { yearLimitReached: true })).toBe('timeout');
    expect(f.die).toHaveBeenCalledWith('timeout');
  });
  it('limit lat dziala tez bez skryptow, a sygnal skryptu ma pierwszenstwo', () => {
    const f = flow();
    expect(pollEndSignals(undefined, f, { yearLimitReached: true })).toBe('timeout');
    const g = flow();
    expect(pollEndSignals(src(true, false), g, { yearLimitReached: true })).toBe('ending');
    expect(g.die).not.toHaveBeenCalled();
  });
});
