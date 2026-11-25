// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { OptionsScreen, type OptionsFixItem, type OptionsValues } from '../../../src';

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
];

/** Fake zrodlo grafik: tylko podane klucze, w jednostkach FRM (OPBASE, OPBTN). */
const artSource = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name: string) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

const OPTS: Record<string, [number, number]> = {
  'opts.bg': [164, 217],
  'opts.tab.up': [137, 34],
  'opts.tab.dn': [137, 34],
};

const renderWithArt = (
  over: Partial<Parameters<typeof OptionsScreen>[0]> = {},
  layout?: 'pc' | 'touch',
) => {
  const onChange = vi.fn();
  const onFixChange = vi.fn();
  const utils = render(
    <UiArtProvider source={artSource(OPTS)} {...(layout ? { layout } : {})}>
      <OptionsScreen
        values={values}
        fixes={fixes}
        detected="desktop"
        onChange={onChange}
        onFixChange={onFixChange}
        {...over}
      />
    </UiArtProvider>,
  );
  return { ...utils, onChange, onFixChange };
};

describe('OptionsScreen: fallback bez grafik', () => {
  it('bez providera DOM jak dotychczas: 5 tabow, panel dzwieku, brak sceny art', () => {
    const { container } = render(
      <OptionsScreen
        values={values}
        fixes={fixes}
        detected="desktop"
        onChange={() => {}}
        onFixChange={() => {}}
      />,
    );
    expect(container.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getAllByRole('tab').length).toBe(5);
    expect(screen.getByTestId('options-sound')).toBeTruthy();
  });

  it('z providerem bez grafiki opts.bg tez fallback (art null)', () => {
    const { container } = render(
      <UiArtProvider source={artSource({})}>
        <OptionsScreen
          values={values}
          fixes={fixes}
          detected="desktop"
          onChange={() => {}}
          onFixChange={() => {}}
        />
      </UiArtProvider>,
    );
    expect(container.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getByTestId('options-sound')).toBeTruthy();
  });
});

describe('OptionsScreen: skorka FRM z grafikami', () => {
  it('ta sama struktura testid plus scena ArtStage z tlem opts.bg', () => {
    const { container } = renderWithArt();
    const stage = container.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage).toBeTruthy();
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('164/217');
    expect(screen.getByTestId('options-screen')).toBeTruthy();
    expect(screen.getAllByRole('tab').length).toBe(5);
    expect(screen.getByTestId('options-sound')).toBeTruthy();
  });

  it('interakcje dzialaja na oskórowanym ekranie: slider i selecty', () => {
    const { onChange } = renderWithArt();
    const slider = screen.getByRole('slider', { name: 'Głośność główna' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('masterVolume', 85);

    fireEvent.click(screen.getByRole('tab', { name: 'Gra' }));
    fireEvent.change(screen.getByLabelText('Trudność gry'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith('gameDifficulty', 2);

    fireEvent.click(screen.getByRole('tab', { name: 'Poprawki' }));
    expect(screen.getByText('Opis A')).toBeTruthy();
  });

  it('tresc wszystkich zakladek jest w tabpanelu z aria-controls, etykiety widoczne', () => {
    const { container } = renderWithArt();
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('f2-options-panel');
    expect(screen.getByRole('tab', { name: 'Gra' }).getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByTestId('options-sound')).toBeTruthy();
    expect(container.querySelectorAll('.f2-options__tablabel').length).toBe(5);
    fireEvent.click(screen.getByRole('tab', { name: 'Gra' }));
    expect(within(screen.getByRole('tabpanel')).getByLabelText('Trudność gry')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Poprawki' }));
    expect(
      within(screen.getByRole('tabpanel')).getByRole('switch', { name: /Tryb klasyczny/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Język' }));
    expect(within(screen.getByRole('tabpanel')).getByLabelText('Język interfejsu')).toBeTruthy();
    expect(container.querySelector('.f2-art-extras')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Sterowanie' }));
    expect(within(screen.getByRole('tabpanel')).getByLabelText('Profil wejścia')).toBeTruthy();
  });

  it('strzalki Left/Right przelaczaja zakladki, aktywna uzywa grafiki dn', () => {
    const { container } = renderWithArt();
    const first = screen.getByRole('tab', { name: 'Dźwięk' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Język' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Język' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Dźwięk' }).getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe(
      'vertical',
    );
  });
});

describe('OptionsScreen: dotyk w skorce FRM', () => {
  it('scena ma minTouch, taby i interakcje >= 44 CSS px', () => {
    const { container } = renderWithArt({ detected: 'touch' }, 'touch');
    const stage = container.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.getAttribute('data-min-touch')).toBe('1');
    const tab = screen.getAllByRole('tab')[0] as HTMLElement;
    expect(parseInt(tab.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(tab.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    // jsdom nie liczy CSS: sprawdzamy znacznik data-touch, od ktorego options.css wymusza 44px
    expect(container.querySelector('.f2-options--skin')?.getAttribute('data-touch')).toBe('1');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('slider').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Gra' }));
    expect(within(screen.getByRole('tabpanel')).getAllByRole('combobox').length).toBeGreaterThan(0);
  });
});
