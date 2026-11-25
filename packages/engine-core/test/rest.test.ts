import { describe, expect, it } from 'vitest';
import { EventQueue, GameClock, rest, type RestWorld } from '../src/index.js';

function world(over: Partial<RestWorld> = {}): RestWorld {
  let hp = 10;
  return {
    clock: new GameClock(),
    queue: new EventQueue(),
    enemiesNearby: () => false,
    healingRate: () => 2,
    hp: () => hp,
    maxHp: () => 30,
    heal: (n) => {
      hp = Math.min(30, hp + n);
    },
    handleEvent: () => 0,
    ...over,
  };
}

describe('rest', () => {
  it('h1 advances 36000 ticks', () => {
    const w = world();
    const r = rest(w, 'h1');
    expect(r).toMatchObject({ ok: true, hoursRested: 1 });
    expect(w.clock.ticks).toBe(302400 + 36000);
  });
  it('heals hpHealed = (hours/3 floor) * healingRate (0x494eb8)', () => {
    const w = world();
    const r = rest(w, { hours: 6 });
    expect(r.hpHealed).toBe(2 * 2);
    const w2 = world();
    expect(rest(w2, 'h1').hpHealed).toBe(0);
  });
  it('m10/m30 advance minutes', () => {
    const w = world();
    rest(w, 'm10');
    expect(w.clock.ticks).toBe(302400 + 6000);
    rest(w, 'm30');
    expect(w.clock.ticks).toBe(302400 + 6000 + 18000);
  });
  it('until-morning sets hour to 6:00', () => {
    const w = world();
    const r = rest(w, 'until-morning');
    expect(w.clock.date.hour).toBe(6);
    expect(w.clock.date.minute).toBe(0);
    expect(r.hoursRested).toBeCloseTo(21.6, 5);
  });
  it('until-morning from 03:00 goes to 06:00 same day', () => {
    const w = world({ clock: new GameClock(3 * 36000) });
    rest(w, 'until-morning');
    expect(w.clock.ticks).toBe(6 * 36000);
  });
  it('until-healed rests missing / (rate/3...) hours', () => {
    const w = world(); // brak 20 HP, rate 2 -> 20/2*3 = 30 h
    const r = rest(w, 'until-healed');
    expect(r.ok).toBe(true);
    expect(r.hoursRested).toBe(30);
    expect(w.hp()).toBe(30);
  });
  it('rest refused with enemies nearby', () => {
    const w = world({ enemiesNearby: () => true });
    const t = w.clock.ticks;
    expect(rest(w, 'h1')).toMatchObject({
      ok: false,
      reason: 'enemies-nearby',
      hoursRested: 0,
      hpHealed: 0,
    });
    expect(w.clock.ticks).toBe(t);
  });
  it('drug revert fires from queue after rest; nonzero result interrupts', () => {
    const w = world();
    w.queue.add({ atTick: w.clock.ticks + 100, kind: 'drug-revert', objId: 1, payload: null });
    const fired: string[] = [];
    w.handleEvent = (e) => {
      fired.push(e.kind);
      return 0;
    };
    rest(w, 'h1');
    expect(fired).toEqual(['drug-revert']);
    const w2 = world();
    w2.queue.add({ atTick: w2.clock.ticks + 100, kind: 'knockout', objId: 1, payload: null });
    w2.handleEvent = () => 1;
    const r = rest(w2, 'h1');
    expect(r).toMatchObject({ ok: false, reason: 'interrupted' });
    expect(w2.clock.ticks).toBe(302400 + 101);
  });

  describe('review M5 fixes', () => {
    it('carries the minute counter between calls and heals at >= 180 min', () => {
      const w = world();
      expect(rest(w, { hours: 2 }).hpHealed).toBe(0);
      expect(w.restMinutes).toBe(120);
      expect(rest(w, { hours: 2 }).hpHealed).toBe(2); // 240 min -> 1 heal, reszta 60
      expect(w.restMinutes).toBe(60);
      expect(rest(w, { hours: 2 }).hpHealed).toBe(2); // 180 -> 1 heal, reszta 0
      expect(w.restMinutes).toBe(0);
    });
    it('heals the whole party when healParty is provided', () => {
      const calls: number[] = [];
      let hp = 10;
      const w = world({
        healParty: (n) => {
          calls.push(n);
          hp += 2 * n;
        },
        hp: () => hp,
      });
      const r = rest(w, { hours: 6 });
      expect(calls).toEqual([2]);
      expect(r.hpHealed).toBe(4);
    });
    it('until-healed rests in 24h chunks, max 3 passes', () => {
      let hp = 0;
      const w = world({
        hp: () => hp,
        maxHp: () => 1000,
        healingRate: () => 1,
        heal: (n) => {
          hp += n;
        },
      });
      const r = rest(w, 'until-healed'); // potrzeba 3000 h, ale max 3 x 24 h
      expect(r.hoursRested).toBe(72);
      expect(r.ok).toBe(true);
    });
    it('rejects NaN, negative and infinite hours without moving the clock', () => {
      for (const h of [NaN, -1, Infinity]) {
        const w = world();
        const t = w.clock.ticks;
        expect(rest(w, { hours: h })).toMatchObject({
          ok: false,
          reason: 'invalid-hours',
          hoursRested: 0,
        });
        expect(w.clock.ticks).toBe(t);
      }
    });
    it('never moves the clock backwards when an event sits exactly at the end', () => {
      const w = world();
      const end = w.clock.ticks + 36000;
      w.queue.add({ atTick: end, kind: 'poison', objId: 1, payload: null });
      rest(w, 'h1');
      expect(w.clock.ticks).toBe(end + 1);
    });
  });
});
