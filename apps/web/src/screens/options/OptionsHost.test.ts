// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../../settings';
import { applyFixChange, applyOptionChange, fixItemsOf, optionsValuesOf } from './OptionsHost';

describe('OptionsHost', () => {
  beforeEach(() => {
    settings.value = { ...DEFAULT_SETTINGS };
  });

  it('glosnosc 0..100 mapuje na 0..1', () => {
    applyOptionChange('musicVolume', 40);
    expect(settings.value.volume.music).toBeCloseTo(0.4);
    expect(optionsValuesOf(settings.value).musicVolume).toBe(40);
  });

  it('trudnosc, tempo i profil trafiaja do ustawien', () => {
    applyOptionChange('gameDifficulty', 2);
    applyOptionChange('gameSpeed', 'fast');
    applyOptionChange('profile', 'touch');
    expect(settings.value.gameDifficulty).toBe(2);
    expect(settings.value.gameSpeed).toBe('fast');
    expect(settings.value.inputProfile).toBe('touch');
  });

  it('poprawki: domyslnie wlaczone, przelaczenie zapisuje nadpisanie', () => {
    expect(fixItemsOf(settings.value, 'pl').find((f) => f.id === 'pathfinderFix')?.enabled).toBe(
      true,
    );
    applyFixChange('pathfinderFix', false);
    expect(fixItemsOf(settings.value, 'pl').find((f) => f.id === 'pathfinderFix')?.enabled).toBe(
      false,
    );
    expect(settings.value.fixes['pathfinderFix']).toBe(false);
  });

  it('tryb klasyczny zapisany', () => {
    applyOptionChange('classicMode', true);
    expect(settings.value.classicMode).toBe(true);
  });
});
