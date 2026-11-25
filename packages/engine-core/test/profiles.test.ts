import { describe, expect, it } from 'vitest';
import {
  MemoryKv,
  ProfileError,
  ProfileStore,
  SaveCommands,
  exportProfile,
  importProfile,
  validPin,
  type SyncChange,
  AutosaveTimer,
} from '../src/index.js';
import type { SaveWorld } from '../src/save/schema.js';
import { arbitraryWorld } from './save-fixtures.js';

function mk(deviceId = 'dev-a') {
  let t = 1_000;
  let n = 0;
  const profilesKv = new MemoryKv();
  const savesKv = new MemoryKv();
  const store = new ProfileStore(profilesKv, savesKv, {
    now: () => ++t,
    randomId: () => `p${++n}`,
    deviceId,
  });
  return { store, profilesKv, savesKv };
}

function cmdsFor(store: ProfileStore, id: string, seed = 1) {
  let world: SaveWorld = arbitraryWorld(seed);
  let t = 5_000;
  return new SaveCommands({
    store: store.saveStore(id),
    getWorld: () => world,
    setWorld: (w) => {
      world = w;
    },
    isInDialog: () => false,
    isInCombat: () => false,
    now: () => ++t,
    characterName: () => id,
    locale: () => 'pl',
    engineVersion: '0.0.0',
    policy: { onMapChange: true, rotate: 3 },
  });
}

describe('ProfileStore', () => {
  it('create/list/rename/remove z walidacja nazw', async () => {
    const { store } = mk();
    const a = await store.create({ name: '  Ala  ' });
    expect(a.name).toBe('Ala');
    await expect(store.create({ name: 'ala' })).rejects.toMatchObject({ code: 'name-taken' });
    await expect(store.create({ name: '' })).rejects.toBeInstanceOf(ProfileError);
    await store.rename(a.id, 'Ola');
    expect((await store.list()).map((p) => p.name)).toEqual(['Ola']);
    await store.remove(a.id);
    expect(await store.list()).toEqual([]);
    expect(await store.get(a.id)).toBeNull();
  });

  it('PIN: hash z sola, weryfikacja, zmiana wymaga starego, brak PIN-u w podsumowaniu', async () => {
    const { store, profilesKv } = mk();
    expect(validPin('1234')).toBe(true);
    expect(validPin('12')).toBe(false);
    expect(validPin('abcd')).toBe(false);
    const p = await store.create({ name: 'Zosia', pin: '4321' });
    expect(p.hasPin).toBe(true);
    expect(JSON.stringify(p)).not.toContain('4321');
    const raw = JSON.stringify([...(await profilesKv.entries())]);
    expect(raw).not.toContain('4321');
    expect(await store.verifyPin(p.id, '4321')).toBe(true);
    expect(await store.verifyPin(p.id, '0000')).toBe(false);
    expect(await store.activate(p.id)).toBe('pin-required');
    expect(await store.activate(p.id, '0000')).toBe('pin-wrong');
    expect(await store.activate(p.id, '4321')).toBe('ok');
    await expect(store.setPin(p.id, '9999', 'bad')).rejects.toMatchObject({ code: 'pin-wrong' });
    await store.setPin(p.id, '9999', '4321');
    expect(await store.verifyPin(p.id, '9999')).toBe(true);
    await store.setPin(p.id, null, '9999');
    expect((await store.get(p.id))!.hasPin).toBe(false);
  });

  it('zapamietuje aktywny profil', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'A' });
    expect(await store.getActiveId()).toBeNull();
    await store.activate(a.id);
    expect(await store.getActiveId()).toBe(a.id);
  });

  it('izolacja: profil A nie widzi zapisow B', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'A' });
    const b = await store.create({ name: 'B' });
    await cmdsFor(store, a.id).save('manual-0', 'tylko A');
    expect((await store.saveStore(a.id).list()).length).toBe(1);
    expect(await store.saveStore(b.id).list()).toEqual([]);
    await cmdsFor(store, b.id, 2).quickSave();
    expect((await store.saveStore(a.id).list()).map((m) => m.slot)).toEqual(['manual-0']);
    expect((await store.saveStore(b.id).list()).map((m) => m.slot)).toEqual(['quick']);
    await store.remove(b.id);
    expect((await store.saveStore(a.id).list()).length).toBe(1);
    expect(await store.saveStore(b.id).list()).toEqual([]);
  });

  it('profil default widzi zapisy sprzed profili (klucze bez prefiksu)', async () => {
    const { store, savesKv } = mk();
    await store.ensureDefault('Gracz');
    await cmdsFor(store, 'default').quickSave();
    expect((await savesKv.entries()).some(([k]) => k === 'quick')).toBe(true);
    expect((await store.saveStore('default').list()).length).toBe(1);
  });

  it('ustawienia per profil', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'A' });
    const b = await store.create({ name: 'B' });
    await store.patchSettings(a.id, { gameTextLanguage: 'pl' });
    expect(await store.getSettings(a.id)).toEqual({ gameTextLanguage: 'pl' });
    expect(await store.getSettings(b.id)).toEqual({});
  });
});

describe('model sync', () => {
  it('rev rosnie, hash i deviceId, usuniecie to tombstone, miniatura osobno', async () => {
    const { store, savesKv } = mk('dev-x');
    const a = await store.create({ name: 'A' });
    const cmds = cmdsFor(store, a.id);
    await cmds.save('manual-0', 'x');
    const be = store.saveBackend(a.id);
    const m1 = (await be.listMeta()).find((m) => m.id === `${a.id}/manual-0`)!;
    expect(m1).toMatchObject({ deviceId: 'dev-x', rev: 1, deleted: false });
    expect(m1.contentHash).toMatch(/^[0-9a-f]{64}$/);
    await cmds.save('manual-0', 'y');
    const m2 = (await be.listMeta()).find((m) => m.id === m1.id)!;
    expect(m2.rev).toBe(2);
    expect(m2.updatedAt).toBeGreaterThan(m1.updatedAt);
    // payload w osobnym kluczu nie niesie miniatury
    const payload = (await savesKv.get(`${a.id}/manual-0`)) as { meta: { thumbnail: unknown } };
    expect(payload.meta.thumbnail ?? null).toBeNull();
    await store.saveStore(a.id).delete('manual-0');
    const m3 = (await be.listMeta()).find((m) => m.id === m1.id)!;
    expect(m3).toMatchObject({ deleted: true, rev: 3, contentHash: '' });
    expect(await store.saveStore(a.id).list()).toEqual([]);
    const ch = await be.readChange('manual-0');
    expect(ch?.payload).toBeNull();
  });

  it('miniatura trzymana osobno i skladana przy odczycie', async () => {
    const { store, savesKv } = mk();
    const a = await store.create({ name: 'A' });
    const ss = store.saveStore(a.id);
    const save = (await (async () => {
      await cmdsFor(store, a.id).quickSave();
      return ss.read('quick');
    })())!;
    await ss.write('quick', {
      ...save,
      meta: { ...save.meta, thumbnail: 'data:image/png;base64,AAA' },
    });
    expect((await savesKv.get(`t:${a.id}/quick`)) as string).toBe('data:image/png;base64,AAA');
    expect((await ss.read('quick'))!.meta.thumbnail).toBe('data:image/png;base64,AAA');
    const ch = (await store.saveBackend(a.id).readChange('quick'))!;
    expect(ch.thumbnail).toBe('data:image/png;base64,AAA');
  });

  it('applyRemote: wyzszy rev wygrywa, niski odrzucony, tombstone usuwa', async () => {
    const A = mk('dev-a');
    const B = mk('dev-b');
    const a = await A.store.create({ name: 'A', id: 'shared' });
    await B.store.create({ name: 'A', id: 'shared' });
    await cmdsFor(A.store, a.id).save('manual-1', 'z A');
    const change = (await A.store.saveBackend('shared').readChange('manual-1'))!;
    const bb = B.store.saveBackend('shared');
    expect(await bb.applyRemote(change)).toBe(true);
    expect(await bb.applyRemote(change)).toBe(false); // ten sam rev
    expect((await B.store.saveStore('shared').list()).map((m) => m.slot)).toEqual(['manual-1']);
    await A.store.saveStore('shared').delete('manual-1');
    const tomb = (await A.store.saveBackend('shared').readChange('manual-1'))!;
    expect(tomb.meta.deleted).toBe(true);
    expect(await bb.applyRemote(tomb)).toBe(true);
    expect(await B.store.saveStore('shared').list()).toEqual([]);
    expect(await bb.applyRemote({ ...change, meta: { ...change.meta, id: 'inny/manual-1' } })).toBe(
      false,
    );
  });

  it('profile: meta bez PIN-u, tombstone, applyRemoteProfile', async () => {
    const A = mk('dev-a');
    const B = mk('dev-b');
    const p = await A.store.create({ name: 'Ala', pin: '1234', id: 'pp' });
    const metas = await A.store.listSyncMeta();
    expect(metas.find((m) => m.id === 'pp')).toMatchObject({
      rev: 1,
      deviceId: 'dev-a',
      deleted: false,
    });
    const ch = (await A.store.readSyncChange('pp')) as SyncChange;
    expect(JSON.stringify(ch)).not.toContain('"pin"');
    expect(await B.store.applyRemoteProfile(ch)).toBe(true);
    expect((await B.store.list()).map((x) => x.name)).toEqual(['Ala']);
    expect((await B.store.get(p.id))!.hasPin).toBe(false);
    await A.store.remove('pp');
    const tomb = (await A.store.readSyncChange('pp'))!;
    expect(tomb.meta.deleted).toBe(true);
    expect(await B.store.applyRemoteProfile(tomb)).toBe(true);
    expect(await B.store.list()).toEqual([]);
  });

  it('zmiana PIN-u i lastPlayedAt nie podbija rev (PIN nie jest synchronizowany)', async () => {
    const { store } = mk();
    const p = await store.create({ name: 'A', id: 'q' });
    const rev = (await store.listSyncMeta()).find((m) => m.id === p.id)!.rev;
    await store.setPin('q', '1234');
    await store.touch('q');
    expect((await store.listSyncMeta()).find((m) => m.id === p.id)!.rev).toBe(rev);
  });
});

describe('eksport/import profilu', () => {
  it('round-trip tworzy nowy profil z zapisami, bez nadpisywania', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'Ala' });
    await store.patchSettings(a.id, { gameTextLanguage: 'english' });
    await cmdsFor(store, a.id).save('manual-2', 'r');
    const blob = await exportProfile(store, a.id);
    const r = await importProfile(blob, store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).not.toBe(a.id);
    expect(r.imported).toBe(1);
    expect(r.name).not.toBe('Ala');
    expect((await store.saveStore(r.id).list()).map((m) => m.slot)).toEqual(['manual-2']);
    expect(await store.getSettings(r.id)).toEqual({ gameTextLanguage: 'english' });
    expect((await store.list()).length).toBe(2);
  });

  it('import przepuszcza tylko whitelistowane ustawienia (smieci i zle typy odrzucone)', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'Ala' });
    await store.patchSettings(a.id, {
      gameTextLanguage: 'polish',
      classicMode: 'tak',
      hdMode: 'hd',
      volume: 5,
      fixes: { ok: true, zle: 'x' },
      locale: 'de',
    });
    const r = await importProfile(await exportProfile(store, a.id), store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await store.getSettings(r.id)).toEqual({
      gameTextLanguage: 'polish',
      fixes: { ok: true },
    });
  });

  it('import: zduplikowany slot jest pomijany (pierwszy wygrywa), nadmiar slotow obciety', async () => {
    const { store } = mk();
    const a = await store.create({ name: 'Ala' });
    await cmdsFor(store, a.id).save('manual-2', 'r');
    const blob = await exportProfile(store, a.id);
    const text = await new Response(
      blob.stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    const doc = JSON.parse(text) as { slots: unknown[] };
    doc.slots = [doc.slots[0], doc.slots[0]];
    const gz = await new Response(
      new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    const r = await importProfile(gz, store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imported).toBe(1);
    expect(r.errors).toEqual(['manual-2:duplicate-slot']);
  });

  it('zly plik daje profile-corrupt', async () => {
    const { store } = mk();
    expect(await importProfile(new Blob(['nie gzip']), store)).toEqual({
      ok: false,
      reason: 'profile-corrupt',
    });
  });
});

describe('AutosaveTimer', () => {
  it('odpala co interval, ponawia szybciej po bledzie, wylaczony dla 0', async () => {
    let calls = 0;
    let ok = true;
    const timer = new AutosaveTimer(
      {
        autosave: async () => {
          calls++;
          return ok ? { ok: true, slot: 'auto-0' } : { ok: false, reason: 'bad-slot' };
        },
      } as never,
      () => ({ onMapChange: true, rotate: 3, intervalMs: 1000 }),
      100,
    );
    expect(await timer.tick(0)).toBeNull(); // inicjalizacja
    expect(await timer.tick(500)).toBeNull();
    expect(calls).toBe(0);
    await timer.tick(1000);
    expect(calls).toBe(1);
    await timer.tick(1500);
    expect(calls).toBe(1);
    ok = false;
    await timer.tick(2000);
    expect(calls).toBe(2);
    await timer.tick(2100); // retry po 100 ms
    expect(calls).toBe(3);
    const off = new AutosaveTimer({ autosave: async () => ({ ok: true }) } as never, () => ({
      onMapChange: true,
      rotate: 3,
      intervalMs: 0,
    }));
    expect(await off.tick(10_000)).toBeNull();
  });
});
