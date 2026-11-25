import { describe, expect, it } from 'vitest';
import { EventQueue, GameClock, handleMidnight, scheduleMidnight } from '@f2/engine-core';
import { buildMidnightHooks, type MidnightHost } from './midnight-host';
import { makeMidnightHost } from './midnight-web-host';

const DAY = GameClock.TICKS_PER_DAY;

function setup(opts: { host?: MidnightHost; gvars?: Record<number, number> } = {}) {
  const vars: Record<number, number> = { ...opts.gvars };
  const flags = new Uint8Array(17);
  let resets = 0;
  const hooks = buildMidnightHooks({
    host: opts.host,
    gvars: { get: (i) => vars[i] ?? 0, set: (i, v) => void (vars[i] = v) },
    movieFlags: flags,
    dailyReset: () => void resets++,
  });
  const clock = new GameClock(0);
  const queue = new EventQueue();
  scheduleMidnight(queue, clock);
  const fire = (days: number): void => {
    clock.advance(days * DAY - clock.ticks);
    handleMidnight(
      { atTick: clock.ticks, kind: 'midnight', objId: 0, payload: null },
      queue,
      clock,
      hooks,
    );
  };
  return { vars, flags, fire, resets: () => resets };
}

describe('buildMidnightHooks', () => {
  it('bez hosta: slajd 0xc po 90 dniach oznaczony jako obejrzany, bez bledu (no-op)', () => {
    const s = setup();
    s.fire(90);
    expect(s.flags[0xc]).toBe(1);
    expect(s.resets()).toBe(1);
  });

  it('progi 90/180/270 wywoluja slajdy 0xc/0xd/0xe raz; 270 odejmuje 15 od GVAR 47', () => {
    const shown: number[] = [];
    const s = setup({ host: { showSlide: (m) => shown.push(m) }, gvars: { 47: 100 } });
    s.fire(90);
    s.fire(91);
    s.fire(180);
    s.fire(270);
    s.fire(271);
    expect(shown).toEqual([0xc, 0xd, 0xe]);
    expect(s.vars[47]).toBe(85);
  });

  it('GVAR 494 >= 3 blokuje slajdy 90-270, ale nie dzien 360', () => {
    const shown: number[] = [];
    const ended: number[] = [];
    const s = setup({
      host: { showSlide: (m) => shown.push(m), endGame: (m) => ended.push(m) },
      gvars: { 494: 3 },
    });
    s.fire(200);
    expect(shown).toEqual([]);
    s.fire(360);
    expect(ended).toEqual([0xf]);
  });

  it('GVAR 7 != 0: zakonczenie msg 4, potem kolejne polnoce nie powtarzaja (gameEnded)', () => {
    const ended: number[] = [];
    const s = setup({ host: { endGame: (m) => ended.push(m) }, gvars: { 7: 1 } });
    s.fire(1);
    s.fire(2);
    expect(ended).toEqual([4]);
  });

  it('flaga ended z zewnatrz (stan sesji): ustawiana przy zakonczeniu i respektowana przy nastepnym hooku', () => {
    let flag = false;
    const ended: number[] = [];
    const mk = () =>
      buildMidnightHooks({
        host: { endGame: (m) => ended.push(m) },
        gvars: { get: (i) => (i === 7 ? 1 : 0), set: () => undefined },
        movieFlags: new Uint8Array(17),
        ended: { get: () => flag, set: (v) => void (flag = v) },
        dailyReset: () => undefined,
      });
    expect(mk().gameEnded?.()).toBe(false);
    flag = true; // jak po wczytaniu zapisu z gameEnded
    expect(mk().gameEnded?.()).toBe(true);
  });

  it('moviePlaying: polnoc nic nie robi (bez resetu, progow)', () => {
    const shown: number[] = [];
    const s = setup({ host: { moviePlaying: () => true, showSlide: (m) => shown.push(m) } });
    s.fire(90);
    expect(s.resets()).toBe(0);
    expect(shown).toEqual([]);
  });

  it('gameEnded z hosta: dzienny reset dziala, progi pominiete', () => {
    const shown: number[] = [];
    const s = setup({ host: { gameEnded: () => true, showSlide: (m) => shown.push(m) } });
    s.fire(90);
    expect(s.resets()).toBe(1);
    expect(shown).toEqual([]);
  });

  it('bez gvars/movieFlags progi sa wylaczone, reset dziala', () => {
    let r = 0;
    const hooks = buildMidnightHooks({ dailyReset: () => void r++ });
    expect(hooks.dayThresholds).toBeUndefined();
    expect(hooks.moviePlaying?.()).toBe(false);
  });
});

describe('makeMidnightHost', () => {
  it('slajd gra artimerN, zakonczenie gra film i przechodzi na ending', async () => {
    const played: string[] = [];
    let ended = 0;
    const flow = { screen: { value: 'playing' as const }, endGame: () => (ended++, true) };
    const h = makeMidnightHost(
      flow,
      (f) => (played.push(f), Promise.resolve('played')),
      () => true,
    );
    expect(h.moviePlaying?.()).toBe(true);
    expect(h.gameEnded?.()).toBe(false);
    h.showSlide?.(0xd);
    h.endGame?.(0xf);
    await Promise.resolve();
    await Promise.resolve();
    expect(played).toEqual(['artimer2.mve', 'artimer4.mve']);
    expect(ended).toBe(1);
  });

  it('gameEnded gdy ekran != playing', () => {
    const flow = { screen: { value: 'ending' as const }, endGame: () => true };
    expect(
      makeMidnightHost(
        flow,
        () => Promise.resolve('x'),
        () => false,
      ).gameEnded?.(),
    ).toBe(true);
  });

  it('radiation: test na polnoc dostaje flage sprzed testu i zawsze ja zeruje (0x42d4f4)', () => {
    let flag = true;
    const seen: boolean[] = [];
    const hooks = buildMidnightHooks({
      dailyReset: () => {},
      radiation: {
        flag: { get: () => flag, set: (v) => void (flag = v) },
        check: (w) => void seen.push(w),
      },
    });
    hooks.radiation?.();
    hooks.radiation?.();
    expect(seen).toEqual([true, false]);
    expect(flag).toBe(false);
  });
});
