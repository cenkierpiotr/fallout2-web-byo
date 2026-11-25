import { describe, expect, it, vi } from 'vitest';
import { MemoryBackend, SettingsStore } from '../src/settings-store.js';
import { bindProfile, type EffectiveProfile } from '../src/profile-binding.js';

const resolve = (s: 'auto' | EffectiveProfile) => (s === 'auto' ? 'touch' : s);
const toUi = (p: EffectiveProfile) => ({
  profile: p === 'touch' ? ('touch' as const) : ('desktop' as const),
  gestures: p !== 'desktop',
});

describe('bindProfile', () => {
  it('stosuje profil od razu i przy kazdej zmianie, bez przeladowania', async () => {
    const store = new SettingsStore(new MemoryBackend());
    const setUiProfile = vi.fn();
    const setGestures = vi.fn();
    const off = bindProfile(store, {
      readEnv: () => ({ pointerCoarse: true, maxTouchPoints: 5, width: 390 }),
      resolve,
      toUi,
      setUiProfile,
      setGestures,
    });
    expect(setUiProfile).toHaveBeenLastCalledWith('touch');
    expect(setGestures).toHaveBeenLastCalledWith(true);
    await store.set('profile', 'desktop');
    expect(setUiProfile).toHaveBeenLastCalledWith('desktop');
    expect(setGestures).toHaveBeenLastCalledWith(false);
    await store.set('profile', 'hybrid');
    expect(setUiProfile).toHaveBeenLastCalledWith('desktop');
    expect(setGestures).toHaveBeenLastCalledWith(true);
    const calls = setUiProfile.mock.calls.length;
    await store.set('theme', 'retro');
    expect(setUiProfile.mock.calls.length).toBe(calls);
    off();
    await store.set('profile', 'touch');
    expect(setUiProfile.mock.calls.length).toBe(calls);
  });
});
