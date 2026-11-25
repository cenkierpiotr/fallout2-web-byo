import { describe, expect, it } from 'vitest';
import { formatGameDate } from '../src/index.js';
import { MemorySaveBackend, SaveStore } from '../src/save/save-store.js';
import { SaveCommands, type SaveCommandsDeps } from '../src/save/autosave.js';
import type { SaveWorld } from '../src/save/schema.js';
import { arbitraryWorld } from './save-fixtures.js';

function setup(over: Partial<SaveCommandsDeps> = {}) {
  const store = new SaveStore(new MemorySaveBackend());
  let world: SaveWorld = arbitraryWorld(5);
  let t = 1000;
  const state = { dialog: false, combat: false };
  const cmds = new SaveCommands({
    store,
    getWorld: () => world,
    setWorld: (w) => {
      world = w;
    },
    isInDialog: () => state.dialog,
    isInCombat: () => state.combat,
    now: () => ++t,
    characterName: () => 'Chosen',
    locale: () => 'pl',
    engineVersion: '0.0.0',
    policy: { onMapChange: true, rotate: 3 },
    ...over,
  });
  return { store, cmds, state, world: () => world, setWorld: (w: SaveWorld) => (world = w) };
}

describe('save commands', () => {
  it('autosave rotates over 3 slots', async () => {
    const { cmds, store } = setup();
    const used: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await cmds.autosave();
      expect(r.ok).toBe(true);
      used.push((await store.list())[0]!.slot);
    }
    expect(used).toEqual(['auto-0', 'auto-1', 'auto-2', 'auto-0', 'auto-1']);
    expect((await store.list()).length).toBe(3);
  });

  it('quickSave then quickLoad restores player hex', async () => {
    const h = setup();
    const hex = h.world().player.hex;
    expect((await h.cmds.quickSave()).ok).toBe(true);
    h.world().player.hex = hex + 7;
    const r = await h.cmds.quickLoad();
    expect(r.ok).toBe(true);
    expect(h.world().player.hex).toBe(hex);
  });

  it('load returns reason for corrupt', async () => {
    const backend = new MemorySaveBackend();
    const store = new SaveStore(backend);
    await backend.put('manual-1', { garbage: true });
    const { cmds } = setup({ store });
    expect(await cmds.load('manual-1')).toEqual({ ok: false, reason: 'save-corrupt' });
    expect(await cmds.load('manual-2')).toEqual({ ok: false, reason: 'save-missing' });
    expect(await cmds.load('bogus')).toEqual({ ok: false, reason: 'bad-slot' });
  });

  it('save blocked in dialog', async () => {
    const { cmds, state, store } = setup();
    state.dialog = true;
    expect(await cmds.save('manual-0')).toEqual({ ok: false, reason: 'save-in-dialog' });
    expect(await cmds.quickSave()).toEqual({ ok: false, reason: 'save-in-dialog' });
    expect(await cmds.autosave()).toEqual({ ok: false, reason: 'save-in-dialog' });
    expect((await store.list()).length).toBe(0);
    state.dialog = false;
    state.combat = true;
    expect(await cmds.save('manual-0')).toEqual({ ok: false, reason: 'save-in-combat' });
  });

  it('onMapChange autosaves only when policy enabled', async () => {
    const on = setup();
    await on.cmds.onMapChange();
    expect((await on.store.list()).length).toBe(1);
    const off = setup({ policy: { onMapChange: false, rotate: 3 } });
    await off.cmds.onMapChange();
    expect((await off.store.list()).length).toBe(0);
  });

  it('save writes meta, thumbnail, list, delete, export/import', async () => {
    const h = setup({ getThumbnail: async () => 'data:image/jpeg;base64,AA' });
    await h.cmds.save('manual-3', 'moj zapis');
    const [m] = await h.cmds.saves.list();
    expect(m).toMatchObject({
      slot: 'manual-3',
      name: 'moj zapis',
      characterName: 'Chosen',
      level: h.world().player.progress.level,
      location: h.world().currentMap.name,
      thumbnail: 'data:image/jpeg;base64,AA',
      gameDate: formatGameDate(h.world().clock, 'pl'),
    });
    const blob = await h.cmds.saves.export('manual-3');
    expect(blob.ok).toBe(true);
    if (!blob.ok) return;
    await h.cmds.saves.delete('manual-3');
    expect((await h.cmds.saves.list()).length).toBe(0);
    const imp = await h.cmds.saves.import(blob.blob, 'manual-4');
    expect(imp.ok).toBe(true);
    expect((await h.cmds.saves.list())[0]!.slot).toBe('manual-4');
    expect(await h.cmds.saves.import(new Blob(['nope']), 'manual-5')).toEqual({
      ok: false,
      reason: 'save-corrupt',
    });
  });

  it('snapshots world before awaiting the thumbnail', async () => {
    let release!: (v: string) => void;
    const h = setup({ getThumbnail: () => new Promise<string>((r) => (release = r)) });
    const hex = h.world().player.hex;
    const p = h.cmds.save('manual-0');
    h.world().player.hex = hex + 99; // zmiana w trakcie oczekiwania na miniature
    await Promise.resolve();
    await Promise.resolve();
    release('data:x');
    await p;
    expect((await h.store.read('manual-0'))!.world.player.hex).toBe(hex);
    expect((await h.store.read('manual-0'))!.meta.thumbnail).toBe('data:x');
  });

  it('serializes overlapping saves in order', async () => {
    const order: string[] = [];
    const resolvers: (() => void)[] = [];
    const h = setup({
      getThumbnail: () =>
        new Promise<string | null>((r) => resolvers.push(() => (order.push('thumb'), r(null)))),
    });
    const orig = h.store.write.bind(h.store);
    h.store.write = async (slot, s) => (order.push(`w:${slot}`), orig(slot, s));
    const a = h.cmds.quickSave();
    const b = h.cmds.autosave();
    await Promise.resolve();
    expect(resolvers.length).toBe(1); // druga operacja czeka na pierwsza
    resolvers[0]!();
    await a;
    while (resolvers.length < 2) await Promise.resolve();
    resolvers[1]!();
    await b;
    expect(order).toEqual(['thumb', 'w:quick', 'thumb', 'w:auto-0']);
  });

  it('refuses to save on a random encounter map', async () => {
    const h = setup();
    h.world().currentMap.encounter = true;
    expect(await h.cmds.quickSave()).toEqual({ ok: false, reason: 'save-in-encounter' });
    expect(await h.cmds.autosave()).toEqual({ ok: false, reason: 'save-in-encounter' });
    expect((await h.store.list()).length).toBe(0);
  });

  it('load, delete and import go through the same queue as saves', async () => {
    const h = setup({ getThumbnail: () => new Promise((r) => setTimeout(() => r(null), 20)) });
    const hex = h.world().player.hex;
    const saving = h.cmds.save('manual-0');
    const loading = h.cmds.load('manual-0'); // musi poczekac na zapis
    expect(await saving).toEqual({ ok: true });
    expect(await loading).toEqual({ ok: true });
    expect(h.world().player.hex).toBe(hex);
    const saving2 = h.cmds.save('manual-1');
    const deleting = h.cmds.saves.delete('manual-1'); // po zapisie
    await saving2;
    await deleting;
    expect(await h.store.read('manual-1')).toBeNull();
    const blob = await h.cmds.saves.export('manual-0');
    if (!blob.ok) throw new Error('export');
    const saving3 = h.cmds.save('manual-2');
    const imp = h.cmds.saves.import(blob.blob, 'manual-2'); // po zapisie, nadpisuje
    await saving3;
    expect((await imp).ok).toBe(true);
    expect((await h.store.read('manual-2'))!.meta.slot).toBe('manual-2');
  });

  it('autosave slot choice is committed only after a successful snapshot', async () => {
    const h = setup();
    const origList = h.store.list.bind(h.store);
    h.store.list = async () => {
      throw new Error('idb');
    };
    await expect(h.cmds.autosave()).rejects.toThrow('idb');
    h.store.list = origList;
    h.store.list = async () => {
      h.state.dialog = true; // blokada pojawia sie w trakcie await
      return origList();
    };
    expect(await h.cmds.autosave()).toEqual({ ok: false, reason: 'save-in-dialog' });
    h.store.list = origList;
    h.state.dialog = false;
    expect(await h.cmds.autosave()).toEqual({ ok: true });
    expect((await h.store.list())[0]!.slot).toBe('auto-0');
  });
});
