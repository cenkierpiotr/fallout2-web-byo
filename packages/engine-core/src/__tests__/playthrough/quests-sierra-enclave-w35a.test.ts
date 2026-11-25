/**
 * Headless playthrough (Fala w35a): Granite, prezydent, Horrigan, Murray (odliczanie reaktora), Xarn po kluczu,
 * AHS-9 i Emperor, GVAR_SAN_FRAN_WONG_EAT_TIME, Sierra Army Depot.
 * Opis: dokumentacja techniczna czesc 17, niewiadome: open-unknowns.md "Fala w35a".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const GRANITE = 26; // encfite (qcgranit)
const PRESIDENT = 314; // encpres (qhprzrch)
const XARN = 268435461; // navarro (ccxarn)
const XARN_DOOR = 56; // navarro (csxdoor)
const PID_XARN_KEY = 97;
const PID_CAPS = 41;
const HORRIGAN = 22; // encfite (qcfrank)
// Znany, udokumentowany blad map_enter ccgrdpa na navarro (maps-coverage.md ext-navarro-guard).
const known = (xs: string[]) => xs.filter((m) => !/guard\d_obj|migate:timed_event_p_proc/.test(m));

describe.skipIf(!GAME_DIR)(
  'playthrough: Enclave, Granite, prezydent, Horrigan, Murray (headless)',
  () => {
    let p: Playthrough;
    const byId = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
    const setRng = (v: number) => {
      (p.rt as unknown as { rng: () => number }).rng = () => v;
    };
    // Skill gracza (Mowa itd.): nadpisuje skillValue VM (rzut deterministyczny razem z setRng).
    const setSkill = (skill: number, v: number) => {
      const rt = p.rt as unknown as { skillValue: (c: number, s: number) => number };
      const orig = rt.skillValue;
      rt.skillValue = (c, s) => (c === p.player.id && s === skill ? v : orig(c, s));
    };
    const start = async (map: string) => {
      p = await boot();
      p.setStat(4, 8);
      await p.enter(map);
    };
    afterEach(async () => {
      await p?.close();
    });

    describe('Granite (encfite)', () => {
      const PITY = [/trying to get back/, 0, 0, 0, 0, /Pity me/];
      it('udany rzut Mowy (-75) na "pity": "Unless you help me" => GRANITE_JOINED=1, +1500 XP, karma +25', async () => {
        await start('encfite');
        setRng(0);
        setSkill(14, 200);
        const x0 = p.xp();
        const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
        const r = p.talk(byId(GRANITE), [...PITY, /Unless you help me/]);
        expect(r.history.join('\n')).toMatch(/my squad and I will do our best/);
        expect(p.gvar('GVAR_ENCLAVE_GRANITE_JOINED')).toBe(1);
        expect(p.xp() - x0).toBe(1500);
        expect(p.gvar('GVAR_PLAYER_REPUTATION') - rep0).toBe(25);
      }, 200_000);

      it('nieudany rzut Mowy (-75) i (-100): Granite nie dolacza (GRANITE_JOINED=0, bez XP)', async () => {
        await start('encfite');
        setRng(0.99);
        setSkill(14, 60);
        const x0 = p.xp();
        const r = p.talk(byId(GRANITE), [...PITY, /emergency/]);
        expect(r.history.join('\n')).toMatch(/one-minute mark with Horrigan/);
        expect(p.gvar('GVAR_ENCLAVE_GRANITE_JOINED')).toBe(0);
        expect(p.xp() - x0).toBe(0);
      }, 200_000);

      it('"Unless you help me" bez rzutu nie jest dostepne: pierwszy rzut Mowy -75 decyduje o gałezi', async () => {
        await start('encfite');
        setRng(0.99);
        setSkill(14, 60);
        const r = p.talk(byId(GRANITE), PITY);
        expect(r.history.join('\n')).toMatch(/Tell me another one/);
        expect(r.history.join('\n')).not.toMatch(/Unless what/);
      }, 200_000);
    });
    describe('Horrigan (encfite)', () => {
      const localHostile = (id: number) =>
        p.rt.scheduler.all().find((x) => x.ownerObjectId === id)!.localVars[5];
      it('rozmowa: "Making our reactor melt-down" i ostatni wybor ustawia stan wrogi (lokalna 5 = 2)', async () => {
        await start('encfite');
        expect(localHostile(HORRIGAN)).not.toBe(2);
        const r = p.talk(byId(HORRIGAN), [/going past you/, /walk the walk/]);
        expect(r.history.join('\n')).toMatch(/reactor melt-down/);
        expect(r.left).toBe(true);
        expect(localHostile(HORRIGAN)).toBe(2);
      }, 200_000);

      it('"Can\'t we talk this over?" => "Time for talking\'s over", walka i tak (lokalna 5 = 2)', async () => {
        await start('encfite');
        const r = p.talk(byId(HORRIGAN), [/talk this over/, /Wait!/]);
        expect(r.history.join('\n')).toMatch(/Time for talking's over/);
        expect(localHostile(HORRIGAN)).toBe(2);
      }, 200_000);
    });
    describe('Prezydent Richardson (encpres)', () => {
      const DEAD_PATH = [
        /Who are you anyway/,
        /President of what/,
        /don't understand/,
        /lunacy/,
        /calling me a mutant/,
        /about to become a dead/,
        /want you dead/,
      ];
      it('wejscie na encpres daje 2500 XP, rozmowa sama XP nie daje; GVAR_ENDGAME_MOVIE_PRES_RICH=1 z talk_p_proc', async () => {
        p = await boot();
        p.setStat(4, 8);
        const x0 = p.xp();
        await p.enter('encpres');
        const xEnter = p.xp() - x0;
        expect(p.gvar('GVAR_ENDGAME_MOVIE_PRES_RICH')).toBe(0);
        const x1 = p.xp();
        const r = p.talk(byId(PRESIDENT), [/Who are you anyway/]);
        expect(r.history.join('\n')).toMatch(/I'm President Richardson/);
        expect(p.gvar('GVAR_ENDGAME_MOVIE_PRES_RICH')).toBe(1);
        expect(xEnter).toBe(2500);
        expect(p.xp() - x1).toBe(0);
      }, 200_000);

      it('"I want you dead" -> "Guards!" -> "Say goodnight": mapa wola straze (zmienna mapy 0 = 1)', async () => {
        await start('encpres');
        expect(
          (p.rt as unknown as { currentMap(): { globalVars: Int32Array } }).currentMap()
            .globalVars[0],
        ).toBe(0);
        const r = p.talk(byId(PRESIDENT), [...DEAD_PATH, /Say goodnight/]);
        expect(r.history.join('\n')).toMatch(/Guards!/);
        expect(r.left).toBe(true);
        expect(
          (p.rt as unknown as { currentMap(): { globalVars: Int32Array } }).currentMap()
            .globalVars[0],
        ).toBe(1);
      }, 200_000);

      it('zabicie prezydenta: destroy_p_proc nie konczy gry ani nie ustawia FRANK_DEAD, bez bledow VM', async () => {
        await start('encpres');
        const mark = p.logMark();
        p.kill(byId(PRESIDENT));
        expect(p.gvar('GVAR_ENCLAVE_FRANK_DEAD')).toBe(0);
        expect(p.rt.endGameRequested).toBeFalsy();
        expect(known(p.problems(mark))).toEqual([]);
      }, 200_000);
    });
    describe('odliczanie reaktora na mapach Enclave (Murray / qireactr)', () => {
      it.each(['encfite', 'encdet', 'encgd', 'enctrp'])(
        '%s: z COUNTDOWN>0 map_update wypisuje ostrzezenie o czasie, po 10 minutach (6000 tickow) konczy gre',
        async (map) => {
          await start(map);
          p.setGvar('GVAR_ENCLAVE_REACTOR', 1);
          p.setGvar('GVAR_ENCLAVE_COUNTDOWN', p.rt.gameTicks());
          const mark = p.logMark();
          const n0 = p.view.notifications.value.length;
          p.world.clock.advance(3000);
          p.rt.scheduler.runMapUpdateAll();
          expect(p.view.notifications.value.length).toBeGreaterThan(n0);
          expect(p.rt.endGameRequested).toBe(false);
          p.world.clock.advance(3100);
          p.rt.scheduler.runMapUpdateAll();
          expect(p.rt.endGameRequested).toBe(true);
          expect(known(p.problems(mark))).toEqual([]);
        },
        200_000,
      );

      it('bez uruchomionego odliczania (COUNTDOWN=0) gra nie konczy sie nawet po bardzo dlugim czasie', async () => {
        await start('encfite');
        p.world.clock.advance(100_000);
        p.rt.scheduler.runMapUpdateAll();
        expect(p.rt.endGameRequested).toBe(false);
      }, 200_000);
    });
    describe('Xarn po kluczu (navarro)', () => {
      const ACCEPT = [/I'm here to rescue you/, /Look, I really am here/, /Sure, I'll do it/];
      it('klucz (pid 97) na drzwiach Xarna: map var 15 = 1, Xarn mowi o wolnosci i daje XP/karme, XARN=2', async () => {
        await start('navarro');
        await p.give(PID_XARN_KEY, 1);
        p.talk(byId(XARN), ACCEPT);
        expect(p.gvar('GVAR_NAVARRO_XARN')).toBe(1);
        const x0 = p.xp();
        const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
        const mark = p.logMark();
        const u = p.useOn(PID_XARN_KEY, byId(XARN_DOOR));
        expect(u.ran).toBe(true);
        expect(
          (p.rt as unknown as { currentMap(): { globalVars: Int32Array } }).currentMap()
            .globalVars[15],
        ).toBe(1);
        p.tick(20);
        p.rt.scheduler.runMapUpdateAll();
        p.tick(20);
        expect(p.rt.scheduler.all().find((x) => x.ownerObjectId === XARN)!.localVars[14]).toBe(1);
        expect(p.xp() - x0).toBe(1500);
        expect(p.gvar('GVAR_NAVARRO_XARN')).toBe(2);
        expect(p.gvar('GVAR_PLAYER_REPUTATION') - rep0).toBe(20);
        expect(known(p.problems(mark))).toEqual([]);
        // nagroda jednorazowa: kolejne cykle skryptu nie dubluja XP
        p.tick(40);
        p.rt.scheduler.runMapUpdateAll();
        expect(p.xp() - x0).toBe(1500);
      }, 200_000);
      it('rozmowa z kluczem w ekwipunku: "I\'ll open the door" -> podziekowanie bez nagrody (nagroda dopiero po uzyciu klucza na drzwiach)', async () => {
        await start('navarro');
        await p.give(PID_XARN_KEY, 1);
        p.talk(byId(XARN), ACCEPT);
        const x0 = p.xp();
        const r = p.talk(byId(XARN), [/I've got it/, /You are welcome/]);
        expect(r.history.join('\n')).toMatch(/I owe you|Thank you. I will not forget this/);
        expect(p.xp() - x0).toBe(0);
        expect(p.gvar('GVAR_NAVARRO_XARN')).toBe(1);
      }, 200_000);

      it('bez klucza opcja "I\'ve got it" jest niedostepna (tylko "still looking"); inny przedmiot na drzwiach nic nie otwiera', async () => {
        await start('navarro');
        p.talk(byId(XARN), ACCEPT);
        const r = p.talk(byId(XARN), [/I've got it/]);
        expect(r.history.join('\n')).toMatch(/brak opcji/);
        await p.give(PID_CAPS, 10);
        const x0 = p.xp();
        p.useOn(PID_CAPS, byId(XARN_DOOR));
        p.tick(20);
        p.rt.scheduler.runMapUpdateAll();
        expect(p.gvar('GVAR_NAVARRO_XARN')).toBe(1);
        expect(p.xp() - x0).toBe(0);
      }, 200_000);
    });

    describe('AHS-9 i Emperor (sfelronb, sfchina2)', () => {
      const AHS9 = 22; // sfelronb (fcoz9)
      const KEN_LEE = 24; // sfchina2 (fckenlee)
      const EMPEROR = 176; // sfchina2 (fsempter)
      const PASS = [/CSPDMSHR/, /Diagnostics/, /Format drive/];
      const killAhs9 = async (oz9: number) => {
        await start('sfelronb');
        p.setGvar('GVAR_SAN_FRAN_KILL_OZ9_QST', oz9);
        p.kill(byId(AHS9));
        p.tick(20);
      };

      it('zabicie AHS-9: STRUGGLE=2, flaga 4; Ken Lee: +5000 XP, STRUGGLE=256, KILL_OZ9_QST=2', async () => {
        await killAhs9(1);
        expect(p.gvar('GVAR_SAN_FRAN_STRUGGLE')).toBe(2);
        expect(p.gvar('GVAR_SAN_FRAN_FLAGS') & 4).toBe(4);
        await p.enter('sfchina2');
        const x0 = p.xp();
        const r = p.talk(byId(KEN_LEE), [/Yes/]);
        expect(r.history.join('\n')).toMatch(/With the death of AHS-9/);
        expect(r.history.join('\n')).toMatch(/CSPDMSHR-Shih-huang-ti-X9372/);
        expect(p.xp() - x0).toBe(5000);
        expect(p.gvar('GVAR_SAN_FRAN_STRUGGLE')).toBe(256);
        expect(p.gvar('GVAR_SAN_FRAN_KILL_OZ9_QST')).toBe(2);
      }, 200_000);

      it('Emperor po nagrodzie: haslo z Ken Lee otwiera terminal; "Format drive" po KILL_OZ9=2 nie cofa nagrody (zostaje 2), ale blokuje terminal (flaga 1024)', async () => {
        await killAhs9(1);
        await p.enter('sfchina2');
        p.talk(byId(KEN_LEE), [/Yes/]);
        const r = p.talk(byId(EMPEROR), []);
        expect(r.history.join('\n')).toMatch(/enter your password/);
        const f = p.talk(byId(EMPEROR), [...PASS, /Yes/, /Yes/]);
        expect(f.history.join(' / ')).toMatch(/formatting complete/);
        expect(p.gvar('GVAR_SAN_FRAN_FLAGS') & 1024).toBe(1024);
        expect(p.gvar('GVAR_SAN_FRAN_KILL_OZ9_QST')).toBe(2);
      }, 200_000);

      it('Emperor bez Ken Lee: haslo Shi niedostepne, KSLJKJ odrzucone (quest bez zmian)', async () => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_KILL_OZ9_QST', 1);
        const pre = p.talk(byId(EMPEROR), [/CSPDMSHR/]);
        expect(pre.history.join(' / ')).toMatch(/brak opcji/);
        const bad = p.talk(byId(EMPEROR), [/KSLJKJ/, /Diagnostics/]);
        expect(bad.history.join(' / ')).toMatch(/system administrator/);
        expect(bad.history.join(' / ')).toMatch(/brak opcji/);
        expect(p.gvar('GVAR_SAN_FRAN_KILL_OZ9_QST')).toBe(1);
      }, 200_000);

      it('bez zabicia AHS-9 Ken Lee nie daje nagrody (brak 5000 XP)', async () => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_KILL_OZ9_QST', 1);
        const x0 = p.xp();
        p.talk(byId(KEN_LEE), [0]);
        expect(p.xp() - x0).toBe(0);
        expect(p.gvar('GVAR_SAN_FRAN_KILL_OZ9_QST')).toBe(1);
      }, 200_000);
    });

    describe('GVAR_SAN_FRAN_WONG_EAT_TIME (Wong, Chip)', () => {
      const WONG = 268435461; // sfchina2 (fcdrwong)
      const DAY = 24 * 60 * 60 * 10; // doba w tickach
      const WONG_ARGS = [
        /Who are you/,
        /More questions/,
        /someone else's spleen/,
        /Chip needs it back/,
      ];
      const gameTime = () => p.rt.gameTicks();

      it('Wong: sukces argumentu (SPLEEN=3) NIE ustawia WONG_EAT_TIME (zostaje 0); ustawia je tylko porazka', async () => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_SPLEEN', 2);
        p.talk(byId(WONG), [...WONG_ARGS, /needs it to survive/, /Very well/]);
        expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(3);
        expect(p.gvar('GVAR_SAN_FRAN_WONG_EAT_TIME')).toBe(0);
      }, 200_000);

      it('smierc Wonga przy SPLEEN=10 przed WONG_EAT_TIME: SPLEEN=3 (sledziona w zwlokach) i flaga 32; po WONG_EAT_TIME: bez zmian', async () => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_SPLEEN', 10);
        p.setGvar('GVAR_SAN_FRAN_WONG_EAT_TIME', gameTime() + DAY);
        p.kill(byId(WONG));
        expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(3);
        expect(p.gvar('GVAR_SAN_FRAN_FLAGS') & 32).toBe(32);
        await p.close();
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_SPLEEN', 10);
        p.setGvar('GVAR_SAN_FRAN_WONG_EAT_TIME', 1);
        p.world.clock.ticks += 100;
        p.kill(byId(WONG));
        expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(10);
      }, 200_000);

      it('Wong: porazka argumentu (SPLEEN=10) tez ustawia WONG_EAT_TIME = teraz + doba', async () => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_SPLEEN', 2);
        const t0 = gameTime();
        p.talk(byId(WONG), [...WONG_ARGS, /original owner/, /MORE/]);
        expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(10);
        const eat = p.gvar('GVAR_SAN_FRAN_WONG_EAT_TIME');
        expect(eat).toBeGreaterThanOrEqual(t0 + DAY);
        expect(eat).toBeLessThan(t0 + DAY + 2000);
      }, 200_000);
    });

    describe('Emperor: Database > Chemistry > Fuel (NodeTanker2120 / NodeElron20)', () => {
      const EMPEROR = 176; // sfchina2 (fsempter)
      // FLAGS: 0x800 haslo od Ken Lee, 0x1000/0x2000/0x4000 bazy bio/chem/fiz, 0x10000 ustawia fcrocman.
      const OPEN = 0x800 | 0x1000 | 0x2000 | 0x4000;
      const FUEL = [/CSPDMSHR/, /Database/, /Chemistry/, /Fuel/];
      const setup = async (flags: number, tanker: number) => {
        await start('sfchina2');
        p.setGvar('GVAR_SAN_FRAN_FLAGS', flags);
        p.setGvar('GVAR_SAN_FRAN_TANKER', tanker);
      };

      it('"Direct fuel to Hubologists" (FLAGS&0x10000): +6000 XP, ELRON_GAS_QST=2, FLAGS|=0x8000; potem menu paliwa zamkniete', async () => {
        await setup(OPEN | 0x10000, 1);
        const x0 = p.xp();
        const r = p.talk(byId(EMPEROR), [...FUEL, /Hubologists/]);
        expect(r.history.join('\n')).toMatch(/Fuel directed accordingly/);
        expect(p.xp() - x0).toBe(6000);
        expect(p.gvar('GVAR_SAN_FRAN_ELRON_GAS_QST')).toBe(2);
        expect(p.gvar('GVAR_SAN_FRAN_FLAGS') & 0x8000).toBe(0x8000);
        const again = p.talk(byId(EMPEROR), [...FUEL]);
        expect(again.history.join('\n')).not.toMatch(/Direct fuel to/);
      }, 200_000);

      it('"Direct fuel to Poseidon tanker" (SAN_FRAN_TANKER&1): +5000 XP, FUEL_TANK_QST=2, TANKER|=8; zamyka tez opcje Hubologists (wzajemnie wykluczajace)', async () => {
        await setup(OPEN | 0x10000, 1);
        const x0 = p.xp();
        p.talk(byId(EMPEROR), [...FUEL, /Poseidon/]);
        expect(p.xp() - x0).toBe(5000);
        expect(p.gvar('GVAR_SAN_FRAN_FUEL_TANK_QST')).toBe(2);
        expect(p.gvar('GVAR_SAN_FRAN_TANKER') & 8).toBe(8);
        const again = p.talk(byId(EMPEROR), [...FUEL]);
        expect(again.history.join('\n')).not.toMatch(/Direct fuel to/);
        expect(p.gvar('GVAR_SAN_FRAN_ELRON_GAS_QST')).toBe(0);
      }, 200_000);

      it('bez FLAGS&0x10000 i bez TANKER&1 menu paliwa nie ma zadnej opcji kierowania (tylko Back)', async () => {
        await setup(OPEN, 0);
        const r = p.talk(byId(EMPEROR), [...FUEL]);
        expect(r.history.join('\n')).not.toMatch(/Direct fuel to/);
      }, 200_000);
    });

    describe('Sierra Army Depot (depolv1, depolva, depolvb)', () => {
      it.each([
        ['depolv1', 20, 'Auto-Cannon'],
        ['depolva', 40, 'Robobrain'],
        ['depolvb', 8, 'Sentry Bot'],
      ])(
        '%s: wejscie bez bledow VM, >= %i krytterow; zabicie kazdego typu (%s itd.) konczy sie bez bledow i z XP',
        async (map, min) => {
          p = await boot();
          p.setStat(4, 8);
          const mark = p.logMark();
          await p.enter(map);
          p.tick(30);
          p.rt.scheduler.runMapUpdateAll();
          const npcs = p.world.map.objects.filter((o) => o.type === 1 && o !== p.player);
          expect(npcs.length).toBeGreaterThanOrEqual(min);
          const seen = new Set<string>();
          let xp = 0;
          for (const o of npcs) {
            const name = p.rt.objName(o.id);
            if (seen.has(name)) continue;
            seen.add(name);
            const k = p.kill(o);
            expect(k.died, name).toBe(true);
            xp += k.xp;
          }
          expect(xp).toBeGreaterThan(0);
          expect(known(p.problems(mark))).toEqual([]);
        },
        200_000,
      );
    });
  },
);
