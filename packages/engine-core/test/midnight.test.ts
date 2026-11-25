import { describe, expect, it } from 'vitest';
import {
  applyDayThresholds,
  EventQueue,
  GameClock,
  handleMidnight,
  midnightDelay,
  pendingRadiationLevel,
  scheduleMidnight,
} from '../src/index.js';

describe('midnight (time.md typ 4)', () => {
  it('delay formula at 08:24', () => {
    const c = new GameClock(); // 08:24
    expect(midnightDelay(c)).toBe(10 * (3600 * 15 + 60 * 35 + 60));
    scheduleMidnight(new EventQueue(), c);
  });
  it('delay from 00:00 is a whole day, from 23:59 is 600 ticks', () => {
    expect(midnightDelay(new GameClock(0))).toBe(864000 - 0 + 0);
    expect(midnightDelay(new GameClock(23 * 36000 + 59 * 600))).toBe(600);
  });
  it('schedules a single midnight event landing exactly at 00:00', () => {
    const q = new EventQueue();
    const c = new GameClock();
    scheduleMidnight(q, c);
    scheduleMidnight(q, c);
    expect(q.size).toBe(1);
    const at = q.nextTime()!;
    expect(new GameClock(at).date).toMatchObject({ hour: 0, minute: 0, second: 0 });
  });
  function io(g: Record<number, number>, seen: Set<number> = new Set()) {
    const shown: number[] = [];
    const ends: number[] = [];
    return {
      shown,
      ends,
      g,
      io: {
        gvar: (i: number) => g[i] ?? 0,
        setGvar: (i: number, v: number) => {
          g[i] = v;
        },
        slideSeen: (m: number) => seen.has(m),
        showSlide: (m: number) => {
          seen.add(m);
          shown.push(m);
        },
        endGame: (m: number) => {
          ends.push(m);
        },
      },
    };
  }
  it('handler: reset, ponowne zaplanowanie, progi dni `>=` z flagami slajdow (0x4a3690)', () => {
    const q = new EventQueue();
    const c = new GameClock(90 * 864000 - 600);
    scheduleMidnight(q, c);
    let resets = 0;
    const t = io({});
    const hooks = { dailyReset: () => void resets++, dayThresholds: t.io };
    c.advance(601);
    q.processUntil(c.ticks, (e) => handleMidnight(e, q, c, hooks));
    expect(resets).toBe(1);
    expect(t.shown).toEqual([0xc]);
    expect(q.size).toBe(1);
    expect(q.nextTime()).toBe(91 * 864000 + 1); // handler biegnie o 1 tick po zdarzeniu (jak w oryginale)
    c.advance(864000);
    q.processUntil(c.ticks, (e) => handleMidnight(e, q, c, hooks));
    expect(resets).toBe(2);
    expect(t.shown).toEqual([0xc]); // slajd tylko raz
  });
  it('progi: 270 -> slajd 0xe i gvar 47 -15; gvar 494 >= 3 blokuje; gvar 7 i dzien 360 koncza gre', () => {
    const a = io({ 47: 100 });
    applyDayThresholds(280, a.io);
    expect(a.shown).toEqual([0xe]);
    expect(a.g[47]).toBe(85);
    const b = io({ 0x1ee: 3 });
    applyDayThresholds(280, b.io);
    expect(b.shown).toEqual([]);
    const c = io({ 7: 1 });
    applyDayThresholds(10, c.io);
    expect(c.ends).toEqual([4]);
    const d = io({ 0x1ee: 3 });
    applyDayThresholds(361, d.io);
    expect(d.ends).toEqual([0xf]);
    const e = io({}, new Set([0xf]));
    applyDayThresholds(361, e.io);
    expect(e.ends).toEqual([]);
    const f = io({});
    applyDayThresholds(89, f.io);
    expect(f.shown).toEqual([]);
  });
  it('bramki: film (0x44eb14) wstrzymuje cala polnoc, koniec gry (0x444d2c) tylko progi', () => {
    const q = new EventQueue();
    const c = new GameClock(0);
    scheduleMidnight(q, c);
    const ev = q.peek(() => true)[0]!;
    const t = io({});
    let resets = 0;
    const base = { dailyReset: () => void resets++, dayThresholds: t.io };
    handleMidnight(ev, q, c, { ...base, moviePlaying: () => true });
    expect(resets).toBe(0);
    c.advance(100 * 864000);
    handleMidnight(ev, q, c, { ...base, gameEnded: () => true });
    expect(resets).toBe(1);
    expect(t.shown).toEqual([]);
  });
  it('ignores other kinds', () => {
    const q = new EventQueue();
    expect(
      handleMidnight({ atTick: 1, kind: 'poison', objId: 1, payload: null }, q, new GameClock(), {
        dailyReset: () => {
          throw new Error('x');
        },
      }),
    ).toBe(0);
  });
});

import { clearDailyObjectBits, DAILY_OBJECT_BIT } from '../src/index.js';
import type { GameObject } from '../src/index.js';

describe('dzienne bity obiektow 0x49d480', () => {
  const mk = (type: number, extra: unknown) => ({ type, extra }) as unknown as GameObject;
  it('typ 2: czysci bit w extra.raw[0] (+0x3f), typ 0: w extra.flags (+0x3b), inne bez zmian', () => {
    const all = 0xffffffff | 0;
    const door = mk(2, { kind: 'door', flags: all, raw: Int32Array.of(all) });
    const plain = mk(2, { kind: 'scenery', flags: all, raw: new Int32Array(0) });
    const it = mk(0, { kind: 'item', flags: 0xffffffff, raw: Int32Array.of(all) });
    const cr = mk(1, { kind: 'critter', flags: 0xffffffff, raw: Int32Array.of(all) });
    const wall = mk(3, { kind: 'misc', flags: 0xffffffff });
    clearDailyObjectBits([door, plain, it, cr, wall]);
    expect((door.extra as { raw: Int32Array }).raw[0]).toBe(~DAILY_OBJECT_BIT);
    expect((door.extra as { flags: number }).flags).toBe(all);
    expect((it.extra as { flags: number }).flags).toBe((0xffffffff & ~DAILY_OBJECT_BIT) >>> 0);
    expect((it.extra as { raw: Int32Array }).raw[0]).toBe(all);
    expect((cr.extra as { flags: number }).flags).toBe(0xffffffff);
    expect((wall.extra as { flags: number }).flags).toBe(0xffffffff);
  });
});

describe('pendingRadiationLevel (callback 0x42d618)', () => {
  it('0 bez zdarzen typu 6, poziom ostatniego w kolejnosci inaczej', () => {
    const q = new EventQueue();
    expect(pendingRadiationLevel(q)).toBe(0);
    q.add({ atTick: 500, kind: 'radiation', objId: 1, payload: { level: 3, phase: 0 } });
    q.add({ atTick: 900, kind: 'radiation', objId: 1, payload: { level: 2, phase: 0 } });
    q.add({ atTick: 100, kind: 'radiation', objId: 1, payload: { level: 4, phase: 1 } });
    q.add({ atTick: 950, kind: 'poison', objId: 1, payload: { level: 9 } });
    // ostatni radiation po czasie (900) ma poziom 2, nie maksimum
    expect(pendingRadiationLevel(q)).toBe(2);
    // callback nie usuwa zdarzen
    expect(q.peek((e) => e.kind === 'radiation')).toHaveLength(3);
  });
});
