import { describe, expect, it } from 'vitest';
import {
  allyFireCheck,
  ALLY_CHECK_EXEMPT_PID,
  ANIM_FIRE_BURST,
  type AllyCandidate,
  type AllyFireInput,
} from '../src/index.js';

const ally = (id: number, o: Partial<AllyCandidate> = {}): AllyCandidate => ({
  id,
  team: 1,
  dead: false,
  dt: () => 0,
  dr: () => 20,
  ...o,
});
// pozycje na linii: id -> heks
const pos: Record<number, number> = { 1: 0, 2: 10, 3: 11, 4: 14, 5: 10 };
const base = (o: Partial<AllyFireInput> = {}): AllyFireInput => ({
  attackerId: 1,
  attackerPid: 0x1000010,
  attackerTeam: 1,
  intelligence: 5,
  targetId: 2,
  radius: 3,
  attackAnim: 0,
  maxDamage: 40,
  damageType: 6,
  critters: [ally(1), ally(2, { team: 0 }), ally(3), ally(4)],
  distance: (a, b) => Math.abs((pos[a] ?? 0) - (pos[b] ?? 0)),
  ...o,
});

describe('allyFireCheck (0x4213e8)', () => {
  it('sojusznik w promieniu wybuchu -> 1', () => {
    expect(allyFireCheck(base()).result).toBe(1);
  });
  it('sojusznik poza promieniem (dist >= radius) -> 0', () => {
    expect(allyFireCheck(base({ critters: [ally(1), ally(2), ally(4)] })).result).toBe(0);
    // dist(2,3)=1 < 1 nieprawda
    expect(allyFireCheck(base({ radius: 1 })).result).toBe(0);
  });
  it('martwy, ten sam cel, atakujacy i wrog sa pomijani', () => {
    expect(allyFireCheck(base({ critters: [ally(3, { dead: true })] })).result).toBe(0);
    expect(allyFireCheck(base({ critters: [ally(2)] })).result).toBe(0);
    expect(allyFireCheck(base({ critters: [ally(3, { team: 0 })] })).result).toBe(0);
  });
  it('whoHitMe == self pomija kryter (Z: sens)', () => {
    expect(allyFireCheck(base({ critters: [ally(3, { whoHitMeId: 3 })] })).result).toBe(0);
  });
  it('(max - DT) * DR / 100 <= 0 -> nie obrywa', () => {
    expect(allyFireCheck(base({ critters: [ally(3, { dr: () => 0 })] })).result).toBe(0);
    expect(allyFireCheck(base({ critters: [ally(3, { dt: () => 40 })] })).result).toBe(0);
    expect(
      allyFireCheck(base({ critters: [ally(3, { dr: () => 2 })], maxDamage: 40 })).result,
    ).toBe(0); // 80/100 = 0
  });
  it('niska Inteligencja zmniejsza promien o (5 - IN)', () => {
    expect(allyFireCheck(base({ intelligence: 2, radius: 3, critters: [ally(3)] })).result).toBe(0);
    expect(allyFireCheck(base({ intelligence: 4, radius: 3, critters: [ally(3)] })).result).toBe(1);
  });
  it('exclude w promieniu -> 1 i komunikat', () => {
    const r = allyFireCheck(base({ critters: [], excludeId: 3 }));
    expect(r).toEqual({ result: 1, steps: 0, friendlyInWay: true });
  });
  it('atakujacy poza promieniem celu -> 0; w promieniu -> 1 lub kroki wyjscia', () => {
    const near = base({ critters: [], radius: 3 });
    const d: Record<number, number> = { ...pos, 1: 11 };
    const dist = (a: number, b: number): number => Math.abs((d[a] ?? 0) - (d[b] ?? 0));
    expect(allyFireCheck({ ...near, distance: dist }).result).toBe(1);
    const w = allyFireCheck({ ...near, distance: dist, wantSteps: true });
    expect(w.result).toBe(0);
    expect(w.steps).toBe(3 - 1 + 1);
    expect(allyFireCheck(near).result).toBe(0);
  });
  it('pid wyjatku zwraca 0', () => {
    expect(allyFireCheck(base({ attackerPid: ALLY_CHECK_EXEMPT_PID })).result).toBe(0);
  });
  it('seria (radius 0, anim 0x2e): sojusznik na torze -> 1; brak anim serii -> 0', () => {
    const s = base({ radius: 0, attackAnim: ANIM_FIRE_BURST, burstVictims: () => [3] });
    expect(allyFireCheck(s).result).toBe(1);
    expect(allyFireCheck({ ...s, attackAnim: 0x30 }).result).toBe(0);
    expect(allyFireCheck({ ...s, burstVictims: () => [3, 4], excludeId: 4 }).friendlyInWay).toBe(
      true,
    );
    expect(allyFireCheck({ ...s, burstVictims: () => [2] }).result).toBe(0);
  });
});
