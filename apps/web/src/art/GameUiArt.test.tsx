// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLayoutMode } from '@f2/ui';
import { DEFAULT_SETTINGS, settings } from '../settings';
import { GameUiArt, layoutFromSettings } from './GameUiArt';
import { client } from '../state/game-folder';

/** Dziecko odczytujace uklad z kontekstu UiArtProvider (tak jak ekrany skorki). */
function Probe() {
  return <p data-testid="probe">{useLayoutMode()}</p>;
}

// Bez danych gry: zaden DecodeClient, zaden ladowany FRM — source zostaje null (fallback 1:1).
beforeEach(() => {
  client.value = null;
  window.innerWidth = 1024;
  settings.value = { ...DEFAULT_SETTINGS };
});
afterEach(cleanup);

describe('layoutFromSettings: ustawienie Input -> uklad skorki', () => {
  it('jawny touch wymusza touch', () => {
    expect(layoutFromSettings({ inputProfile: 'touch' })).toBe('touch');
  });
  it('jawny desktop wymusza pc', () => {
    expect(layoutFromSettings({ inputProfile: 'desktop' })).toBe('pc');
  });
  it('auto i hybrid zostawiaja autodetekcje (undefined)', () => {
    expect(layoutFromSettings({ inputProfile: 'auto' })).toBeUndefined();
    expect(layoutFromSettings({ inputProfile: 'hybrid' })).toBeUndefined();
  });
});

describe('GameUiArt: provider przekazuje uklad wg Input', () => {
  it('brak wyboru (auto) = autodetekcja urzadzenia', () => {
    settings.value = { ...DEFAULT_SETTINGS, inputProfile: 'auto' };
    render(
      <GameUiArt>
        <Probe />
      </GameUiArt>,
    );
    // jsdom: fine pointer, szerokosc > 900 => autodetekcja pc.
    expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('pc');
  });
  it('jawny wybor touch wygrywa z autodetekcja', () => {
    settings.value = { ...DEFAULT_SETTINGS, inputProfile: 'touch' };
    render(
      <GameUiArt>
        <Probe />
      </GameUiArt>,
    );
    expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('touch');
  });
  it('jawny wybor desktop wygrywa z autodetekcja (na waskim ekranie)', () => {
    settings.value = { ...DEFAULT_SETTINGS, inputProfile: 'desktop' };
    window.innerWidth = 320; // autodetekcja dalaby touch
    render(
      <GameUiArt>
        <Probe />
      </GameUiArt>,
    );
    expect(document.querySelector('[data-testid="probe"]')!.textContent).toBe('pc');
  });
});
