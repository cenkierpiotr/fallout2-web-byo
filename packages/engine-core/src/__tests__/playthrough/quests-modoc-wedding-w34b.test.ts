/**
 * Headless playthrough, Modoc: slub z Miria / Davinem i dolaczenie do druzyny (Fala w34b).
 * Mechanizm (bytecod mcmiria, mcdavin, mcjo, uruchomienie): maszyna stanow w GVAR_MODOC_STAGE_STATE
 * (setki = blok, dwie ostatnie cyfry = krok). Dobra sciezka dialogu Node025/Node995 ustawia blok 200
 * (Miria, gracz plci M) lub 300 (Davin, gracz plci K); NPC-e (Miria/Davin, Jo, ojciec) przesuwaja krok
 * timerem (critter_p_proc) do 27, a wtedy NPC robi party_add i GVAR_PLAYER_MARRIED = 1 (Miria) / 2 (Davin),
 * stan wraca do 0. Opis: dokumentacja techniczna czesc 16, niewiadome: open-unknowns.md "Fala w34b".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const MIRIA = 268435478;
const DAVIN = 268435477;
const MIRIA_PID = 0x10000a4;
const DAVIN_PID = 0x10000a3;
const noTimed = (xs: string[]) => xs.filter((m) => !/migate:timed_event_p_proc/.test(m));

describe.skipIf(!GAME_DIR)('playthrough: Modoc, slub i druzyna Miria/Davin (headless)', () => {
  let p: Playthrough;
  const party = (pid: number): number =>
    (p.rt as unknown as { partyMemberObj(pid: number): number }).partyMemberObj(pid);
  const find = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
  const start = async (gender: number) => {
    p = await boot();
    await p.enter('modmain');
    for (const k of [0, 1, 2, 3, 4, 5, 6]) p.setStat(k, 8);
    p.setStat(34, gender);
  };
  /** Tyka zegar do konca maszyny stanow; zwraca przebyte stany (bez powtorzen). */
  const run = (limit = 400) => {
    const seen: number[] = [p.gvar('GVAR_MODOC_STAGE_STATE')];
    for (let i = 0; i < limit; i++) {
      p.tick(10);
      const s = p.gvar('GVAR_MODOC_STAGE_STATE');
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (s === 0) break;
    }
    return seen;
  };
  afterEach(async () => {
    await p?.close();
  });

  it('Miria, sciezka romantyczna: blok 200, krok 27 = party_add, MARRIED=1, stan wraca do 0', async () => {
    await start(0);
    const mark = p.logMark();
    p.talk(find(MIRIA), [
      /What do you do/,
      /more about you/,
      /interesting/,
      /too far/,
      /Your world will never/,
    ]);
    expect(p.gvar('GVAR_MODOC_STAGE_STATE')).toBe(201);
    expect(party(MIRIA_PID)).toBe(-1);
    const seen = run();
    expect(seen[0]).toBe(201);
    expect(seen).toContain(227);
    expect(seen.every((s) => s === 0 || (s >= 200 && s < 300))).toBe(true);
    expect(seen[seen.length - 1]).toBe(0);
    expect(party(MIRIA_PID)).toBe(MIRIA);
    expect(party(DAVIN_PID)).toBe(-1);
    expect(p.gvar('GVAR_PLAYER_MARRIED')).toBe(1);
    expect(p.gvar('GVAR_PARTY_NO_FOLLOW')).toBe(0);
    expect(noTimed(p.problems(mark))).toEqual([]);
  }, 200_000);

  it('Davin, gracz plci K: blok 300, MARRIED=2, Davin w druzynie, Miria nie', async () => {
    await start(1);
    const mark = p.logMark();
    const sched = (
      p.rt as unknown as {
        scheduler: { get(id: number): { script?: { name?: string } } | undefined };
      }
    ).scheduler;
    expect(sched.get(find(DAVIN).scriptId)?.script?.name).toBe('mcdavin');
    p.talk(find(DAVIN), [
      /What do you do/,
      /a few more/,
      /more comfortable/,
      /Let us not break/,
      /CONTINUE/,
      /CONTINUE/,
    ]);
    expect(p.gvar('GVAR_MODOC_STAGE_STATE')).toBe(301);
    const seen = run();
    expect(seen).toContain(327);
    expect(seen.every((s) => s === 0 || (s >= 300 && s < 400))).toBe(true);
    expect(party(DAVIN_PID)).toBe(DAVIN);
    expect(party(MIRIA_PID)).toBe(-1);
    expect(p.gvar('GVAR_PLAYER_MARRIED')).toBe(2);
    expect(noTimed(p.problems(mark))).toEqual([]);
  }, 200_000);

  it('Miria, sciezka "let\'s get it on": blok 100 (101..104) i stan 0, bez slubu i bez druzyny', async () => {
    await start(0);
    p.talk(find(MIRIA), [/What do you do/, /get it on/, /know what/]);
    expect(p.gvar('GVAR_MODOC_STAGE_STATE')).toBe(101);
    const seen = run();
    expect(seen).toEqual([101, 102, 103, 104, 0]);
    expect(party(MIRIA_PID)).toBe(-1);
    expect(p.gvar('GVAR_PLAYER_MARRIED')).toBe(0);
  }, 200_000);

  it('sam stan 201 bez dialogu nie rusza (krok 1 w bloku 200 nie ma wlasciciela)', async () => {
    await start(0);
    p.setGvar('GVAR_MODOC_STAGE_STATE', 201);
    p.tick(300);
    expect(p.gvar('GVAR_MODOC_STAGE_STATE')).toBe(201);
    expect(party(MIRIA_PID)).toBe(-1);
  }, 200_000);
});
