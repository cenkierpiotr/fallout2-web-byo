import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MemoryBackend,
  SettingsStore,
  type SettingsBackend,
} from '../src/settings-store.js';

describe('SettingsStore', () => {
  it('domyslne wartosci przed load', () => {
    const s = new SettingsStore(new MemoryBackend());
    expect(s.get('profile')).toBe('auto');
    expect(s.snapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it('gameTextLanguage: domyslnie auto, przyjmuje auto/english/polish, odrzuca reszte', async () => {
    const s = new SettingsStore(new MemoryBackend({ gameTextLanguage: 'klingon' }));
    await s.load();
    expect(s.get('gameTextLanguage')).toBe('auto');
    const s2 = new SettingsStore(new MemoryBackend({ gameTextLanguage: 'polish' }));
    await s2.load();
    expect(s2.get('gameTextLanguage')).toBe('polish');
  });

  it('set zapisuje, powiadamia subskrybentow i mozna sie wypisac', async () => {
    const s = new SettingsStore(new MemoryBackend());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    await s.set('profile', 'touch');
    expect(s.get('profile')).toBe('touch');
    expect(fn).toHaveBeenCalledWith('profile', 'touch');
    off();
    await s.set('theme', 'retro');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('powiadomienie jest synchroniczne (natychmiastowa zmiana, bez czekania na zapis)', () => {
    const slow: SettingsBackend = {
      load: () => Promise.resolve({}),
      save: () => new Promise(() => undefined),
    };
    const s = new SettingsStore(slow);
    const fn = vi.fn();
    s.subscribe(fn);
    void s.set('fontScale', 1.3);
    expect(fn).toHaveBeenCalledWith('fontScale', 1.3);
    expect(s.get('fontScale')).toBe(1.3);
  });

  it('nie powiadamia przy tej samej wartosci', async () => {
    const s = new SettingsStore(new MemoryBackend());
    const fn = vi.fn();
    s.subscribe(fn);
    await s.set('profile', 'auto');
    expect(fn).not.toHaveBeenCalled();
  });

  it('load odtwarza zapisane wartosci i ignoruje niepoprawne', async () => {
    const b = new MemoryBackend({
      profile: 'hybrid',
      fontScale: 99,
      theme: 'nieistniejacy',
      autosave: false,
      obce: 1,
    });
    const s = new SettingsStore(b);
    await s.load();
    expect(s.get('profile')).toBe('hybrid');
    expect(s.get('autosave')).toBe(false);
    expect(s.get('theme')).toBe(DEFAULT_SETTINGS.theme);
    expect(s.get('fontScale')).toBe(1.6);
  });

  it('zapis trafia do backendu i przezywa ponowne utworzenie sklepu', async () => {
    const b = new MemoryBackend();
    await new SettingsStore(b).set('colorBlindMode', 'deuteranopia');
    const s2 = new SettingsStore(b);
    await s2.load();
    expect(s2.get('colorBlindMode')).toBe('deuteranopia');
  });

  it('odrzuca niepoprawna wartosc przy set', async () => {
    const s = new SettingsStore(new MemoryBackend());
    await expect(s.set('profile', 'foo' as never)).rejects.toThrow();
    expect(s.get('profile')).toBe('auto');
  });
});
