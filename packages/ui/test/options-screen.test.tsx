import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { OptionsScreen, type OptionsFixItem, type OptionsValues } from '../src';

const values: OptionsValues = {
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 70,
  speechVolume: 90,
  language: 'pl',
  gameTextLanguage: 'auto',
  gameDifficulty: 1,
  combatDifficulty: 1,
  gameSpeed: 'normal',
  profile: 'auto',
  classicMode: false,
};

const fixes: OptionsFixItem[] = [
  {
    id: 'pathfinderFix',
    title: 'Pathfinder',
    desc: 'Opis A',
    status: 'active',
    confidence: 'D',
    enabled: true,
  },
  {
    id: 'dialogueFix',
    title: 'Dialogi',
    desc: 'Opis B',
    status: 'pending',
    confidence: 'Z',
    enabled: false,
  },
  {
    id: 'contentPatch',
    title: 'Pakiet tresci',
    desc: 'Opis C',
    status: 'external',
    confidence: 'D',
    enabled: true,
  },
];

const setup = (over: Partial<Parameters<typeof OptionsScreen>[0]> = {}) => {
  const onChange = vi.fn();
  const onFixChange = vi.fn();
  render(
    <OptionsScreen
      values={values}
      fixes={fixes}
      detected="desktop"
      onChange={onChange}
      onFixChange={onFixChange}
      {...over}
    />,
  );
  return { onChange, onFixChange };
};

describe('OptionsScreen', () => {
  it('pokazuje zakladki i domyslnie dzwiek', () => {
    setup();
    expect(screen.getAllByRole('tab').length).toBe(5);
    expect(screen.getByTestId('options-sound')).toBeTruthy();
  });

  it('zmiana trudnosci wola onChange', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Gra' }));
    fireEvent.change(screen.getByLabelText('Trudność gry'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith('gameDifficulty', 2);
  });

  it('zmiana tempa gry', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Gra' }));
    fireEvent.change(screen.getByLabelText('Tempo gry'), { target: { value: 'fast' } });
    expect(onChange).toHaveBeenCalledWith('gameSpeed', 'fast');
  });

  it('jezyk interfejsu i pakiet tekstow', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Język' }));
    fireEvent.change(screen.getByLabelText('Język interfejsu'), { target: { value: 'en' } });
    expect(onChange).toHaveBeenCalledWith('language', 'en');
    fireEvent.change(screen.getByLabelText('Teksty gry'), { target: { value: 'polish' } });
    expect(onChange).toHaveBeenCalledWith('gameTextLanguage', 'polish');
  });

  it('pakiet polski wylaczony gdy niedostepny', () => {
    setup({ langPackAvailable: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Język' }));
    const opt = screen.getByRole('option', { name: /pakiet tłumaczeń/ }) as HTMLOptionElement;
    expect(opt.disabled).toBe(true);
  });

  it('sterowanie: profil', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Sterowanie' }));
    fireEvent.change(screen.getByLabelText('Profil wejścia'), { target: { value: 'touch' } });
    expect(onChange).toHaveBeenCalledWith('profile', 'touch');
  });

  it('poprawki: przelacznik, opis, wylaczone pending', () => {
    const { onFixChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Poprawki' }));
    expect(screen.getByText('Opis A')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /Pathfinder/ }));
    expect(onFixChange).toHaveBeenCalledWith('pathfinderFix', false);
    const pending = screen.getByRole('switch', { name: /Dialogi/ });
    expect(
      (pending as HTMLButtonElement).disabled || pending.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(screen.getByText('w przygotowaniu')).toBeTruthy();
  });

  it('tryb klasyczny', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Poprawki' }));
    fireEvent.click(screen.getByRole('switch', { name: /Tryb klasyczny/ }));
    expect(onChange).toHaveBeenCalledWith('classicMode', true);
  });
});
