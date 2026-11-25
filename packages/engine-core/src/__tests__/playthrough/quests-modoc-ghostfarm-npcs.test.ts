/**
 * Headless playthrough, Modoc: Balthas (mcbaltha, nagroda za Jonny'ego), Farrel (mcfarrel, ogrod),
 * Miria (mcmiria) i Davin (mcdavin). Zachowania ustalone z bytecodu .int i potwierdzone uruchomieniem.
 * Opis i niepokryte rzeczy: dokumentacja techniczna czesc 13, niewiadome: open-unknowns.md "Fala w32a".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const BALTHAS = 526;
const FARREL = 268435472;
const MIRIA = 268435478;
const noTimed = (xs: string[]) => xs.filter((m) => !/migate:timed_event_p_proc/.test(m));

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Balthas/Farrel/Miria/Davin (headless)', () => {
  let p: Playthrough;
  const start = async (map: string) => {
    p = await boot();
    await p.enter(map);
    p.setStat(1, 8);
  };
  const find = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
  const text = () => p.view.dialog.value?.npcText ?? '';
  const open = (id: number) => {
    p.placeNear(find(id));
    expect(p.cmd.talkTo(id).ok).toBe(true);
  };
  const pickRe = (re: RegExp) => {
    const o = p.view.dialog.value!.options.find((x) => x.visible && re.test(x.text));
    expect(o, `opcja ${re}`).toBeDefined();
    p.cmd.dialog.choose(o!.index);
  };
  afterEach(async () => {
    await p?.close();
  });

  describe('Balthas (modmain)', () => {
    beforeEach(() => start('modmain'), 120_000);

    it('nagroda: LADDIE_TILE=2 i JONNY_PIP=1 daje 2500 XP, Combat Leather Jacket, reputacje Modoc +10', () => {
      p.setGvar('GVAR_LADDIE_TILE', 2);
      p.setGvar('GVAR_MODOC_JONNY_PIP', 1);
      const mark = p.logMark();
      const xp0 = p.xp();
      const rep0 = p.gvar('GVAR_TOWN_REP_MODOC');
      const inv0 = p.player.inventory.map((x) => x.pid);
      p.talk(find(BALTHAS), [0]);
      expect(p.xp() - xp0).toBe(2500);
      expect(p.player.inventory.map((x) => x.pid).filter((x) => !inv0.includes(x))).toContain(
        0x109,
      );
      expect(p.gvar('GVAR_TOWN_REP_MODOC')).toBe(rep0 + 10);
      expect(p.gvar('GVAR_MODOC_JONNY_PIP')).toBe(2);
      expect(noTimed(p.problems(mark))).toEqual([]);
    });

    it('pierwsza rozmowa z JONNY_PIP=1 zaczyna sie od "Any luck finding Jonny?"', () => {
      p.setGvar('GVAR_MODOC_JONNY_PIP', 1);
      open(BALTHAS);
      expect(text()).toMatch(/Any luck finding Jonny/);
      expect(p.view.dialog.value!.options.filter((x) => x.visible)).toHaveLength(1);
      p.cmd.dialog.close();
    });

    it('wiatrowka (0x105) oddana Balthasowi: JONNY_PIP 1->2 bez XP', async () => {
      p.setGvar('GVAR_MODOC_JONNY_PIP', 1);
      await p.give(0x105);
      const xp0 = p.xp();
      p.talk(find(BALTHAS), [/found this/, 0]);
      expect(p.gvar('GVAR_MODOC_JONNY_PIP')).toBe(2);
      expect(p.xp() - xp0).toBe(0);
    });

    it('po uratowaniu Jonny\'ego od Slaga (SLAG_ATTACK=2): JONNY_PIP 1->3 i "Jonny is alive"', () => {
      p.setGvar('GVAR_MODOC_JONNY_PIP', 1);
      p.setGvar('GVAR_SLAG_ATTACK', 2);
      p.talk(find(BALTHAS), [0, 0]);
      expect(p.gvar('GVAR_MODOC_JONNY_PIP')).toBe(3);
    });

    it('JONNY_PIP=4 wraca do standardowego powitania sklepu', () => {
      p.setGvar('GVAR_MODOC_JONNY_PIP', 4);
      open(BALTHAS);
      expect(text()).toMatch(/Balthas/);
      p.cmd.dialog.close();
    });
  });

  describe('Farrel (modinn)', () => {
    beforeEach(() => start('modinn'), 120_000);

    it('"help you, for a price" -> "glad to help anyway": KARL_SEED=4 (idzie do ogrodu)', () => {
      const mark = p.logMark();
      p.talk(find(FARREL), [/What do you do around here/, /help you, for a price/, 0, 0]);
      expect(p.gvar('GVAR_MODOC_KARL_SEED')).toBe(4);
      expect(noTimed(p.problems(mark))).toEqual([]);
    });

    it('pytania ogolne o Modoc nie zmieniaja stanu gry', () => {
      const mark = p.logMark();
      const before = p.gvar('GVAR_MODOC_KARL_SEED');
      p.talk(find(FARREL), [0, 0, 0]);
      expect(p.gvar('GVAR_MODOC_KARL_SEED')).toBe(before);
      expect(noTimed(p.problems(mark))).toEqual([]);
    });
  });

  describe('Miria (modmain)', () => {
    beforeEach(() => start('modmain'), 120_000);

    it('plotki: bez zmian GVAR i bez problemow', () => {
      const mark = p.logMark();
      const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
      open(MIRIA);
      pickRe(/rumors/);
      expect(text().length).toBeGreaterThan(0);
      p.cmd.dialog.close();
      expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(rep0);
      expect(noTimed(p.problems(mark))).toEqual([]);
    });

    it('"let\'s get it on": reputacja -50, KARMA_WANDERER=1, MODOC_STAGE_STATE=101 (Z w2)', () => {
      const mark = p.logMark();
      p.talk(find(MIRIA), [/What do you do/, /get it on/, /know what/]);
      expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(-50);
      expect(p.gvar('GVAR_KARMA_WANDERER')).toBe(1);
      expect(p.gvar('GVAR_MODOC_STAGE_STATE')).toBe(101);
      expect(noTimed(p.problems(mark))).toEqual([]);
    });
  });

  describe('Davin (modmain)', () => {
    beforeEach(() => start('modmain'), 120_000);

    it('pierwszy wezel ma 4 opcje (rzeznia, plotki, ojciec, pozegnanie)', () => {
      const sched = (
        p.rt as unknown as {
          scheduler: { get(id: number): { script?: { name?: string } } | undefined };
        }
      ).scheduler;
      const dav = p.world.map.objects.find(
        (o) => sched.get(o.scriptId)?.script?.name === 'mcdavin',
      );
      expect(dav, 'Davin na MODMAIN').toBeDefined();
      open(dav!.id);
      expect(p.view.dialog.value!.options.filter((x) => x.visible)).toHaveLength(4);
      p.cmd.dialog.close();
    });
  });
});
