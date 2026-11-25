import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CreditsScreen,
  DeathScreen,
  EndgameHost,
  EndgameScreen,
  MainMenuScreen,
  ThemeProvider,
  ToastProvider,
  createMockEndgame,
  creditsDurationSeconds,
  setLocale,
} from '../src';

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren) =>
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );

describe('EndgameScreen', () => {
  it('pokazuje tekst narratora w regionie aria-live i numer slajdu', () => {
    const m = createMockEndgame();
    wrap(<EndgameScreen view={m.view} commands={m.commands} />);
    const cap = screen.getByTestId('endgame-caption');
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.textContent).toContain('Arroyo');
    expect(screen.getByTestId('endgame-screen').getAttribute('data-art')).toBe('440');
  });

  it('klawisz Spacja, klik i przycisk Dalej wolaja advance', () => {
    const m = createMockEndgame();
    wrap(<EndgameScreen view={m.view} commands={m.commands} />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.click(screen.getByTestId('endgame-screen'));
    fireEvent.click(screen.getByTestId('endgame-next'));
    expect(m.calls).toEqual(['advance', 'advance', 'advance']);
  });

  it('slajd panoramy ma data-pan z kierunkiem', () => {
    const m = createMockEndgame();
    m.commands.advance();
    wrap(<EndgameScreen view={m.view} commands={m.commands} />);
    expect(screen.getByTestId('endgame-screen').getAttribute('data-pan')).toBe('-1');
  });

  it('uzywa artUrl gdy podany, inaczej obrazu zastepczego', () => {
    const m = createMockEndgame();
    wrap(<EndgameScreen view={m.view} commands={m.commands} artUrl={(a) => `/art/${a}.png`} />);
    expect(screen.getByTestId('endgame-art').getAttribute('src')).toBe('/art/440.png');
  });
});

describe('DeathScreen', () => {
  it('pokazuje narracje smierci; dowolny klawisz = dalej', () => {
    const m = createMockEndgame({ start: 'death', deathText: 'Tekst smierci' });
    wrap(<DeathScreen view={m.view} commands={m.commands} />);
    expect(screen.getByTestId('death-caption').textContent).toBe('Tekst smierci');
    fireEvent.keyDown(window, { key: 'x' });
    expect(m.calls).toEqual(['advance']);
  });

  it('skrot z Ctrl nie przerywa ekranu', () => {
    const m = createMockEndgame({ start: 'death' });
    wrap(<DeathScreen view={m.view} commands={m.commands} />);
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    expect(m.calls).toEqual([]);
  });
});

describe('CreditsScreen', () => {
  it('renderuje rodzaje wierszy z parseCredits (title/section/name/blank)', () => {
    const m = createMockEndgame({ start: 'credits' });
    wrap(<CreditsScreen view={m.view} commands={m.commands} />);
    const roll = screen.getByTestId('credits-roll');
    expect(roll.querySelectorAll('[data-kind="title"]').length).toBe(1);
    expect(roll.querySelectorAll('[data-kind="section"]').length).toBe(1);
    expect(roll.querySelectorAll('[data-kind="name"]').length).toBe(2);
    expect(roll.querySelectorAll('.f2-credits__line--blank').length).toBe(1);
  });

  it('ESC, klik, przycisk Pomin i koniec animacji koncza napisy', () => {
    const m = createMockEndgame({ start: 'credits' });
    wrap(<CreditsScreen view={m.view} commands={m.commands} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.animationEnd(screen.getByTestId('credits-roll'));
    fireEvent.click(screen.getByTestId('credits-skip'));
    expect(m.calls).toEqual(['finishCredits', 'finishCredits', 'finishCredits']);
  });

  it('czas przewijania: wiersze * 28 px + ekran 480 px przy 26 px/s', () => {
    expect(creditsDurationSeconds(461, 26, 480)).toBeCloseTo((461 * 28 + 480) / 26, 5);
  });
});

describe('MainMenuScreen', () => {
  it('akcje menu wolaja komendy; przycisk wyjscia widoczny gdy canQuit', () => {
    const m = createMockEndgame({ start: 'main-menu' });
    wrap(<MainMenuScreen view={m.view} commands={m.commands} version="0.1.0" />);
    fireEvent.click(screen.getByTestId('menu-new'));
    fireEvent.click(screen.getByTestId('menu-load'));
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.click(screen.getByTestId('menu-quit'));
    expect(m.calls).toEqual(['newGame', 'load', 'openSettings', 'quit']);
    expect(screen.getByTestId('menu-version').textContent).toContain('0.1.0');
  });

  it('w PWA (canQuit=false) przycisk wyjscia jest ukryty', () => {
    const m = createMockEndgame({ start: 'main-menu' });
    wrap(<MainMenuScreen view={m.view} commands={m.commands} canQuit={false} />);
    expect(screen.queryByTestId('menu-quit')).toBeNull();
  });

  it('po smierci: "Wczytaj ostatni zapis" tylko gdy jest zapis', () => {
    const none = createMockEndgame({ start: 'main-menu' });
    const r1 = wrap(<MainMenuScreen view={none.view} commands={none.commands} />);
    expect(screen.queryByTestId('menu-load-last')).toBeNull();
    r1.unmount();
    const some = createMockEndgame({ start: 'main-menu', lastSave: 'slot1' });
    wrap(<MainMenuScreen view={some.view} commands={some.commands} />);
    fireEvent.click(screen.getByTestId('menu-load-last'));
    expect(some.calls).toEqual(['loadLast']);
  });
});

describe('EndgameHost', () => {
  it('przebieg: slajdy, napisy, menu', () => {
    const m = createMockEndgame();
    wrap(<EndgameHost view={m.view} commands={m.commands} />);
    expect(screen.getByTestId('endgame-screen')).toBeTruthy();
    // trzy slajdy, potem napisy
    fireEvent.click(screen.getByTestId('endgame-next'));
    fireEvent.click(screen.getByTestId('endgame-next'));
    fireEvent.click(screen.getByTestId('endgame-next'));
    expect(screen.getByTestId('credits-screen')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('main-menu-screen')).toBeTruthy();
  });

  it('ekran game nie renderuje nic', () => {
    const m = createMockEndgame({ start: 'game' });
    const { container } = wrap(<EndgameHost view={m.view} commands={m.commands} />);
    expect(container.querySelector('[data-testid]')).toBeNull();
  });

  it('i18n EN: etykiety angielskie', () => {
    setLocale('en');
    const m = createMockEndgame({ start: 'main-menu' });
    wrap(<MainMenuScreen view={m.view} commands={m.commands} />);
    expect(screen.getByTestId('menu-new').textContent).toBe('New game');
  });
});
