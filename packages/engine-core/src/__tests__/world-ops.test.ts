import { describe, expect, it } from 'vitest';
import { exitGridOf, setExitGrids } from '../exit-grid.js';
import { emptyMap, fake, put } from './helpers.js';

const grid = (map: ReturnType<typeof emptyMap>, hex: number, elev: 0 | 1 | 2, pid = 0x5000010) => {
  const o = fake(
    5,
    hex,
    0,
    { kind: 'exitGrid', flags: 0, destMap: 1, destHex: 2, destElevation: 0, destRotation: 3 },
    elev,
  );
  o.pid = pid;
  return put(map, o);
};

describe('set_exit_grids (0x80e6, handler 0x457730)', () => {
  it('ustawia mape, kafel i elewacje tylko na wskazanej elewacji; rotacja bez zmian', () => {
    const map = emptyMap();
    const a = grid(map, 100, 0);
    const b = grid(map, 101, 1);
    const c = grid(map, 102, 0, 0x5000017);
    const nonExit = grid(map, 103, 0, 0x500000f);
    map.exitGrids = [a, b, c, nonExit]
      .map((o) => exitGridOf(o))
      .filter((e) => e !== undefined) as never;
    const n = setExitGrids(map, 0, 42, 2, 15000);
    expect(n).toBe(2);
    expect(a.extra).toMatchObject({
      destMap: 42,
      destElevation: 2,
      destHex: 15000,
      destRotation: 3,
    });
    expect(c.extra).toMatchObject({ destMap: 42, destElevation: 2, destHex: 15000 });
    expect(b.extra).toMatchObject({ destMap: 1, destHex: 2 });
    expect(nonExit.extra).toMatchObject({ destMap: 1 });
    const g = map.exitGrids.find((e) => e.hex === 100)!;
    expect(g).toMatchObject({ destMap: 42, destHex: 15000, destElevation: 2 });
  });
});
