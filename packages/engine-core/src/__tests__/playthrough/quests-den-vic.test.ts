/**
 * Headless playthrough, quest Vica: czesci do radia (Vic's Radio 0x10a w chacie w Klamath, na wschod od Duntonow) ->
 * oddanie Vicowi w DENBUS2 (GVAR_DEN_FLAG_2 |= 0x400000, radio znika) -> wykup od Metzgera za $1000 (QUEST_VIC_DEVICE=2)
 * -> Vic dolacza do druzyny, 200 XP za wskazanie Eda. Opis: dokumentacja techniczna czesc 10.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const CAPS = 0x29;
const VICS_RADIO = 0x10a;
const VIC = 138;
const METZGER = 268435468;
const SHACK_CONTAINER = 268436213;
const RADIO_DELIVERED = 0x400000;

const START_QUEST = [
  /get you out/,
  /Vault 13/,
  /How do we do that/,
  /Where can I get the parts/,
  /go look for it/,
  0,
];
const BUY_VIC = [/About Vic/, /Why are you keeping/, /money might help/];

describe.skipIf(!GAME_DIR)('playthrough: quest Vica (headless)', () => {
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
  const startQuest = async () => {
    await p.enter('DENBUS2');
    p.talk(byId(VIC), START_QUEST);
  };

  it("Klamath: Vic's Radio (0x10a) lezy w kontenerze chaty w KLADWTWN", async () => {
    await p.enter('kladwtwn');
    const box = byId(SHACK_CONTAINER);
    expect(box.inventory.map((i) => i.pid)).toContain(VICS_RADIO);
  }, 120_000);

  it('Vic bez radia: powrot to przypomnienie o czesciach, bez zmiany stanu quest/XP', async () => {
    await startQuest();
    const mark = p.logMark();
    const r = p.talk(byId(VIC), [/Where can I get the parts/, 0]);
    expect(text(r)).toMatch(/spare parts/);
    expect(text(r)).toMatch(/Dunton/);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(1);
    expect(p.gvar('GVAR_DEN_FLAG_2') & RADIO_DELIVERED).toBe(0);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('oddanie radia: radio znika z ekwipunku, ustawia DEN_FLAG_2 (0x400000), quest nadal 1, bez XP', async () => {
    await startQuest();
    await p.give(VICS_RADIO, 1);
    const mark = p.logMark();
    const r = p.talk(byId(VIC), [/this radio/, 0]);
    expect(text(r)).toMatch(/fixed in no time/);
    expect(p.count(VICS_RADIO)).toBe(0);
    expect(p.gvar('GVAR_DEN_FLAG_2') & RADIO_DELIVERED).toBe(RADIO_DELIVERED);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(1);
    expect(p.xp()).toBe(0);
    // kolejna rozmowa: Vic wie, ze radio dziala, i prosi o wykup od Metzgera
    const r2 = p.talk(byId(VIC), [0, 0]);
    expect(text(r2)).toMatch(/fixed his darn radio/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Metzger bez radia: nie oferuje wykupu Vica (brak opcji "money might help")', async () => {
    await startQuest();
    const r = p.talk(byId(METZGER), [/About Vic/, /Why are you keeping/]);
    expect(text(r)).not.toMatch(/damn radio to work/);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(1);
  }, 120_000);

  it('Metzger po naprawie radia: bez $1000 odmowa, kapsle i quest bez zmian', async () => {
    await startQuest();
    await p.give(VICS_RADIO, 1);
    p.talk(byId(VIC), [/this radio/, 0]);
    const mark = p.logMark();
    const c0 = p.count(CAPS);
    const r = p.talk(byId(METZGER), [...BUY_VIC, /can.t afford/]);
    expect(text(r)).toMatch(/cost you \$1000/);
    expect(p.count(CAPS)).toBe(c0);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('wykup za $1000: kapsle -1000, QUEST_VIC_DEVICE=2, Vic w druzynie, +200 XP za Eda', async () => {
    await startQuest();
    await p.give(VICS_RADIO, 1);
    p.talk(byId(VIC), [/this radio/, 0]);
    await p.give(CAPS, 1000);
    const mark = p.logMark();
    const party0 = p.rt.inventory.party.size;
    const r = p.talk(byId(METZGER), [...BUY_VIC, /Here/, /Thank you/]);
    expect(text(r)).toMatch(/he.s yours/);
    expect(p.count(CAPS)).toBe(0);
    const v = p.talk(byId(VIC), [/Vault 13/, /go there with me/, /let.s go/]);
    expect(text(v)).toMatch(/forever in your debt/);
    expect(text(v)).toMatch(/Vault City east of here/);
    expect(text(v)).toMatch(/join up with you/);
    expect(p.gvar('GVAR_QUEST_VIC_DEVICE')).toBe(2);
    expect(p.xp()).toBe(0);
    expect(p.rt.inventory.party.size).toBe(party0 + 1);
    // 200 XP dostajesz dopiero za wskazanie Eda (Vault City) na mapie swiata
    const ed = p.talk(byId(VIC), [/ask you something/, /Ed/]);
    expect(text(ed)).toMatch(/brahmin dealer/);
    expect(p.xp()).toBe(200);
    // powtorne pytanie o Eda nie daje XP drugi raz
    p.talk(byId(VIC), [/ask you something/, /Ed/]);
    expect(p.xp()).toBe(200);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
