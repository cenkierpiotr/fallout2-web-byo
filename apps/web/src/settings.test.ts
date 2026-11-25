import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SPEED_FACTOR, effectiveFixes, normalizeSettings } from './settings';

describe('ustawienia: normalizacja', () => {
  it('puste dane daja domyslne', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });
  it('odrzuca bledne wartosci i przycina glosnosc', () => {
    const s = normalizeSettings({
      gameDifficulty: 7 as never,
      gameSpeed: 'x' as never,
      gameTextLanguage: 'de' as never,
      volume: { master: 3, music: -1, sfx: NaN, speech: 0.5 },
      fixes: { pathfinderFix: false, zle: 'tak' as never },
    });
    expect(s.gameDifficulty).toBe(1);
    expect(s.gameSpeed).toBe('normal');
    expect(s.gameTextLanguage).toBe('auto');
    expect(s.volume).toEqual({
      master: 1,
      music: 0,
      sfx: DEFAULT_SETTINGS.volume.sfx,
      speech: 0.5,
    });
    expect(s.fixes).toEqual({ pathfinderFix: false });
  });
  it('zachowuje poprawne wybory', () => {
    const s = normalizeSettings({
      gameDifficulty: 2,
      combatDifficulty: 0,
      gameSpeed: 'fast',
      classicMode: true,
    });
    expect([s.gameDifficulty, s.combatDifficulty, s.gameSpeed, s.classicMode]).toEqual([
      2,
      0,
      'fast',
      true,
    ]);
  });
});

describe('ustawienia: poprawki i tempo', () => {
  it('effectiveFixes: domyslnie wlaczone, nadpisanie i tryb klasyczny', () => {
    expect(effectiveFixes(DEFAULT_SETTINGS).pathfinderFix).toBe(true);
    expect(
      effectiveFixes({ fixes: { pathfinderFix: false }, classicMode: false }).pathfinderFix,
    ).toBe(false);
    expect(effectiveFixes({ fixes: {}, classicMode: true }).pathfinderFix).toBe(false);
  });
  it('mnozniki tempa rosna', () => {
    expect(SPEED_FACTOR.slow).toBeLessThan(SPEED_FACTOR.normal);
    expect(SPEED_FACTOR.normal).toBeLessThan(SPEED_FACTOR.fast);
  });
});

describe('uiScale', () => {
  it('domyslnie 1, przycina do zakresu, odrzuca nie-liczby', async () => {
    const { UI_SCALE_MAX, UI_SCALE_MIN, applyUiScale, clampUiScale } = await import('./settings');
    expect(DEFAULT_SETTINGS.uiScale).toBe(1);
    expect(normalizeSettings({ uiScale: 9 }).uiScale).toBe(UI_SCALE_MAX);
    expect(normalizeSettings({ uiScale: 0.1 }).uiScale).toBe(UI_SCALE_MIN);
    expect(normalizeSettings({ uiScale: 'duzy' as never }).uiScale).toBe(1);
    expect(normalizeSettings({ uiScale: 1.25 }).uiScale).toBe(1.25);
    expect(clampUiScale(NaN)).toBe(1);
    const calls: string[][] = [];
    applyUiScale({ style: { setProperty: (n, v) => calls.push([n, v]) } }, 1.25);
    expect(calls).toEqual([['--ui-scale', '1.25']]);
  });
});

describe('ustawienia: grafika (preset, postFx, lighting, HD)', () => {
  it('domyslnie auto, HD, postFx i oswietlenie 2.5D wlaczone, bez workera renderu', () => {
    expect(DEFAULT_SETTINGS.graphicsPreset).toBe('auto');
    expect(DEFAULT_SETTINGS.hdMode).toBe('hd');
    expect(DEFAULT_SETTINGS.hdRgba).toBe(true);
    expect(DEFAULT_SETTINGS.hdTiles).toBe(true);
    expect(DEFAULT_SETTINGS.postFx).toBe(true);
    expect(DEFAULT_SETTINGS.lighting).toBe(true);
    expect(DEFAULT_SETTINGS.renderWorker).toBe(false);
  });
  it('zachowuje poprawne wartosci i reczne wylaczenie', () => {
    for (const preset of ['niski', 'sredni', 'wysoki', 'ultra', 'retro', 'auto'] as const) {
      expect(normalizeSettings({ graphicsPreset: preset }).graphicsPreset).toBe(preset);
    }
    const off = normalizeSettings({
      postFx: false,
      lighting: false,
      hdMode: 'original',
      hdRgba: false,
      hdTiles: false,
    });
    expect(off.postFx).toBe(false);
    expect(off.lighting).toBe(false);
    expect(off.hdMode).toBe('original');
    expect(off.hdRgba).toBe(false);
    expect(off.hdTiles).toBe(false);
    const on = normalizeSettings({ postFx: true, renderWorker: true });
    expect(on.postFx).toBe(true);
    expect(on.renderWorker).toBe(true);
  });
  it('odrzuca bledne wartosci (wraca do domyslnych)', () => {
    const s = normalizeSettings({
      graphicsPreset: 'extreme' as never,
      hdMode: '4k' as never,
      postFx: 'tak' as never,
      renderWorker: 1 as never,
    });
    expect(s.graphicsPreset).toBe('auto');
    expect(s.hdMode).toBe('hd');
    expect(s.postFx).toBe(true);
    expect(s.renderWorker).toBe(false);
  });
  it('brak nowych kluczy w starych zapisach = domyslne', () => {
    const s = normalizeSettings({ gameDifficulty: 2 });
    expect(s.graphicsPreset).toBe('auto');
    expect(s.postFx).toBe(true);
    expect(s.lighting).toBe(true);
    expect(s.renderWorker).toBe(false);
  });
});
