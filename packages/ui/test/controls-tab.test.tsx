import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ControlsTab, type ControlsValues } from '../src';

const values: ControlsValues = {
  profile: 'auto',
  theme: 'modern',
  fontScale: 1,
  language: 'pl',
  gameTextLanguage: 'english',
  autosave: true,
  showSkillCheckPercent: false,
  reduceMotion: false,
  highContrast: false,
  colorBlindMode: 'none',
};

describe('ControlsTab', () => {
  it('pokazuje wykryty profil przy opcji auto', () => {
    render(<ControlsTab values={values} detected="touch" onChange={() => {}} />);
    expect(screen.getByText(/Automatycznie \(Dotyk\)/)).toBeTruthy();
  });

  it('zmiana profilu wola onChange', () => {
    const onChange = vi.fn();
    render(<ControlsTab values={values} detected="desktop" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Profil wejscia'), { target: { value: 'touch' } });
    expect(onChange).toHaveBeenCalledWith('profile', 'touch');
  });

  it('przelaczniki zglaszaja nowa wartosc', () => {
    const onChange = vi.fn();
    render(<ControlsTab values={values} detected="desktop" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /procent szansy/ }));
    expect(onChange).toHaveBeenCalledWith('showSkillCheckPercent', true);
    fireEvent.click(screen.getByRole('switch', { name: 'Autozapis' }));
    expect(onChange).toHaveBeenCalledWith('autosave', false);
  });
});
