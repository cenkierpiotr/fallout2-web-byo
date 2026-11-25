/**
 * Headless playthrough, ciag dalszy: Gecko (reaktor, Skeeter), czyszczenie ARCAVES z walka, drzewa dialogowe
 * Ardina i Torra (Klamath) z walka, nagrody w ekwipunku oraz XP za zabicia. Gracz ma tu realny prototyp
 * (harness: give/count/xp/kill). Wzorzec i opis: quests-early.test.ts, dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, gvarDiff, type Playthrough } from './harness.js';

/** pid przedmiotow (pro_item.msg id / 100). */
const PID_REQUEST_FORM = 0x138;
const PID_PART_TRANSFORMER = 0x133;
const PID_CAPS = 41;

describe.skipIf(!GAME_DIR)(
  'playthrough: Gecko, ARCAVES, Klamath z walka, nagrody (headless)',
  () => {
    let p: Playthrough;
    beforeAll(async () => {
      p = await boot();
    }, 120_000);
    afterAll(async () => {
      await p?.close();
    });
    const snap = (): Int32Array =>
      Int32Array.from({ length: p.vars.size }, (_, i) => p.vars.get(i));
    const byId = (id: number) => {
      const o = p.world.map.objects.find((x) => x.id === id);
      expect(o, `brak obiektu ${id}`).toBeDefined();
      return o!;
    };

    it('gracz ma realne staty (INT 5), a ekwipunek/XP dzialaja: give/count/xp', async () => {
      await p.enter('KLADWTWN');
      expect(p.rt.getCritterStat(p.player.id, 4)).toBe(5);
      expect(p.count(PID_CAPS)).toBe(0);
      await p.give(PID_CAPS, 250);
      expect(p.count(PID_CAPS)).toBe(250);
      p.rt.giveExpPoints(40);
      expect(p.xp()).toBeGreaterThanOrEqual(40);
    }, 120_000);

    it('Gecko: Skeeter (GECK) i Lumpy: dialogi bez bledow VM', async () => {
      await p.enter('GECKJUNK');
      const mark = p.logMark();
      const skeeter = p.npcsByName(/^Skeeter$/)[0]!;
      const r = p.talk(skeeter, [/Garden of Eden/, /Vault City had/, /Well, I better get looking/]);
      expect(r.started).toBe(true);
      expect(r.history.join('\n')).toMatch(/Vault City prolly used ta have/);
      expect(r.history.join('\n')).toMatch(/GECK done started up/);
      for (const re of [/^Lumpy$/])
        expect(p.talk(p.npcsByName(re)[0]!, [0, 0, 0]).started).toBe(true);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);

    it('Gecko: Jeremy wymienia Request Authorization Form na czesc dla Skeetera (nagroda w ekwipunku)', async () => {
      await p.enter('GECKPWPL');
      p.setGvar('GVAR_GECKO_SKEETER_STATUS', 1);
      p.setGvar('GVAR_GECKO_SKEETER_PART', 1);
      const jeremy = byId(54);
      const mark = p.logMark();
      // bez formularza: odsylka do Harolda/Festusa, czesci brak
      const noForm = p.talk(jeremy, [/from storage/i, /./, /./, /./]);
      expect(noForm.history.join('\n')).toMatch(/Request Authorization Form/);
      expect(p.count(PID_PART_TRANSFORMER)).toBe(0);
      // z formularzem: formularz zuzyty, czesc w ekwipunku
      await p.give(PID_REQUEST_FORM);
      const r = p.talk(jeremy, [/from storage/i, /./, /./, /./, /./, /./]);
      expect(r.history.join('\n')).toMatch(/3-step plasma-transformer/);
      expect(p.count(PID_REQUEST_FORM)).toBe(0);
      expect(p.count(PID_PART_TRANSFORMER)).toBe(1);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);

    it('Gecko: inna czesc (PART=2) nie jest dostepna, formularz zostaje', async () => {
      await p.enter('GECKPWPL');
      p.setGvar('GVAR_GECKO_SKEETER_STATUS', 1);
      p.setGvar('GVAR_GECKO_SKEETER_PART', 2);
      const before = p.count(PID_REQUEST_FORM);
      await p.give(PID_REQUEST_FORM);
      const r = p.talk(byId(54), [/from storage/i, /./, /./, /./, /./, /./]);
      expect(r.history.join('\n')).toMatch(/gredunza/);
      expect(p.count(PID_REQUEST_FORM)).toBe(before + 1);
    }, 120_000);

    it('Gecko: Festus (uran/woda), Hank (robot konserwacyjny), Harold, Lenny, Wooz, Zomak, Brain bez bledow VM', async () => {
      const mark = p.logMark();
      await p.enter('GECKPWPL');
      const festus = p.talk(byId(268435466), [/reactor isn.t running/, /./, /./]);
      expect(festus.history.join('\n')).toMatch(/groundwater|Vault City/);
      const hank = p.talk(byId(474), [/inside the Core/, /Maintenance bot/, /./]);
      expect(hank.history.join('\n')).toMatch(/maintenance tasks by remote control/);
      await p.enter('GECKSETL');
      const b = snap();
      expect(p.talk(byId(58), [0]).started).toBe(true); // Harold
      expect(gvarDiff(p, b).join('|')).toMatch(/GVAR_ENDGAME_MOVIE_HAROLD/);
      for (const re of [/^Lenny$/, /^Wooz$/])
        expect(p.talk(p.npcsByName(re)[0]!, [0, 0]).started).toBe(true);
      await p.enter('GECKTUNL');
      for (const re of [/^Zomak$/, /^The Brain$/])
        expect(p.talk(p.npcsByName(re)[0]!, [0, 0]).started).toBe(true);
      expect(p.problems(mark)).toEqual([]);
    }, 180_000);

    it('ARCAVES: wyczyszczenie jaskini (22 krytery), XP, stan smierci trwaly po ponownym wejsciu', async () => {
      await p.enter('ARCAVES');
      const mark = p.logMark();
      const foes = () => p.world.map.objects.filter((o) => o.type === 1 && o !== p.player);
      expect(foes()).toHaveLength(22);
      const xp0 = p.xp();
      let gained = 0;
      let dead = 0;
      for (const f of foes()) {
        const r = p.kill(f);
        if (r.died) dead++;
        gained += r.xp;
      }
      p.tick(30);
      expect(dead).toBe(22);
      expect(gained).toBe(940);
      expect(p.xp() - xp0).toBe(940);
      expect(p.problems(mark)).toEqual([]);
      // wyjscie i powrot: zabici nie ozywaja (powtorne obrazenia nie zabijaja drugi raz, brak nowego XP)
      await p.enter('ARVILLAG');
      // (wejscie do ARVILLAG samo daje XP z map_enter wioski, wiec licznik odczytujemy po nim)
      const xp1 = p.xp();
      await p.enter('ARCAVES');
      const again = foes().map((f) => p.kill(f));
      expect(again.filter((r) => r.died)).toHaveLength(0);
      expect(p.xp()).toBe(xp1);
      expect(p.problems(mark)).toEqual([]);
    }, 300_000);

    it('Klamath: Ardin (Smiley), pelna sciezka do konca bez bledow VM', async () => {
      await p.enter('KLADWTWN');
      const mark = p.logMark();
      const r = p.talk(byId(728), [0, 0, 0, 0, 0]);
      expect(r.started).toBe(true);
      expect(r.history.join('\n')).toMatch(/Smiley/);
      expect(p.gvar('GVAR_CAN_ASK_ARDIN_ABOUT_SMILEY')).toBe(1);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);

    it('Klamath: Torr, przyjecie prosby o straz bydla ustawia GVAR_TORR_GUARD_STATUS', async () => {
      await p.enter('KLADWTWN');
      const mark = p.logMark();
      expect(p.gvar('GVAR_TORR_GUARD_STATUS')).toBe(0);
      const r = p.talk(byId(106), [/Nice to meet/, /Uh\.\.\.sure/, /guard the brahmin now/]);
      expect(r.history.join('\n')).toMatch(/Bugmen take moo-moos/);
      expect(p.gvar('GVAR_TORR_GUARD_STATUS')).toBe(1);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);

    it('Klamath: Torr, walka: trafienie zaczyna wrogosc, zabicie daje XP i GVAR_TORR_DEAD, martwy nie rozmawia', async () => {
      await p.enter('KLADWTWN');
      const mark = p.logMark();
      const torr = byId(106);
      const b = snap();
      const hit = p.rt.applyCombatDamage(torr.id, p.player.id, 1);
      expect(hit.died).toBe(false);
      expect(p.gvar('GVAR_ENEMY_TORR')).toBe(1);
      expect(p.gvar('GVAR_ENEMY_KLAMATH')).toBe(1);
      const xp0 = p.xp();
      const k = p.kill(torr);
      expect(k.died).toBe(true);
      expect(p.xp()).toBeGreaterThan(xp0);
      expect(p.gvar('GVAR_TORR_DEAD')).toBe(1);
      expect(gvarDiff(p, b).join('|')).toMatch(/GVAR_TOWN_REP_KLAMATH/);
      expect(p.talk(torr, [0]).started).toBe(false);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);

    it('Klamath: zabicie Ardin obniza reputacje miasta i daje XP, bez bledow VM', async () => {
      await p.enter('KLADWTWN');
      const mark = p.logMark();
      const rep0 = p.gvar('GVAR_TOWN_REP_KLAMATH');
      const xp0 = p.xp();
      const k = p.kill(byId(728));
      expect(k.died).toBe(true);
      expect(p.xp()).toBeGreaterThan(xp0);
      expect(p.gvar('GVAR_TOWN_REP_KLAMATH')).toBeLessThan(rep0);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);
  },
);
