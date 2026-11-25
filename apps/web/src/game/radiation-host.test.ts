import { describe, expect, it } from 'vitest';
import { EventQueue } from '@f2/engine-core';
import { Stat, radiationLevel } from '@f2/rules';
import { createSheetCritter } from './sheet-critter';
import { defaultSheet } from './save-world';
import { handleRadiationQueueEvent, radiationMidnight, type RadiationEnv } from './radiation-host';

function env(rad: number, ticks = 1000) {
  const sheet = defaultSheet();
  sheet.radiation = rad;
  sheet.baseStats[Stat.Endurance] = 1; // rzut Endurance prawie zawsze nieudany
  const queue = new EventQueue();
  const seen: unknown[] = [];
  const e: RadiationEnv = {
    critter: createSheetCritter(() => sheet),
    queue,
    rng: { seed: 7 },
    ticks,
    playerId: 5,
    onEvent: (r) => void seen.push(r),
  };
  return { e, sheet, queue, seen };
}
const rads = (q: EventQueue) => q.peek((x) => x.kind === 'radiation');

describe('radiation-host: test o polnocy', () => {
  it('bez flagi nic nie kolejkuje', () => {
    const t = env(500);
    radiationMidnight(t.e, false);
    expect(rads(t.queue)).toHaveLength(0);
  });
  it('z flaga i poziomem > 0 kolejkuje zdarzenie typu 6 faza 0 w przyszlosci', () => {
    const t = env(1000);
    expect(radiationLevel(1000)).toBe(5);
    radiationMidnight(t.e, true);
    const evs = rads(t.queue);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.objId).toBe(5);
    expect((evs[0]!.payload as { level: number; phase: number }).phase).toBe(0);
    expect((evs[0]!.payload as { level: number; phase: number }).level).toBeGreaterThanOrEqual(5);
    expect(evs[0]!.atTick).toBeGreaterThan(1000);
  });
  it('nowe zdarzenie tylko gdy poziom > oczekujacy', () => {
    const t = env(1000);
    t.queue.add({ atTick: 50_000, kind: 'radiation', objId: 5, payload: { level: 6, phase: 0 } });
    radiationMidnight(t.e, true);
    expect(rads(t.queue)).toHaveLength(1);
  });
  it('rng sesji jest przesuwany', () => {
    const t = env(1000);
    radiationMidnight(t.e, true);
    expect(t.e.rng.seed).not.toBe(7);
  });
});

describe('radiation-host: zdarzenie typu 6', () => {
  it('faza 0 stosuje kary, kolejkuje faze 1 za 7 dob i zglasza komunikat', () => {
    const t = env(300, 2000);
    const before = t.sheet.statBonuses.slice();
    handleRadiationQueueEvent(t.e, {
      atTick: 2000,
      kind: 'radiation',
      objId: 5,
      payload: { level: 2, phase: 0 },
    });
    expect(t.sheet.statBonuses).not.toEqual(before);
    const evs = rads(t.queue);
    expect(evs).toHaveLength(1);
    expect((evs[0]!.payload as { level: number; phase: number }).phase).toBe(1);
    expect(evs[0]!.atTick).toBeGreaterThan(2000);
    expect(t.seen).toHaveLength(1);
  });
  it('faza 1 cofa kary', () => {
    const t = env(300, 2000);
    const before = t.sheet.statBonuses.slice();
    handleRadiationQueueEvent(t.e, {
      atTick: 1,
      kind: 'radiation',
      objId: 5,
      payload: { level: 2, phase: 0 },
    });
    const mid = rads(t.queue)[0]!;
    t.queue.removeByKind('radiation');
    handleRadiationQueueEvent(t.e, { ...mid, payload: mid.payload });
    expect(t.sheet.statBonuses).toEqual(before);
  });
  it('faza 0 usuwa oczekujace zdarzenia (w tym faze 1 z cofnieciem)', () => {
    const t = env(300, 2000);
    t.queue.add({ atTick: 9000, kind: 'radiation', objId: 5, payload: { level: 1, phase: 0 } });
    handleRadiationQueueEvent(t.e, {
      atTick: 2000,
      kind: 'radiation',
      objId: 5,
      payload: { level: 3, phase: 0 },
    });
    const evs = rads(t.queue);
    expect(evs).toHaveLength(1);
    expect((evs[0]!.payload as { level: number; phase: number }).level).toBe(3);
  });
  it('obce zdarzenie: 0 i brak zmian', () => {
    const t = env(300);
    expect(
      handleRadiationQueueEvent(t.e, { atTick: 1, kind: 'poison', objId: 5, payload: null }),
    ).toBe(0);
    expect(t.seen).toHaveLength(0);
  });
});
