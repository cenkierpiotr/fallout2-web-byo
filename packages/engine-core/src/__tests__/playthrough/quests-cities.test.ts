/**
 * Headless playthrough, miasta: Modoc, Vault City (podstawy), wejscie do NCR. Dialogi, platnosci w kapslach
 * (pid 41), mapy-przejscia i brak bledow VM na prawdziwych danych. Opis: dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const PID_CAPS = 41;

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Vault City, NCR (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  const text = (r: { history: string[] }) => r.history.join('\n');

  it('Modoc: Balthas (GECK nieznany), Davin (plotka o brahminach), Miria bez bledow VM', async () => {
    await p.enter('MODMAIN');
    const mark = p.logMark();
    const balthas = p.talk(byId(526), [/searching for an item called a GECK/, /./]);
    expect(text(balthas)).toMatch(/never heard of it/);
    const davin = p.talk(byId(268435477), [/rumors about you/, /./, /./]);
    expect(text(davin)).toMatch(/It.s a lie/);
    expect(text(davin)).toMatch(/owner.s son/);
    expect(p.talk(byId(268435478), [/slaughterhouse/, /./]).started).toBe(true);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Vault City: Cassidy (bar), Steve (odsylka do Melindy), Doc Andrew bez bledow VM', async () => {
    await p.enter('VCTYCTYD');
    const mark = p.logMark();
    const cass = p.talk(byId(30), [/interesting going on/, /./, /./]);
    expect(text(cass)).toMatch(/Beer for \$20/);
    const steve = p.talk(byId(250), [/looking for the Vault/, /./, /./, /./]);
    expect(text(steve)).toMatch(/refer you to Melinda/);
    const doc = p.talk(byId(230), [/What is this place/, /./]);
    expect(text(doc)).toMatch(/Auto-Doctor/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Vault City: Lynette prosi o dowod pochodzenia, a po tej rozmowie jest juz niecierpliwa', async () => {
    await p.enter('VCTYCOCL');
    const mark = p.logMark();
    const lynette = byId(18);
    const b = p.talk(lynette, [/village in the west/, /./, /./]);
    expect(text(b)).toMatch(/First Citizen|tribal MYTH/);
    expect(text(b)).toMatch(/tribal MYTH/);
    // powtorna rozmowa: stan skryptu (local vars) pamieta pierwsza, Lynette nie wita sie od nowa
    const again = p.talk(lynette, [0]);
    expect(again.started).toBe(true);
    expect(text(again)).not.toMatch(/You're wearing a vault suit/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Vault City: Dr. Troy w krypcie oraz sama krypta ladowane bez bledow VM', async () => {
    const mark = p.logMark();
    await p.enter('VCTYVLT');
    expect(p.talk(byId(562), [0]).started).toBe(true);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('NCR: wejscie (NCRENT), Stanwell (karawana 11. dnia), Mira bierze kapsle za drinka', async () => {
    await p.enter('NCRENT');
    const mark = p.logMark();
    const stan = p.talk(byId(268435475), [/You need a guard/, /./, /./]);
    expect(text(stan)).toMatch(/11th/);
    expect(text(stan)).toMatch(/brahmin/);
    const mira = byId(277);
    // bez gotowki: wyrzucona
    const broke = p.talk(mira, [/house special/, /./]);
    expect(text(broke)).toMatch(/deadbeat/);
    // z gotowka: $10 zejdzie z ekwipunku, rozmowa idzie dalej
    await p.give(PID_CAPS, 50);
    const paid = p.talk(mira, [/house special/, /./, /./]);
    expect(text(paid)).toMatch(/Rad-A-Waster/);
    expect(p.count(PID_CAPS)).toBe(40);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('NCR: miasto (NCR1) i dzielnica NCR3: Karl, Rondo, McGee, imie gracza w dialogu, bez bledow VM', async () => {
    const mark = p.logMark();
    await p.enter('NCR1');
    const karl = p.talk(byId(297), [/honest work/]);
    expect(text(karl)).toContain('Wybraniec');
    expect(p.talk(byId(53), [0]).started).toBe(true);
    await p.enter('NCR3');
    const mcgee = p.talk(byId(226), [/I.m looking for Vault 13/, /./]);
    expect(mcgee.started).toBe(true);
    expect(p.problems(mark)).toEqual([]);
  }, 180_000);
});
