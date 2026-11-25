/**
 * Headless playthrough (Fala w34b): dalszy ciag spleen (Dr. Wong w sfchina2, Dr. Fung w sfchina, Chip w sftanker),
 * Emperor/Ken Lee i plany vertibirda (Dr. Wong), Xarn (navarro), Martin i Murray (Enclave).
 * Opis: dokumentacja techniczna czesc 16, niewiadome: open-unknowns.md "Fala w34b".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const CHIP = 132; // sftanker
const FUNG = 36; // sfchina
const WONG = 268435461; // sfchina2 (fcdrwong), nie ma go na sfchina
const KEN_LEE = 24; // sfchina2
const XARN = 268435461; // navarro (ccxarn)
const MARTIN = 268435468; // encdet (qcmartin)
const MURRAY = 332; // encrctr (qcmurray)
const PID_CAPS = 41;
const PID_VERTIBIRD_PLANS = 0x1be;
// Znany, udokumentowany blad map_enter ccgrdpa na navarro (maps-coverage.md ext-navarro-guard).
const known = (xs: string[]) => xs.filter((m) => !/guard\d_obj|migate:timed_event_p_proc/.test(m));

describe.skipIf(!GAME_DIR)('playthrough: SF spleen/Emperor, Navarro, Enclave (headless)', () => {
  let p: Playthrough;
  const byId = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
  const start = async (map: string) => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter(map);
  };
  afterEach(async () => {
    await p?.close();
  });

  describe('spleen: Wong, Fung, Chip', () => {
    it('Dr. Wong (sfchina2): SPLEEN=2 + argument o ludzkim organie => SPLEEN=3 (odda w ciagu doby)', async () => {
      await start('sfchina2');
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 2);
      const mark = p.logMark();
      const r = p.talk(byId(WONG), [
        /Who are you/,
        /More questions/,
        /someone else's spleen/,
        /Chip needs it back/,
        /needs it to survive/,
        /Very well/,
      ]);
      expect(r.history.join('\n')).toMatch(/It's a human spleen\?/);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(3);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);

    it('Dr. Wong: argument "Chip byl pijany" ("a deal is a deal") konczy zlecenie porazka: SPLEEN=10', async () => {
      await start('sfchina2');
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 2);
      p.talk(byId(WONG), [
        /Who are you/,
        /More questions/,
        /someone else's spleen/,
        /Chip needs it back/,
        /original owner/,
        /MORE/,
      ]);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(10);
    }, 200_000);

    it('Dr. Fung: operacja za $1000: bez gotowki SPLEEN=4, z gotowka SPLEEN=5 i zabiera kapsle', async () => {
      await start('sfchina');
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 3);
      p.talk(byId(FUNG), [/missing a spleen/, /^Yes/]);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(4);
      await p.close();
      await start('sfchina');
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 3);
      await p.give(PID_CAPS, 1500);
      const before = p.count(PID_CAPS);
      p.talk(byId(FUNG), [/missing a spleen/, /^Yes/]);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(5);
      expect(before - p.count(PID_CAPS)).toBe(1000);
    }, 200_000);

    it('Chip: SPLEEN=3 odsyla do Funga; SPLEEN=5 -> 7, po dobie timer ustawia 8 (zdrowy Chip)', async () => {
      await start('sftanker');
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 3);
      const r = p.talk(byId(CHIP), [/Dr\. Wong Yi Tze has it/]);
      expect(r.history.join('\n')).toMatch(/Talk to Dr\. Fung/);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(3);
      p.setGvar('GVAR_SAN_FRAN_SPLEEN', 5);
      const mark = p.logMark();
      p.talk(byId(CHIP), [/I paid for it|but I paid/]);
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(7);
      for (let i = 0; i < 200 && p.gvar('GVAR_SAN_FRAN_SPLEEN') < 8; i++) {
        p.world.clock.ticks += 20000;
        p.tick(10);
      }
      expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(8);
      const r2 = p.talk(byId(CHIP), [0]);
      expect(r2.history.join('\n')).toMatch(/how much better I feel/);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);
  });

  describe('Emperor: Ken Lee i plany vertibirda', () => {
    it('Ken Lee: "I\'d like to see the Emperor" -> test 1 (plany z Navarro): SHI_WHIRLY=2, VERTI_SHI_QST=1', async () => {
      await start('sfchina2');
      const mark = p.logMark();
      const r = p.talk(byId(KEN_LEE), [
        /Who are you/,
        /see the Emperor/,
        /Oh\. Right/,
        /^Yes/,
        /You got it/,
      ]);
      expect(r.history.join('\n')).toMatch(/Navarro/);
      expect(p.gvar('GVAR_SAN_FRAN_SHI_WHIRLY')).toBe(2);
      expect(p.gvar('GVAR_SAN_FRAN_VERTI_SHI_QST')).toBe(1);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);

    it('Dr. Wong: plany vertibirda -> plany zabrane, VERTI_SHI_QST=2, reputacja +20, XP; Ken Lee daje test 2 (AHS-9)', async () => {
      await start('sfchina2');
      p.setGvar('GVAR_SAN_FRAN_SHI_WHIRLY', 2);
      p.setGvar('GVAR_SAN_FRAN_VERTI_SHI_QST', 1);
      await p.give(PID_VERTIBIRD_PLANS, 1);
      const xp0 = p.xp();
      const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
      const mark = p.logMark();
      p.talk(byId(WONG), [/Ken Lee told me/, 0, 0, 0]);
      expect(p.count(PID_VERTIBIRD_PLANS)).toBe(0);
      expect(p.gvar('GVAR_SAN_FRAN_VERTI_SHI_QST')).toBe(2);
      expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(rep0 + 20);
      expect(p.xp()).toBeGreaterThan(xp0);
      const r = p.talk(byId(KEN_LEE), [/see the Emperor now/, /as good as dead/]);
      expect(r.history.join('\n')).toMatch(/AHS-9/);
      expect(p.gvar('GVAR_SAN_FRAN_KILL_OZ9_QST')).toBe(1);
      expect(p.gvar('GVAR_SAN_FRAN_STRUGGLE')).toBe(1);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);

    it('Ken Lee: przy STRUGGLE=8 (Hubologist-zabojca) pojawia sie opcja "assigned me to kill the Emperor" -> STRUGGLE=4', async () => {
      await start('sfchina2');
      p.setGvar('GVAR_SAN_FRAN_SHI_WHIRLY', 8);
      p.setGvar('GVAR_SAN_FRAN_VERTI_SHI_QST', 2);
      p.setGvar('GVAR_SAN_FRAN_KILL_OZ9_QST', 1);
      p.setGvar('GVAR_SAN_FRAN_STRUGGLE', 8);
      const r = p.talk(byId(KEN_LEE), [
        /I have questions/,
        /assigned me to kill the Emperor/,
        /as good as dead/,
      ]);
      expect(r.history.join('\n')).toMatch(/turn the tables/);
      expect(p.gvar('GVAR_SAN_FRAN_STRUGGLE')).toBe(4);
    }, 200_000);
  });

  describe('Navarro: Xarn', () => {
    it('Xarn: "here to rescue you" -> prosba o klucz do wentylacji, XARN=1; powrot: "found the key?"', async () => {
      await start('navarro');
      const mark = p.logMark();
      const r = p.talk(byId(XARN), [/here to rescue you/, /Look, I really/, /Sure, I.ll do it/]);
      expect(r.history.join('\n')).toMatch(/airshaft/);
      expect(p.gvar('GVAR_NAVARRO_XARN')).toBe(1);
      const r2 = p.talk(byId(XARN), []);
      expect(r2.history.join('\n')).toMatch(/found the key to the door/);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);
  });

  describe('Enclave: Martin i Murray', () => {
    it('Martin (encdet): rozmowa o wirusie F.E.V. ustawia ENCLAVE_MARTIN=1', async () => {
      await start('encdet');
      const mark = p.logMark();
      const r = p.talk(byId(MARTIN), [/What are you people doing here/, 0, 0, 0]);
      expect(r.history.join('\n')).toMatch(/F\.E\.V\./);
      expect(p.gvar('GVAR_ENCLAVE_MARTIN')).toBe(1);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);

    it('Murray (encrctr): grozba -> wylaczenie reaktora, ALARM=1, REACTOR=1, COUNTDOWN zapisany', async () => {
      await start('encrctr');
      const mark = p.logMark();
      const r = p.talk(byId(MURRAY), [/shut down your atomic reactor/, 0, 0, 0, 0, 0]);
      expect(r.history.join('\n')).toMatch(/slide this to green/);
      expect(p.gvar('GVAR_ENCLAVE_REACTOR')).toBe(1);
      expect(p.gvar('GVAR_ENCLAVE_ALARM')).toBe(1);
      expect(p.gvar('GVAR_ENCLAVE_COUNTDOWN')).toBeGreaterThan(0);
      expect(known(p.problems(mark))).toEqual([]);
    }, 200_000);
  });
});
