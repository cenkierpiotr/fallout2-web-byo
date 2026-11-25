// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { DEFAULT_SETTINGS, UI_SCALE_PRESETS, settings } from '../../settings';
import { UiScaleControl } from './OptionsHost';

describe('UiScaleControl (opcje gry)', () => {
  beforeEach(() => {
    settings.value = { ...DEFAULT_SETTINGS };
  });
  it('trzy przyciski zmieniaja uiScale i zaznaczaja biezacy', async () => {
    render(<UiScaleControl />);
    fireEvent.click(screen.getByTestId('options-scale-large'));
    expect(settings.value.uiScale).toBe(UI_SCALE_PRESETS[2]);
    fireEvent.click(screen.getByTestId('options-scale-small'));
    expect(settings.value.uiScale).toBe(UI_SCALE_PRESETS[0]);
    expect((await screen.findByTestId('options-scale-small')).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
