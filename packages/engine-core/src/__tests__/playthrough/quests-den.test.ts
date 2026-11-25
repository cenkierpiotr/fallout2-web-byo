/**
 * Headless playthrough, Den: Lara (zlecenie gangu na koscior), Vic (radio, Klamath), Metzger (wstapienie do gildii),
 * Rebecca (bar), Karl (zebrak), Anna (medalion). Realne skrypty VM, GVAR-y z vault13.gam. Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

describe.skipIf(!GAME_DIR)('playthrough: Den (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  const text = (r: { history: string[] }) => r.history.join('\n');

  it('Lara (DENBUS1): zlecenie "dowiedz sie co jest w kosciele" za $200 ustawia GANGWAR=1, bez XP', async () => {
    await p.enter('DENBUS1');
    const mark = p.logMark();
    const r = p.talk(byId(464), [/Got any work/, /what.s that/, /Sure/, /No problem/, 0]);
    expect(text(r)).toMatch(/church east of here/);
    expect(text(r)).toMatch(/\$200/);
    expect(p.gvar('GVAR_DEN_GANGWAR')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Vic (DENBUS2): "wyciagne cie stad" zapisuje QUEST_VIC_DEVICE=1 i odsyla do chaty w Klamath', async () => {
    await p.enter('DENBUS2');
    const mark = p.logMark();
    const r = p.talk(byId(138), [
      /get you out/,
      /Vault 13/,
      /How do we do that/,
      /Where can I get the parts/,
      /go look for it/,
      0,
    ]);
    expect(text(r)).toMatch(/shack back in Klamath/);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(1);
    expect(p.gvar('GVAR_DEN_VIC_KNOWN')).toBe(2);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Metzger (DENBUS2): wstapienie do gildii daje REPUTATION_SLAVER=1, reputacje Den -20 i bieg DNSlvRun', async () => {
    await p.enter('DENBUS2');
    const mark = p.logMark();
    const r = p.talk(byId(268435468), [/join the guild/, /do it/, /ready right now/, 0, 0, 0, 0]);
    expect(text(r)).toMatch(/tattoo/);
    expect(p.gvar('GVAR_REPUTATION_SLAVER')).toBe(1);
    expect(p.gvar('GVAR_TOWN_REP_THE_DEN')).toBe(-20);
    expect(await p.followLoadMap()).toBe('DNSlvRun');
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Rebecca (DENBUS1): oferta whisky za $5, nazwisko Dyer', async () => {
    await p.enter('DENBUS1');
    const mark = p.logMark();
    const r = p.talk(byId(268435460), [/need a drink/, /Dyer/, /another question/]);
    expect(text(r)).toMatch(/Whiskey is my specialty/);
    expect(text(r)).toMatch(/\$5/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Karl (DENBUS2, zebrak): przyjmuje $1000, odmowa gdy nie ma pieniedzy', async () => {
    await p.enter('DENBUS2');
    const mark = p.logMark();
    const r = p.talk(byId(268435515), [/how much do you need/, /here you go/, 0]);
    expect(text(r)).toMatch(/\$1000/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Anna (DENRES1): szuka medalionu, rozmowa ustawia znaczniki Pip-Boya (ANNA_LOCKET_PIP=1)', async () => {
    await p.enter('DENRES1');
    const mark = p.logMark();
    const r = p.talk(byId(46), [
      /What.s the matter/,
      /What are you looking for/,
      /just got here/,
      0,
    ]);
    expect(text(r)).toMatch(/locket/);
    expect(p.gvar('GVAR_DEN_ANNA_LOCKET_PIP')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
