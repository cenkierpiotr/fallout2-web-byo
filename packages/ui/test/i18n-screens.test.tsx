import { act, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from '../src/components/Modal';
import { ControlsTab, type ControlsValues } from '../src/screens/settings/ControlsTab';
import { setLocale } from '../src/i18n';

const values: ControlsValues = {
  profile: 'auto',
  theme: 'modern',
  fontScale: 1,
  language: 'pl',
  gameTextLanguage: 'auto',
  autosave: true,
  showSkillCheckPercent: false,
  reduceMotion: false,
  highContrast: false,
  colorBlindMode: 'none',
};

afterEach(() => setLocale('pl'));

describe('teksty UI przez i18n', () => {
  it('ControlsTab: PL i EN, przelaczenie bez przeladowania', () => {
    render(<ControlsTab values={values} detected="touch" onChange={() => {}} />);
    expect(screen.getByLabelText('Profil wejscia')).toBeTruthy();
    expect(screen.getByText('Automatycznie (Dotyk)')).toBeTruthy();
    act(() => setLocale('en'));
    expect(screen.getByLabelText('Input profile')).toBeTruthy();
    expect(screen.getByText('Automatic (Touch)')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Autosave' })).toBeTruthy();
  });

  it('Modal: przycisk zamkniecia tlumaczony', () => {
    render(
      <Modal open title="T" onClose={() => {}}>
        x
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeTruthy();
    act(() => setLocale('en'));
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
