/**
 * Headless playthrough, Modoc: skutek "let's get out of here" u Bess (mcbess) i cykl dobowy Rzeznika (mcbutchr).
 * Bess: po wyborze stado (8 brahminow, pid 0x100000a) i Bess ida do GVAR_MAP_NEXT_TILE i znikaja,
 * BRAHMIN_ESCAPED=9, reputacja gracza +10, reputacja Modoc -15. Rzeznik: za dnia zeruje bit 0x80
 * GENERIC_FLAG_1 i jest widoczny; w nocy (godzina <= 6 lub >= 18) idzie do MAP_NEXT_TILE, ustawia 0x80 i znika.
 * Wymaga poprawki has_trait 0x29a (self_visible) w script-runtime. Opis: dokumentacja techniczna czesc 12.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const BESS = 268435476;
const BUTCHER = 268435470;
const HOUR = 36000;
const DAY = 864000;

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Bess odchodzi i cykl Rzeznika (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
    await p.enter('MODMAIN');
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const find = (id: number) => p.world.map.objects.find((x) => x.id === id);
  const setHour = (h: number) => {
    p.world.clock.ticks = Math.floor(p.world.clock.ticks / DAY) * DAY + h * HOUR;
  };

  it('Bess po "let\'s get out of here": odchodzi ze stadem, karma +10, reputacja Modoc -15', () => {
    p.setGvar('GVAR_MODOC_TOOL_FLAG', 1);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', 0);
    const mark = p.logMark();
    const karma0 = p.gvar('GVAR_PLAYER_REPUTATION');
    const rep0 = p.gvar('GVAR_TOWN_REP_MODOC');
    p.talk(find(BESS)!, [/Poor girl/, /get out of here/, 0]);
    expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x100).toBe(0x100);
    for (let i = 0; i < 200 && p.gvar('GVAR_MODOC_BRAHMIN_ESCAPED') < 9; i++) p.tick(3);
    expect(find(BESS), 'Bess powinna zniknac z mapy').toBeUndefined();
    expect(p.gvar('GVAR_MODOC_BRAHMIN_ESCAPED')).toBe(9);
    expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(karma0 + 10);
    expect(p.gvar('GVAR_TOWN_REP_MODOC')).toBe(rep0 - 15);
    expect(p.problems(mark)).toEqual([]);
  });

  it('stado: kazdy brahmin (mckilbra) tworzy ukryta kopie pid 0x100000a na swoim kaflu (D: 0xd34 create_object_sid 0x240)', async () => {
    const herd = () => p.world.map.objects.filter((o) => o.pid === 0x100000a);
    const tiles0 = herd()
      .map((o) => o.hex)
      .sort((a, b) => a - b);
    expect(tiles0).toHaveLength(8);
    p.setGvar('GVAR_MODOC_TOOL_FLAG', 1);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', 0);
    p.talk(find(BESS)!, [/Poor girl/, /get out of here/, 0]);
    for (let i = 0; i < 200 && p.gvar('GVAR_MODOC_BRAHMIN_ESCAPED') < 9; i++) p.tick(3);
    await p.rt.settleSpawns();
    const copies = herd();
    // skrypt: create_object(0x100000a, 0, 0, sid 0x240 = mckilbra), has_trait self_visible => set_obj_visibility(1),
    // move_to(kopia, local_var 0, elevation), potem destroy_object(self): 8 ukrytych kopii na dawnych kaflach.
    expect(copies).toHaveLength(8);
    expect(copies.map((o) => o.hex).sort((a, b) => a - b)).toEqual(tiles0);
    expect(copies.every((o) => (o.flags & 1) === 1)).toBe(true);
    expect(copies.every((o) => o.scriptId !== -1)).toBe(true);
  });

  it('Rzeznik w nocy chowa sie i ustawia bit 0x80, za dnia go zeruje i wraca', () => {
    const mark = p.logMark();
    setHour(21);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', 0);
    for (let i = 0; i < 150 && !((find(BUTCHER)?.flags ?? 0) & 1); i++) p.tick(3);
    expect((find(BUTCHER)!.flags & 1) === 1, 'Rzeznik ukryty w nocy').toBe(true);
    expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x80).toBe(0x80);
    setHour(12);
    for (let i = 0; i < 150 && find(BUTCHER)!.flags & 1; i++) p.tick(3);
    expect(find(BUTCHER)!.flags & 1).toBe(0);
    expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & 0x80).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });
});
