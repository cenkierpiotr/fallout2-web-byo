/**
 * Headless playthrough, New Reno (NEWR2): automat do gier McGee'ego (niMcGSlt, use_skill_on_p_proc, Naprawa).
 * Skrypt automatu losuje dwa razy roll_vs_skill; wynik wymuszamy deterministycznym rng i zegarem gry
 * (krytyki dzialaja dopiero po pelnej dobie gry). Lokalna zmienna 3: 1/2 porazka, 3 sukces (+50 XP),
 * 4 krytyczny sukces czyli jackpot (+100 XP). McGee stoi przy automacie (dystans <= 2) i blokuje naprawe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const MCGEE = 268435467;
const SLOT = 268435463;
const REPAIR = 13;

describe.skipIf(!GAME_DIR)('playthrough: New Reno, automat McGee (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('NEWR2');
    p.placeNear(byId(SLOT));
    (p.rt as unknown as { gameTicks: () => number }).gameTicks = () => 900_000;
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  const entry = () => {
    const e = p.rt.scheduler.all().find((x) => x.ownerObjectId === SLOT);
    expect(e, 'brak skryptu automatu').toBeDefined();
    return e!;
  };
  const setRng = (v: number) => {
    (p.rt as unknown as { rng: () => number }).rng = () => v;
  };
  const repair = () => {
    const mark = p.logMark();
    const x0 = p.xp();
    p.rt.scheduler.runProc(entry().sid, 'use_skill_on_p_proc', {
      source: p.player.id,
      target: SLOT,
      actionBeingUsed: REPAIR,
    });
    return {
      xp: p.xp() - x0,
      msg: p.world.view.notifications.value.slice(-1)[0] ?? '',
      state: entry().localVars[3],
      problems: p.problems(mark),
    };
  };
  const reset = () => {
    entry().localVars[3] = 0;
    p.setStat(6, 10);
  };

  it('McGee gra przy automacie: naprawa jest zablokowana', () => {
    reset();
    setRng(0);
    const r = repair();
    expect(r.xp).toBe(0);
    expect(r.state).toBe(0);
    expect(r.msg).toMatch(/old man is playing/);
    expect(r.problems).toEqual([]);
  });

  describe('po odsunieciu McGee od automatu', () => {
    beforeAll(() => {
      byId(MCGEE).hex = 100;
    });

    it('krytyczny sukces: jackpot, +100 XP, stan 4', () => {
      reset();
      setRng(0);
      const r = repair();
      expect(r.state).toBe(4);
      expect(r.xp).toBe(100);
      expect(r.msg).toMatch(/100 experience/);
      expect(r.problems).toEqual([]);
    });

    it('po jackpocie nie da sie dalej nic zrobic', () => {
      setRng(0);
      const r = repair();
      expect(r.xp).toBe(0);
      expect(r.state).toBe(4);
      expect(r.msg).toMatch(/nothing more/);
    });

    it('zwykly sukces (bez krytyka): +50 XP, stan 3', () => {
      reset();
      setRng(0);
      const critBlock = (p.rt as unknown as { gameTicks: () => number }).gameTicks;
      (p.rt as unknown as { gameTicks: () => number }).gameTicks = () => 0;
      const r = repair();
      (p.rt as unknown as { gameTicks: () => number }).gameTicks = critBlock;
      expect(r.state).toBe(3);
      expect(r.xp).toBe(50);
      expect(r.problems).toEqual([]);
    });

    it('porazka: bez XP, stan 2, komunikat o zepsutej maszynie', () => {
      reset();
      setRng(0.999);
      const r = repair();
      expect(r.state).toBe(2);
      expect(r.xp).toBe(0);
      expect(r.msg).toMatch(/only worse/);
      expect(r.problems).toEqual([]);
    });

    it('krytyczna porazka (pierwszy rzut nieudany, drugi krytyczny): stan 1, bez XP, "grinding noise"', () => {
      reset();
      const seq = [0.999, 0];
      let i = 0;
      (p.rt as unknown as { rng: () => number }).rng = () => seq[i++ % seq.length]!;
      const r = repair();
      expect(r.state).toBe(1);
      expect(r.xp).toBe(0);
      expect(r.msg).toMatch(/grinding\W+noise/);
      expect(r.problems).toEqual([]);
    });

    it('zwykly sukces po krytycznym pierwszym rzucie: sekwencja (0, 0.999) daje stan 3 i +50 XP', () => {
      reset();
      const seq = [0, 0.999];
      let i = 0;
      (p.rt as unknown as { rng: () => number }).rng = () => seq[i++ % seq.length]!;
      const r = repair();
      expect(r.state).toBe(3);
      expect(r.xp).toBe(50);
      expect(r.problems).toEqual([]);
    });

    it('McGee po jackpocie (stan 4) nie otwiera dialogu: talk_p_proc daje tylko floater, bez bledow VM', () => {
      reset();
      entry().localVars[3] = 4;
      const mark = p.logMark();
      const m = byId(MCGEE);
      p.placeNear(m);
      p.world.view.floatingTexts.value = [];
      expect(p.cmd.talkTo(m.id)).toMatchObject({ ok: false, reason: 'noDialog' });
      p.rt.runObjectProc('talk_p_proc', m.id, p.player.id);
      expect(p.world.view.floatingTexts.value.map((f) => f.text).join(' ')).toMatch(
        /Touch my machine again/,
      );
      expect(p.problems(mark)).toEqual([]);
    });
  });
});
