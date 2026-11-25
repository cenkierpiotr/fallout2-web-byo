/**
 * Headless playthrough, Modoc, uzupelnienie (Fala w33b): mcslag (floatery gstfarm, flaga 0x800),
 * sciezka "problem" Balthasa, powtorna rozmowa po nagrodzie, zwrot zegarka Farrela.
 * Opis: dokumentacja techniczna czesc 14, niewiadome: open-unknowns.md "Fala w33b".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const BALTHAS = 526;
const FARREL = 268435472;
const noTimed = (xs: string[]) => xs.filter((m) => !/migate:timed_event_p_proc/.test(m));

describe.skipIf(!GAME_DIR)('playthrough: Modoc, uzupelnienie w33b (headless)', () => {
  let p: Playthrough;
  const find = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
  const text = () => p.view.dialog.value?.npcText ?? '';
  afterEach(async () => {
    await p?.close();
  });

  describe('mcslag (gstfarm)', () => {
    const slags = () => {
      const sched = (
        p.rt as unknown as {
          scheduler: { get(id: number): { script?: { name?: string } } | undefined };
        }
      ).scheduler;
      return p.world.map.objects.filter((o) => sched.get(o.scriptId)?.script?.name === 'mcslag');
    };
    const collect = (seeds: Record<string, number>) => {
      for (const [k, v] of Object.entries(seeds)) p.setGvar(k, v);
      const seen = new Set<string>();
      const xs = slags();
      for (let i = 0; i < 30; i++) {
        p.view.floatingTexts.value = [];
        p.talk(xs[i % xs.length]!, []);
        for (const f of p.view.floatingTexts.value) seen.add(f.text);
        p.tick(3);
      }
      return [...seen].filter((t) => !/GRUNT/.test(t));
    };

    it('GHOST_FARM_SEED=0: okrzyki ucieczki i flaga GENERIC_FLAG_1 bit 0x800', async () => {
      p = await boot();
      await p.enter('gstfarm');
      expect(slags().length).toBeGreaterThan(0);
      const mark = p.logMark();
      const seen = collect({ GVAR_MODOC_GHOST_FARM_SEED: 0, GVAR_MODOC_VERMIN_HUNTER_SEED: 0 });
      expect(seen.some((t) => /Run!|Help!|Leave us in peace|get along/.test(t))).toBe(true);
      expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x800).toBe(0x800);
      expect(noTimed(p.problems(mark))).toEqual([]);
    }, 200_000);

    it('GHOST_FARM_SEED=1: kwestie ataku, flaga 0x800 niezapalona', async () => {
      p = await boot();
      await p.enter('gstfarm');
      const seen = collect({ GVAR_MODOC_GHOST_FARM_SEED: 1, GVAR_MODOC_VERMIN_HUNTER_SEED: 0 });
      expect(seen.some((t) => /Go back where you came from|not wanted|escape/.test(t))).toBe(true);
      expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x800).toBe(0);
    }, 200_000);

    it('VERMIN_HUNTER_SEED>=7: podziekowania, flaga 0x800 niezapalona', async () => {
      p = await boot();
      await p.enter('gstfarm');
      const seen = collect({ GVAR_MODOC_GHOST_FARM_SEED: 0, GVAR_MODOC_VERMIN_HUNTER_SEED: 7 });
      expect(seen.some((t) => /trust you|Thank you for helping|Nice to see you/.test(t))).toBe(
        true,
      );
      expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x800).toBe(0);
    }, 200_000);
  });

  describe('Balthas (modmain), sciezka "problem"', () => {
    const start = async (stats: Record<number, number>) => {
      p = await boot();
      await p.enter('modmain');
      for (const [k, v] of Object.entries(stats)) p.setStat(Number(k), v);
    };

    it('PE>=6, INT>=6, JONNY_PIP=0: "problem" -> "keep a lookout" ustawia JONNY_PIP=1 bez XP', async () => {
      await start({ 1: 8, 4: 8 });
      const mark = p.logMark();
      const xp0 = p.xp();
      p.talk(find(BALTHAS), [0, 0, 0]);
      expect(p.gvar('GVAR_MODOC_JONNY_PIP')).toBe(1);
      expect(p.xp() - xp0).toBe(0);
      expect(noTimed(p.problems(mark))).toEqual([]);
    }, 120_000);

    it('PE<6: opcja "preoccupied" ukryta', async () => {
      await start({ 1: 5, 4: 8 });
      p.placeNear(find(BALTHAS));
      expect(p.cmd.talkTo(BALTHAS).ok).toBe(true);
      expect(
        p.view.dialog.value!.options.some((o) => o.visible && /preoccupied/.test(o.text)),
      ).toBe(false);
      p.cmd.dialog.close();
    }, 120_000);

    it('INT<6: opcja "my name is" ukryta w drugim wezle', async () => {
      await start({ 1: 8, 4: 5 });
      p.talk(find(BALTHAS), [0]);
      const visible = p.view.dialog.value?.options.filter((o) => o.visible) ?? [];
      expect(visible.some((o) => /my name is/.test(o.text))).toBe(false);
      p.cmd.dialog.close();
    }, 120_000);

    it('powtorna rozmowa po nagrodzie: "Thank you for saving my son", bez drugiej nagrody', async () => {
      await start({ 1: 8 });
      p.setGvar('GVAR_LADDIE_TILE', 2);
      p.setGvar('GVAR_MODOC_JONNY_PIP', 1);
      const xp0 = p.xp();
      p.talk(find(BALTHAS), [0]);
      expect(p.xp() - xp0).toBe(2500);
      const xp1 = p.xp();
      p.placeNear(find(BALTHAS));
      expect(p.cmd.talkTo(BALTHAS).ok).toBe(true);
      expect(text()).toMatch(/Thank you for saving my son/);
      expect(p.view.dialog.value!.options.filter((o) => o.visible)).toHaveLength(2);
      p.cmd.dialog.close();
      expect(p.xp()).toBe(xp1);
    }, 120_000);
  });

  describe('Farrel (modinn), zwrot zegarka', () => {
    it('zegarek (0x101) + FAMILY_FEUD_SEED_ONE=4: opcja zwrotu daje 1500 XP', async () => {
      p = await boot();
      await p.enter('modinn');
      p.setStat(1, 8);
      p.vars.set(105, 1);
      p.vars.set(106, 4);
      await p.give(0x101);
      const mark = p.logMark();
      const xp0 = p.xp();
      p.talk(find(FARREL), [/watch you were looking for/]);
      expect(p.xp() - xp0).toBe(1500);
      expect(noTimed(p.problems(mark))).toEqual([]);
    }, 120_000);

    it('bez zegarka opcji zwrotu nie ma', async () => {
      p = await boot();
      await p.enter('modinn');
      p.vars.set(105, 1);
      p.vars.set(106, 4);
      p.placeNear(find(FARREL));
      expect(p.cmd.talkTo(FARREL).ok).toBe(true);
      expect(
        p.view.dialog.value!.options.some(
          (o) => o.visible && /watch you were looking/.test(o.text),
        ),
      ).toBe(false);
      p.cmd.dialog.close();
    }, 120_000);
  });
});
