import { describe, expect, it, vi } from 'vitest';
import type { SaveMeta, SaveStore } from '@f2/engine-core';
import { createMenuSavesCommands, latestSaveSlot } from './menu-saves';

const meta = (slot: string, realTime: number): SaveMeta => ({
  slot,
  name: '',
  characterName: 'Wybraniec',
  level: 1,
  location: 'ARTEMPLE',
  gameDate: '',
  realTime,
  thumbnail: null,
  engineVersion: 'm4',
});

describe('latestSaveSlot', () => {
  it('zwraca slot o najnowszym czasie rzeczywistym (dowolnego rodzaju)', () => {
    expect(latestSaveSlot([meta('manual-0', 5), meta('auto-1', 9), meta('quick', 7)])).toBe(
      'auto-1',
    );
  });
  it('null bez zapisow', () => {
    expect(latestSaveSlot([])).toBeNull();
  });
});

function setup(read: unknown, metas: SaveMeta[] = [meta('manual-0', 1)]) {
  const store = {
    list: vi.fn(async () => metas),
    readChecked: vi.fn(async () => read),
    delete: vi.fn(async () => undefined),
  };
  const onLoad = vi.fn();
  const refresh = vi.fn(async () => undefined);
  const cmds = createMenuSavesCommands({
    store: store as unknown as Pick<SaveStore, 'readChecked' | 'delete'>,
    metas: () => metas,
    onLoad,
    refresh,
  });
  return { store, onLoad, refresh, cmds };
}

describe('createMenuSavesCommands', () => {
  it('load: poprawny zapis wola onLoad z faktycznym slotem', async () => {
    const { cmds, onLoad } = setup({ meta: {} });
    expect(await cmds.load('manual-0')).toEqual({ ok: true });
    expect(onLoad).toHaveBeenCalledWith('manual-0');
  });
  it('load: slot "auto" rozwiazuje sie na najnowszy auto-N', async () => {
    const { cmds, onLoad } = setup({ meta: {} }, [meta('auto-0', 1), meta('auto-2', 3)]);
    await cmds.load('auto');
    expect(onLoad).toHaveBeenCalledWith('auto-2');
  });
  it('load: brak zapisu, uszkodzony i nowszy daja kody bledow bez wczytania', async () => {
    const a = setup(null);
    expect(await a.cmds.load('manual-0')).toEqual({ ok: false, code: 'save-failed' });
    const q = setup(null);
    expect(await q.cmds.load('quick')).toEqual({ ok: false, code: 'save-no-quick' });
    const c = setup({ error: 'save-corrupt' });
    expect(await c.cmds.load('manual-0')).toEqual({ ok: false, code: 'save-corrupt' });
    const v = setup({ error: 'save-too-new' });
    expect(await v.cmds.load('manual-0')).toEqual({ ok: false, code: 'save-version' });
    for (const x of [a, q, c, v]) expect(x.onLoad).not.toHaveBeenCalled();
  });
  it('remove: kasuje slot i odswieza liste', async () => {
    const { cmds, store, refresh } = setup({ meta: {} });
    expect(await cmds.remove('manual-0')).toEqual({ ok: true });
    expect(store.delete).toHaveBeenCalledWith('manual-0');
    expect(refresh).toHaveBeenCalled();
  });
  it('save/export/import niedostepne w menu', async () => {
    const { cmds } = setup({ meta: {} });
    expect(await cmds.save('manual-0')).toEqual({ ok: false, code: 'save-failed' });
    expect(await cmds.exportSlot('manual-0')).toEqual({ ok: false, code: 'save-failed' });
    expect(await cmds.importFile({} as File)).toEqual({ ok: false, code: 'save-failed' });
  });
});
