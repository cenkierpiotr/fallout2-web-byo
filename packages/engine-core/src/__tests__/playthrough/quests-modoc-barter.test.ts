/**
 * Headless playthrough, Modoc: handel z Jo (prawdziwa sesja BarterSession na ekwipunkach z mapy), regresje
 * silnika znalezione w kampanii: (1) pusty floater skryptu czytajacego cudza liste komunikatow (Bess),
 * (2) kolizja id create_object z id przedmiotow zarejestrowanych w ekwipunkach. Opis: dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { barterPrice } from '@f2/rules';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const PID_CAPS = 41;
const JO = 268435471;
const BESS = 268435476;
const AMMO_PID = 0x5f;
const WEAPON_PID = 0x5e;

describe.skipIf(!GAME_DIR)('playthrough: Modoc, handel i regresje (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('MODMAIN');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('regresja: skrypt czytajacy cudza liste komunikatow (Bess) pokazuje tekst od pierwszej interakcji', () => {
    const mark = p.logMark();
    p.view.floatingTexts.value = [];
    p.talk(byId(BESS), []);
    const texts = p.view.floatingTexts.value.map((f) => f.text);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.join(' ')).toMatch(/Moo/);
    expect(p.problems(mark)).toEqual([]);
  });

  it('regresja: id create_object nie nadpisuje przedmiotow zarejestrowanych w ekwipunku (Jo)', () => {
    const jo = byId(JO);
    const pids = jo.inventory.map((o) => o.pid).sort((a, b) => a - b);
    expect(pids).toEqual([PID_CAPS, WEAPON_PID, AMMO_PID]);
    const ids = jo.inventory.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of jo.inventory) expect(p.rt.objects.get(o.id)).toBe(o);
    // zaden przedmiot z ekwipunku nie wystepuje tez jako obiekt luzem na mapie
    for (const o of jo.inventory)
      expect(p.world.map.objects.some((x) => x.id === o.id)).toBe(false);
  });

  it('dialog Jo: "Let\'s do some business" otwiera handel (gdialog_barter)', () => {
    const before = p.barterCalls.length;
    const r = p.talk(byId(JO), [
      /who says/,
      /What do you do here/,
      /./,
      /some more questions/,
      /What do you have to trade/,
      /do some business/,
    ]);
    expect(r.history.join('\n')).toMatch(/I rely heavily on the products/);
    expect(p.barterCalls.length).toBe(before + 1);
    expect(p.barterCalls.at(-1)!.npc).toBe(JO);
  }, 60_000);

  it('ceny: oferta = trunc(2*V*ratio*mod + kapsle), kapsle 1:1, zbyt niska oferta odrzucona', async () => {
    const jo = byId(JO);
    const costOf = (pid: number) => {
      const o = jo.inventory.find((x) => x.pid === pid)!;
      return o.proto.kind === 'item' ? o.proto.cost : 0;
    };
    expect(costOf(AMMO_PID)).toBe(225);
    expect(costOf(WEAPON_PID)).toBe(800);
    await p.give(PID_CAPS, 300);
    const b = p.barter(jo);
    expect(b.session.addToTable('merchant', b.idOf('m', AMMO_PID), 1)).toBe(true);
    expect(b.session.totals().merchantValue).toBe(225);
    // 100 kapsli (1:1) nie pokrywa 225
    expect(b.session.addToTable('player', b.idOf('p', PID_CAPS), 100)).toBe(true);
    expect(b.session.totals().offer).toBe(100);
    expect(b.accept()).toBe('offer-too-low');
    // przedmiot gracza liczony po 2*V przy Barter 0 i mod 0
    expect(
      barterPrice({
        value: 225,
        caps: 0,
        merchantBarter: 0,
        partyBestBarter: 0,
        barterMod: 0,
        masterTrader: false,
      }),
    ).toBe(450);
    expect(
      barterPrice({
        value: 225,
        caps: 0,
        merchantBarter: 40,
        partyBestBarter: 80,
        barterMod: 0,
        masterTrader: false,
      }),
    ).toBe(Math.trunc((2 * 225 * 200) / 240));
  });

  it('wymiana: kupno amunicji od Jo za kapsle przenosi towar i kapsle w prawdziwych ekwipunkach', async () => {
    const jo = byId(JO);
    const capsBefore = p.count(PID_CAPS);
    const joCapsBefore = jo.inventory.find((x) => x.pid === PID_CAPS)?.quantity ?? 0;
    const ammoBefore = p.count(AMMO_PID);
    const b = p.barter(jo);
    b.session.addToTable('merchant', b.idOf('m', AMMO_PID), 1);
    expect(b.session.balance()).toBe('ok');
    const t = b.session.totals();
    expect(t.offer).toBeGreaterThanOrEqual(225);
    expect(b.accept()).toBe('ok');
    expect(p.count(AMMO_PID)).toBe(ammoBefore + 1);
    expect(p.count(PID_CAPS)).toBe(capsBefore - 225);
    expect(jo.inventory.find((x) => x.pid === PID_CAPS)?.quantity ?? 0).toBe(joCapsBefore + 225);
    expect(jo.inventory.some((x) => x.pid === AMMO_PID)).toBe(false);
  });
});
