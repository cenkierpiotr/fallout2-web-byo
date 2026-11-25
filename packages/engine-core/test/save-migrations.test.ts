/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/save/migrations.js';
import { serializeWorld } from '../src/save/serialize.js';
import { exportSave, importSave } from '../src/save/export.js';
import { MemorySaveBackend, SaveStore } from '../src/save/save-store.js';
import { SAVE_SLOTS, isValidSlot } from '../src/save/schema.js';
import { arbitraryWorld } from './save-fixtures.js';

const metaFor = (slot: string, realTime: number) => ({
  slot,
  name: slot,
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime,
  thumbnail: null,
  engineVersion: '0',
});

describe('migrate', () => {
  const good = serializeWorld(arbitraryWorld(5), metaFor('quick', 1));
  it('accepts current version (object or JSON text)', () => {
    expect(good.schemaVersion).toBe(7);
    expect(migrate(good)).toEqual(good);
    expect(migrate(JSON.stringify(good))).toEqual(good);
  });
  it("rejects schemaVersion 8 with 'save-too-new'", () => {
    expect(migrate({ ...good, schemaVersion: 8 })).toEqual({ error: 'save-too-new' });
  });
  it("rejects truncated JSON with 'save-corrupt'", () => {
    expect(migrate(JSON.stringify(good).slice(0, 200))).toEqual({ error: 'save-corrupt' });
  });
  it("rejects missing fields, non-objects and bad version with 'save-corrupt'", () => {
    expect(migrate(null)).toEqual({ error: 'save-corrupt' });
    expect(migrate(42)).toEqual({ error: 'save-corrupt' });
    expect(migrate({ ...good, schemaVersion: 'x' })).toEqual({ error: 'save-corrupt' });
    const noWorld: Record<string, unknown> = { ...good };
    delete noWorld['world'];
    expect(migrate(noWorld)).toEqual({ error: 'save-corrupt' });
    expect(migrate({ ...good, queue: 'no' })).toEqual({ error: 'save-corrupt' });
  });
});

describe('migrate deep validation', () => {
  const base = () =>
    JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(5), metaFor('quick', 1))));
  const bad = (mut: (g: Record<string, any>) => void) => {
    const g = base();
    mut(g);
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  };
  it('accepts the baseline', () => expect(migrate(base())).not.toHaveProperty('error'));
  it('rejects bad currentMap', () => {
    bad((g) => delete g.world.currentMap);
    bad((g) => (g.world.currentMap.name = 5));
    bad((g) => (g.world.currentMap.elevation = 1.5));
  });
  it('rejects bad settings / scriptTimers', () => {
    bad((g) => delete g.world.settings);
    bad((g) => (g.world.settings.violence = 'x'));
    bad((g) => (g.world.scriptTimers = []));
    bad((g) => (g.world.scriptTimers = { a: 'x' }));
  });
  it('rejects bad player stats/hp', () => {
    bad((g) => (g.world.player.baseStats = [1, 2]));
    bad((g) => (g.world.player.baseStats[3] = null));
    bad((g) => delete g.world.player.hp);
    bad((g) => (g.world.player.radiation = NaN));
  });
  it('rejects bad queue events', () => {
    bad((g) => g.queue.push({ atTick: Infinity, kind: 'x', objId: 1, payload: null }));
    bad((g) => g.queue.push({ atTick: 'a', kind: 'x', objId: 1, payload: null }));
    bad((g) => g.queue.push(5));
    bad((g) => g.queue.push({ atTick: 5, kind: 7, objId: 1, payload: null }));
  });
  it('rejects bad maps entries', () => {
    bad((g) => g.maps.push(null));
    bad((g) => (g.maps[0].name = 3));
    bad((g) => (g.maps[0].elevations = 'x'));
    bad((g) => (g.maps[0].elevations[0].objects = {}));
    bad((g) => (g.maps[0].mapVars = ['a']));
  });
  it('rejects negative / fractional clock', () => {
    bad((g) => (g.clock = -1));
    bad((g) => (g.clock = 1.5));
  });
});

describe('migrate v3 -> v4 (perkPending)', () => {
  const v3 = (seed: number) => {
    const g = JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(seed), metaFor('quick', 1))));
    g.schemaVersion = 3;
    delete g.world.player.progress.perkPending;
    return g;
  };
  it('dodaje perkPending=false', () => {
    const r: any = migrate(v3(5));
    expect(r.schemaVersion).toBe(7);
    expect(r.world.player.progress.perkPending).toBe(false);
  });
  it('v1 przechodzi caly lancuch do v4', () => {
    const g = v3(5);
    g.schemaVersion = 1;
    const r: any = migrate(g);
    expect(r.schemaVersion).toBe(7);
    expect(r.world.player.progress.perkPending).toBe(false);
  });
  it('perkPending nie-boolean = save-corrupt', () => {
    const g = JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(5), metaFor('quick', 1))));
    g.world.player.progress.perkPending = 1;
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  });
  it('round-trip zachowuje perkPending true/false', () => {
    for (const seed of [4, 5]) {
      const w = arbitraryWorld(seed);
      const s = serializeWorld(w, metaFor('quick', 1));
      expect((migrate(JSON.stringify(s)) as any).world.player.progress.perkPending).toBe(
        seed % 2 === 1,
      );
    }
  });
});

describe('migrate v1 -> v2', () => {
  const v1 = () => {
    const g = JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(5), metaFor('quick', 1))));
    g.schemaVersion = 1;
    delete g.world.player.hp;
    delete g.world.player.radiation;
    delete g.world.player.poison;
    const strip = (items: any[]) =>
      items.forEach((i) => {
        delete i.ammoPid;
        strip(i.contents);
      });
    strip(g.world.player.inventory);
    for (const m of g.maps)
      for (const e of m.elevations) for (const o of e.objects) strip(o.inventory);
    return g;
  };
  it('fills hp from maxHP when available, radiation/poison 0, ammoPid null', () => {
    const g = v1();
    g.world.player.baseStats[7] = 120;
    g.world.player.statBonuses[7] = 10;
    const r: any = migrate(g);
    expect(r.schemaVersion).toBe(7);
    expect(r.world.player.hp).toBe(130);
    expect(r.world.player.radiation).toBe(0);
    expect(r.world.player.poison).toBe(0);
    expect(r.world.player.migrationTodo).toBeUndefined();
    expect(r.world.player.inventory.every((i: any) => i.ammoPid === null)).toBe(true);
  });
  it('without maxHP sets hp 0 and a TODO flag', () => {
    const g = v1();
    g.world.player.baseStats[7] = 0;
    g.world.player.statBonuses[7] = 0;
    const r: any = migrate(g);
    expect(r.world.player.hp).toBe(0);
    expect(r.world.player.migrationTodo).toContain('hp');
  });
  it('keeps existing hp/ammoPid values of v1', () => {
    const g = JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(5), metaFor('quick', 1))));
    g.schemaVersion = 1;
    const hp = g.world.player.hp;
    const r: any = migrate(g);
    expect(r.world.player.hp).toBe(hp);
    expect(JSON.stringify(r.world.player.inventory)).toBe(JSON.stringify(g.world.player.inventory));
  });
  it('still rejects corrupt v1', () => {
    const g = v1();
    g.queue = 'no';
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  });
});

describe('migrate stricter validation', () => {
  const base = () =>
    JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(5), metaFor('quick', 1))));
  const bad = (mut: (g: Record<string, any>) => void) => {
    const g = base();
    mut(g);
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  };
  const fx = (over: Record<string, unknown> = {}) => ({
    seq: 1,
    targetId: 1,
    atTick: 5,
    kind: 'drug-stage',
    deltas: [{ stat: 0, amount: 1 }],
    drugPid: 1,
    useId: 1,
    addictionIndex: 0,
    withdrawalEffect: 0,
    ...over,
  });
  it('accepts valid drug-revert and withdrawal payloads', () => {
    const g = base();
    g.queue.push({ atTick: 5, kind: 'drug-revert', objId: 1, payload: fx() });
    g.queue.push({ atTick: 6, kind: 'withdrawal', objId: 1, payload: fx({ kind: 'withdrawal' }) });
    expect(migrate(g)).not.toHaveProperty('error');
  });
  it('accepts withdrawal-end payload, rejects wrong kind', () => {
    const g = base();
    g.queue.push({
      atTick: 7,
      kind: 'withdrawal-end',
      objId: 1,
      payload: fx({ kind: 'withdrawal-end' }),
    });
    expect(migrate(g)).not.toHaveProperty('error');
    const b = base();
    b.queue.push({ atTick: 7, kind: 'withdrawal-end', objId: 1, payload: fx() });
    expect(migrate(b)).toHaveProperty('error');
    const c = base();
    c.queue.push({ atTick: 7, kind: 'withdrawal-end', objId: 1, payload: null });
    expect(migrate(c)).toHaveProperty('error');
  });
  it('rejects bad drug-revert / withdrawal payloads', () => {
    const ev = (kind: string, payload: unknown) => (g: Record<string, any>) =>
      g.queue.push({ atTick: 5, kind, objId: 1, payload });
    bad(ev('drug-revert', null));
    bad(ev('drug-revert', 5));
    bad(ev('withdrawal', null));
    bad(ev('drug-revert', fx({ seq: NaN })));
    bad(ev('drug-revert', fx({ seq: 'a' })));
    bad(ev('drug-revert', fx({ useId: undefined })));
    bad(ev('withdrawal', fx({ kind: 'withdrawal', useId: Infinity })));
    bad(ev('drug-revert', fx({ deltas: 'x' })));
    bad(ev('drug-revert', fx({ deltas: [{ stat: 'a', amount: 1 }] })));
    bad(ev('drug-revert', fx({ kind: 'withdrawal' })));
  });
  it('rejects bad items', () => {
    bad(
      (g) =>
        (g.world.player.inventory = [
          { pid: 1, count: 1, equippedSlot: 'head', ammo: null, ammoPid: null, contents: [] },
        ]),
    );
    bad(
      (g) =>
        (g.world.player.inventory = [
          { pid: 1, count: 1, equippedSlot: null, ammo: 'x', ammoPid: null, contents: [] },
        ]),
    );
    bad(
      (g) =>
        (g.world.player.inventory = [
          { pid: 1, count: 1, equippedSlot: null, ammo: null, ammoPid: 'x', contents: [] },
        ]),
    );
    bad(
      (g) =>
        (g.world.player.inventory = [
          { pid: 1, count: 1, equippedSlot: null, ammo: null, contents: [] },
        ]),
    );
    bad(
      (g) =>
        (g.world.player.inventory = [
          { pid: 1, count: 1, equippedSlot: null, ammo: NaN, ammoPid: null, contents: [] },
        ]),
    );
  });
  it('rejects bad player orientation/flags', () => {
    bad((g) => (g.world.player.orientation = 'n'));
    bad((g) => (g.world.player.orientation = 9));
    bad((g) => delete g.world.player.flags);
    bad((g) => (g.world.player.flags = 1.5));
  });
  it('rejects bad meta', () => {
    bad((g) => (g.meta.name = 3));
    bad((g) => (g.meta.thumbnail = 5));
    bad((g) => (g.meta.level = 'x'));
    bad((g) => delete g.meta.engineVersion);
  });
  it('validates currentMap.encounter and map objects', () => {
    bad((g) => (g.world.currentMap.encounter = 'yes'));
    const g = base();
    g.world.currentMap.encounter = true;
    expect(migrate(g)).not.toHaveProperty('error');
    bad((g2) => (g2.maps[0].encounter = 1));
  });
});

describe('SaveStore', () => {
  it('lists newest first and supports read/delete', async () => {
    const store = new SaveStore(new MemorySaveBackend());
    for (const [slot, t] of [
      ['manual-0', 10],
      ['quick', 30],
      ['auto-1', 20],
    ] as const) {
      await store.write(slot, serializeWorld(arbitraryWorld(t), metaFor(slot, t)));
    }
    expect((await store.list()).map((m) => m.slot)).toEqual(['quick', 'auto-1', 'manual-0']);
    expect((await store.read('quick'))?.meta.realTime).toBe(30);
    await store.delete('quick');
    expect(await store.read('quick')).toBeNull();
    expect((await store.list()).length).toBe(2);
  });
  it('rejects invalid slots and overwrites', async () => {
    const store = new SaveStore(new MemorySaveBackend());
    const s = serializeWorld(arbitraryWorld(1), metaFor('quick', 1));
    await expect(store.write('bogus', s)).rejects.toThrow();
    await store.write('quick', s);
    await store.write('quick', serializeWorld(arbitraryWorld(2), metaFor('quick', 2)));
    expect((await store.list()).length).toBe(1);
    expect(SAVE_SLOTS.length).toBe(1 + 3 + 10);
    expect(isValidSlot('manual-9')).toBe(true);
    expect(isValidSlot('manual-10')).toBe(false);
  });
  it('read of corrupt stored data yields error result via readChecked', async () => {
    const be = new MemorySaveBackend();
    await be.put('quick', { schemaVersion: 1 });
    const store = new SaveStore(be);
    expect(await store.readChecked('quick')).toEqual({ error: 'save-corrupt' });
  });
});

describe('export/import', () => {
  it('export then import equals', async () => {
    const s = serializeWorld(arbitraryWorld(9), metaFor('manual-3', 5));
    const blob = await exportSave(s);
    expect(blob.size).toBeGreaterThan(0);
    expect(await importSave(blob)).toEqual(s);
  });
  it('import of garbage returns save-corrupt', async () => {
    expect(await importSave(new Blob(['not gzip at all']))).toEqual({ error: 'save-corrupt' });
  });
});
