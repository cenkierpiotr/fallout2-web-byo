import { describe, expect, it } from 'vitest';
import { Batch4Model } from '../batch4-model.js';
import { emptyMap, fake } from './helpers.js';
import { indexObject } from '../game-map.js';

describe('Batch4Model', () => {
  const map = emptyMap();
  const c = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  indexObject(map, c);
  const m = new Batch4Model({
    obj: (id) => (id === c.id ? c : undefined),
    currentMap: () => map,
    inventory: {} as never,
    experience: () => 777,
  });
  it('get_pc_stat: XP z runtime, reszta z mapy', () => {
    expect(m.pcStat(2)).toBe(777);
    m.pcStats.set(4, 12);
    expect(m.pcStat(4)).toBe(12);
    expect(m.pcStat(0)).toBe(0);
  });
  it('get_pc_stat 1: poziom z progow XP (exp_for_level = 500*L*(L-1))', () => {
    let xp = 0;
    const lv = new Batch4Model({
      obj: () => undefined,
      currentMap: () => map,
      inventory: {} as never,
      experience: () => xp,
    });
    xp = 0;
    expect(lv.pcStat(1)).toBe(1);
    xp = 999;
    expect(lv.pcStat(1)).toBe(1);
    xp = 1000;
    expect(lv.pcStat(1)).toBe(2);
    xp = 3000;
    expect(lv.pcStat(1)).toBe(3);
  });
  it('attemptPlacement przenosi obiekt, zla elewacja = -1', () => {
    expect(m.attemptPlacement(c.id, 200, 0)).toBe(0);
    expect(c.hex).toBe(200);
    expect(m.attemptPlacement(c.id, 200, 3)).toBe(-1);
    expect(m.attemptPlacement(9999, 200, 0)).toBe(-1);
  });
  it('nieistniejacy krytter: -1', () => {
    expect(m.critterState(9999)).toBe(-1);
    expect(m.critterHeal(9999, 5)).toBe(-1);
  });
  it('critter_heal na krytterze bez protoka (np. gracz sprzed ustawienia protoka) nie rzuca', () => {
    const bare = fake(1, 102, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    (bare as { proto?: unknown }).proto = undefined;
    const mm = new Batch4Model({
      obj: (id) => (id === bare.id ? bare : undefined),
      currentMap: () => map,
      inventory: {} as never,
      experience: () => 0,
    });
    expect(mm.critterHeal(bare.id, 5)).toBe(0);
  });
});

describe('Batch4Model.moveInventory: zdejmowanie trzymanego przedmiotu', () => {
  it('przedmiot z reki zrodla trafia do celu i przestaje byc trzymany (D: 0x45409c)', async () => {
    const { InventoryModel } = await import('../inventory-model.js');
    const map = emptyMap();
    const src = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    const dst = fake(1, 101, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    const gun = fake(0, -1);
    map.objects.push(src, dst);
    src.inventory.push(gun);
    const objects = new Map([src, dst, gun].map((o) => [o.id, o] as const));
    const inv = new InventoryModel({ objects, currentMap: () => map, player: () => dst } as never);
    inv.equipment.set(src.id, { right: gun });
    const m = new Batch4Model({
      obj: (id) => objects.get(id),
      currentMap: () => map,
      inventory: inv,
      experience: () => 0,
    });
    m.moveInventory(src.id, dst.id);
    expect(src.inventory).toHaveLength(0);
    expect(dst.inventory).toContain(gun);
    expect(inv.equipment.get(src.id)?.right).toBeUndefined();
  });
});
