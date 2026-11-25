import { describe, expect, it, vi } from 'vitest';
import { AmbientDirector } from './ambient-director';

function fakeTimers() {
  const q: { cb: () => void; ms: number; id: number }[] = [];
  let n = 0;
  return {
    q,
    timers: {
      set: (cb: () => void, ms: number) => {
        q.push({ cb, ms, id: ++n });
        return n;
      },
      clear: (id: unknown) => {
        const i = q.findIndex((t) => t.id === id);
        if (i >= 0) q.splice(i, 1);
      },
    },
  };
}

describe('AmbientDirector', () => {
  it('losuje efekt wazony i planuje kolejny; stop czysci', async () => {
    const { q, timers } = fakeTimers();
    const play = vi.fn(async () => undefined);
    const d = new AmbientDirector({ play }, () => 0, timers);
    d.onMap([
      { name: 'wind', chance: 30 },
      { name: 'birds', chance: 70 },
    ]);
    expect(q).toHaveLength(1);
    expect(q[0]!.ms).toBe(15000);
    q.shift()!.cb();
    await Promise.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledWith('WIND');
    expect(q).toHaveLength(1);
    d.stop();
    expect(q).toHaveLength(0);
  });
  it('mapa bez ambientu nic nie planuje', () => {
    const { q, timers } = fakeTimers();
    const d = new AmbientDirector({ play: vi.fn() }, () => 0, timers);
    d.onMap(undefined);
    d.onMap([]);
    expect(q).toHaveLength(0);
  });
});
