import { describe, expect, it } from 'vitest';
import { GameClock, formatGameDate } from '../src/index.js';

describe('GameClock', () => {
  it('date at START_TICKS equals spec start (25.07.2241 08:24)', () => {
    const c = new GameClock();
    expect(c.ticks).toBe(302400);
    expect(c.date).toEqual({ year: 2241, month: 7, day: 25, hour: 8, minute: 24, second: 0 });
    expect(c.hour).toBe(8);
  });
  it('advance 1 hour increments hour (36000 ticks)', () => {
    const c = new GameClock();
    c.advance(36000);
    expect(c.date.hour).toBe(9);
    expect(c.date.minute).toBe(24);
  });
  it('seconds: 10 ticks = 1 s', () => {
    const c = new GameClock(0);
    c.advance(25);
    expect(c.date.second).toBe(2);
  });
  it('month rollover (31.07 -> 01.08, 31.12 -> 01.01, bez lat przestepnych)', () => {
    const c = new GameClock();
    c.advance(6 * 864000);
    expect(c.date).toMatchObject({ year: 2241, month: 7, day: 31 });
    c.advance(864000);
    expect(c.date).toMatchObject({ year: 2241, month: 8, day: 1 });
    const d = new GameClock(); // 25.07 -> dzien roku
    d.advance((365 - 205) * 864000); // do 1.01.2242 (25.07 to dzien 205 od 1.01, 0-based 205)
    expect(d.date).toMatchObject({ year: 2242, month: 1, day: 1 });
  });
  it('24 dni offsetu: ticks 0 to 1.07.2241 + 24 dni wg wzoru d = ticks/864000 + 24', () => {
    expect(new GameClock(0).date).toMatchObject({ year: 2241, month: 7, day: 25, hour: 0 });
  });
  it('rejects negative/NaN advance', () => {
    expect(() => new GameClock().advance(-1)).toThrow();
  });
  it('formatGameDate pl/en', () => {
    const c = new GameClock();
    expect(formatGameDate(c, 'en')).toBe('25 Jul 2241 08:24');
    expect(formatGameDate(c, 'pl')).toBe('25 lip 2241 08:24');
  });
  it('rejects negative or non-finite initial ticks', () => {
    expect(() => new GameClock(-1)).toThrow(RangeError);
    expect(() => new GameClock(NaN)).toThrow(RangeError);
    expect(new GameClock(0).ticks).toBe(0);
  });
});

describe('limit 13 lat (0x4a34ca)', () => {
  it('dzielenie calkowite ticks / 315360000 >= 13', () => {
    expect(GameClock.TICKS_PER_YEAR).toBe(315360000);
    expect(new GameClock(13 * 315360000 - 1).yearLimitReached).toBe(false);
    expect(new GameClock(13 * 315360000).yearLimitReached).toBe(true);
    expect(new GameClock().yearLimitReached).toBe(false);
  });
});

describe('GameClock.onYearLimit (zdarzeniowy limit 13 lat, 0x4a34cc)', () => {
  it('listener wola sie przy advance i zapisie ticks dopiero po osiagnieciu limitu; wypisanie dziala', () => {
    const clock = new GameClock(GameClock.TICKS_PER_YEAR * 13 - 10);
    let n = 0;
    const off = clock.onYearLimit(() => void n++);
    clock.advance(5);
    expect(n).toBe(0);
    clock.advance(5);
    expect(n).toBe(1);
    clock.ticks = 0; // np. wczytanie zapisu
    expect(n).toBe(1);
    clock.ticks = GameClock.TICKS_PER_YEAR * 14; // np. odpoczynek
    expect(n).toBe(2);
    off();
    clock.advance(1);
    expect(n).toBe(2);
  });
});
