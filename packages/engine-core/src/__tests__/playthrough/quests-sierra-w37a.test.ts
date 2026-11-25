/**
 * Headless playthrough (Fala w37a): domkniecie Sierra Army Depot (depolva, depolvb, depolv1).
 * Terminale 1A (haslo Tchaikovsky), 3B, 3C, 4B, skanery siatkowki z drzwiami wind, haubica, pulapki
 * (skrzynia z amunicja, drzwi bunkra). Terminala 1C nie ma w danych gry. Opis: dokumentacja techniczna czesc 20,
 * niewiadome: open-unknowns.md "Fala w37a".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const GVAR_ALERT = 151;
const GVAR_SECURITY = 154;
const MVAR_LEVEL1_BREACH = 25;
const MVAR_LEVEL3_BREACH = 27;
const MVAR_BRAIN_ACTIVATED = 75;
const PID_HOWITZER_SHELL = 430;

describe.skipIf(!GAME_DIR)('playthrough: Sierra Army Depot, domkniecie (headless)', () => {
  let p: Playthrough;
  const start = async (map: string, elevation?: number) => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter(map, undefined, elevation);
    p.tick(30);
    (p.rt as unknown as { rng: () => number }).rng = () => 0;
    const rt = p.rt as unknown as { skillValue: (c: number, s: number) => number };
    const orig = rt.skillValue;
    rt.skillValue = (c, s) => (c === p.player.id ? 200 : orig(c, s));
  };
  const obj = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id)!;
    expect(o, `obiekt ${id}`).toBeTruthy();
    return o;
  };
  const notes = () =>
    (p.world.view.notifications as unknown as { value: string[] }).value.splice(0).join('\n');
  const mapVars = () =>
    (p.rt as unknown as { currentMap: () => { globalVars: Int32Array } }).currentMap().globalVars;
  const talkTo = (id: number, steps: (number | RegExp)[]) => {
    const o = obj(id);
    notes();
    const x0 = p.xp();
    const r = p.talk(o, steps);
    return {
      history: r.history.join('\n').replace(/\s+/g, ' '),
      notes: notes(),
      xp: p.xp() - x0,
      left: r.left,
    };
  };
  afterEach(async () => {
    expect(p.problems()).toEqual([]);
    await p?.close();
  });

  describe('terminal 1A: bramka hasla', () => {
    it('bez hasla lista zaczyna sie od zlych hasel, a bledne haslo (Sierra) wlacza alarm bezpieczenstwa', async () => {
      await start('depolva');
      const r = talkTo(268435464, [0, 0]);
      expect(r.history).toMatch(/Skynet Security Check Point 1/);
      expect(r.history).not.toMatch(/Tchaikovsky/);
      expect(r.history).toMatch(/Security Breach Level 1/);
      expect(p.gvar('GVAR_SIERRA_BASE_SECURITY')).toBe(1);
    });

    it('znajac haslo (GVAR_SIERRA_PASSWORD) pierwsza opcja to Tchaikovsky i daje dostep bez alarmu', async () => {
      await start('depolva');
      p.setGvar('GVAR_SIERRA_PASSWORD', 1);
      const r = talkTo(268435464, [0]);
      expect(r.history).toMatch(/PC: Tchaikovsky/);
      expect(r.history).toMatch(/Access Granted\s*Force Fields Level 1: Deactivated/);
      expect(p.gvar('GVAR_SIERRA_BASE_SECURITY')).toBe(0);
    });

    it('znajac haslo, ale podajac inne: nieudana proba nie wlacza alarmu od razu, drugi blad tak', async () => {
      await start('depolva');
      p.setGvar('GVAR_SIERRA_PASSWORD', 1);
      const r = talkTo(268435464, [1, 1]);
      expect(r.history).toMatch(/Invalid Password/);
      expect(r.history).toMatch(/Security Breach Level 1/);
      expect(p.gvar('GVAR_SIERRA_BASE_SECURITY')).toBe(1);
    });
  });

  it('terminal 1C: skryptu wsterm1c nie ma w danych gry (D)', async () => {
    await start('depolva');
    await expect(p.vfs.open('scripts/wsterm1c.int')).rejects.toBeTruthy();
  });

  describe('terminal 3B (Skynet)', () => {
    it('Skynet zleca przyniesienie mozgu i resetuje zabezpieczenia', async () => {
      await start('depolva');
      const r = talkTo(118, [0, 2, 0]);
      expect(r.history).toMatch(/Retrieve Cybernetic Brain/);
      expect(r.history).toMatch(/Security System Level 1 - 4 have now been reset/);
      expect(p.gvar('GVAR_SKYNET')).toBe(1);
    });

    it('sarkazm wobec Skynet zamyka terminal i rozjusza baze (ENEMY + SECURITY)', async () => {
      await start('depolva');
      const r = talkTo(118, [0, 1, 1]);
      expect(r.history).toMatch(/Conclusion: Sarcasm/);
      expect(p.gvar('GVAR_SIERRA_BASE_ENEMY')).toBe(1);
      expect(p.gvar('GVAR_SIERRA_BASE_SECURITY')).toBe(1);
      expect(r.left).toBe(true);
    });

    it('pytania pomocnicze (AI, zabijanie) nie zmieniaja stanu i wracaja do menu', async () => {
      await start('depolva');
      const r = talkTo(118, [2]);
      expect(r.history).toMatch(/self-aware/);
      expect(p.gvar('GVAR_SKYNET')).toBe(0);
      expect(p.gvar('GVAR_SIERRA_BASE_ENEMY')).toBe(0);
    });
  });

  describe('terminal 3C (synteza robota)', () => {
    const ready = async () => {
      await start('depolva', 2);
      const mv = mapVars();
      for (const i of [72, 73, 74]) mv[i] = 1;
    };

    it('kontrola systemow: brak czesci pokazuje braki, komplet pokazuje gotowosc', async () => {
      await start('depolva', 2);
      expect(talkTo(122, [0]).history).toMatch(
        /Replace Motivator[\s\S]*Not Present[\s\S]*Activation not recommended/,
      );
      await p.close();
      await ready();
      expect(talkTo(122, [0]).history).toMatch(
        /Robot Body - OK[\s\S]*Responding[\s\S]*Ready to Activate/,
      );
    });

    it('aktywacja bez kompletu czesci zostawia flage ominiecia zabezpieczen (mapvar 75)', async () => {
      await start('depolva', 2);
      const r = talkTo(122, [1]);
      expect(r.history).toMatch(/Failsafe overridden/);
      expect(mapVars()[MVAR_BRAIN_ACTIVATED]).toBe(1);
    });

    it.each([
      [1, /Synch Ratio - 10%/],
      [2, /Synch Ratio - 50%/],
      [3, /Synch Ratio - 75%/],
      [4, /Program Interrupted[\s\S]*Synch Ratio - 100%/],
    ])('aktywacja kompletu przy GVAR_BRAIN_BOT_BRAIN=%i', async (brain, re) => {
      await ready();
      p.setGvar('GVAR_BRAIN_BOT_BRAIN', brain);
      expect(talkTo(122, [1]).history).toMatch(re);
    });
  });

  describe('terminal 4B (ekstrakcja organow)', () => {
    it('wybor gatunku i organu jest odzwierciedlony w podsumowaniu', async () => {
      await start('depolvb');
      expect(talkTo(142, [0, 4]).history).toMatch(/Species: Human\s*Organ: Brain/);
      await p.close();
      await start('depolvb');
      expect(talkTo(142, [0, 5, 1]).history).toMatch(/Species: Deathclaw/);
    });

    it('ekstrakcja bez dawcy w pokoju: komunikat, 500 XP jednorazowo (lokalna zmienna)', async () => {
      await start('depolvb');
      const a = talkTo(142, [0, 0, 2]);
      expect(a.history).toMatch(/Donor subject is not present/);
      expect(a.xp).toBe(500);
      const b = talkTo(142, [0, 0, 2]);
      expect(b.xp).toBe(0);
    });
  });

  describe('skanery siatkowki i drzwi wind', () => {
    it('poziom 1: skaner wlacza alarm (151, 154) i flage mapy 25, winda zostaje zamknieta', async () => {
      await start('depolva');
      expect(p.gvar('GVAR_SIERRA_BASE_ALERT')).toBe(0);
      p.use(obj(268435456));
      const n = notes();
      expect(n).toMatch(/Unknown retina pattern/);
      expect(n).toMatch(/Security breach on Level 1/);
      expect(p.vars.get(GVAR_ALERT)).toBe(1);
      expect(p.vars.get(GVAR_SECURITY)).toBe(1);
      expect(mapVars()[MVAR_LEVEL1_BREACH]).toBe(1);
      p.use(obj(268435457));
      expect(notes()).toMatch(/opened from somewhere else/);
    });

    it('poziom 3: skaner ustawia flage mapy 27 i alarm poziomu 3', async () => {
      await start('depolva', 2);
      p.use(obj(268435492));
      expect(notes()).toMatch(/Security breach on Level 3/);
      expect(mapVars()[MVAR_LEVEL3_BREACH]).toBe(1);
      p.use(obj(268435493));
      expect(notes()).toMatch(/opened from somewhere else/);
    });

    it('poziom 4 (depolvb): skaner i winda zachowuja sie jak na wyzszych poziomach', async () => {
      await start('depolvb');
      p.use(obj(136));
      expect(notes()).toMatch(/Security breach on Level 4/);
      p.use(obj(146));
      expect(notes()).toMatch(/opened from somewhere else/);
    });

    it('drzwi poziomu 1 i garazu sa zamkniete', async () => {
      await start('depolva');
      p.use(obj(268435466));
      expect(notes()).toMatch(/locked/);
      p.use(obj(268435459));
      expect(notes()).toMatch(/locked/);
    });
  });

  describe('depolv1: haubica, pulapki, drzwi bunkra', () => {
    it('haubica bez pocisku nie strzela', async () => {
      await start('depolv1');
      p.use(obj(24));
      expect(notes()).toMatch(/nothing to fire/);
    });

    it('zaladowanie pocisku zuzywa przedmiot, drugi raz jest juz zaladowana', async () => {
      await start('depolv1');
      await p.give(PID_HOWITZER_SHELL, 1);
      p.useOn(PID_HOWITZER_SHELL, obj(24));
      expect(notes()).toMatch(/You load the shell/);
      expect(p.count(PID_HOWITZER_SHELL)).toBe(0);
      await p.give(PID_HOWITZER_SHELL, 1);
      p.useOn(PID_HOWITZER_SHELL, obj(24));
      expect(notes()).toMatch(/already loaded/);
      expect(p.count(PID_HOWITZER_SHELL)).toBe(1);
    });

    it('strzal wysadza drzwi wejsciowe (wientdor) po timerze i zostawia gruz', async () => {
      await start('depolv1');
      await p.give(PID_HOWITZER_SHELL, 1);
      p.useOn(PID_HOWITZER_SHELL, obj(24));
      notes();
      expect(p.byPid(33555779)).toHaveLength(1);
      p.use(obj(24));
      p.tick(60);
      expect(notes()).toMatch(/blowing it open/);
      expect(p.byPid(33555779)).toHaveLength(0);
      expect(p.byPid(33555780)).toHaveLength(1);
      expect(p.byPid(33555781)).toHaveLength(1);
      p.use(obj(24));
      expect(notes()).toMatch(/nothing to fire/);
    });

    it('drzwi bunkra i skrzynia z amunicja sa zaminowane (wykrycie pulapki)', async () => {
      await start('depolv1');
      p.use(obj(268435457));
      expect(notes()).toMatch(/trap in the door jam/);
      p.use(obj(268435456));
      expect(notes()).toMatch(/trap on the container/);
    });
  });
});
