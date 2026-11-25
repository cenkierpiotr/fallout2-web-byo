import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { createMockEndgame, DeathScreen, MainMenuScreen } from '../../../src/screens/endgame';

beforeEach(() => setLocale('pl'));

const CSS_PATH = resolve(__dirname, '../../../src/screens/endgame/endgame.css');
const cssText = () => readFileSync(CSS_PATH, 'utf8');

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren, source?: UiArtSource | null, layout?: 'pc' | 'touch') =>
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>{ui}</ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});

describe('MainMenuScreen - skorka FRM', () => {
  it('bez sztuki: struktura fallback bez zmian (te same testidy i akcje)', () => {
    const m = createMockEndgame({ start: 'main-menu' });
    wrap(<MainMenuScreen view={m.view} commands={m.commands} version="0.1.0" />);
    const root = screen.getByTestId('main-menu-screen');
    expect(root.className).toContain('f2-mainmenu');
    expect(root.className).not.toContain('f2-mainmenu--art');
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(root.querySelector('h1.f2-mainmenu__title')).toBeTruthy();
    for (const id of ['menu-new', 'menu-load', 'menu-settings', 'menu-credits', 'menu-quit']) {
      expect(screen.queryByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByTestId('menu-load-last')).toBeNull();
    fireEvent.click(screen.getByTestId('menu-new'));
    expect(m.calls).toEqual(['newGame']);
  });

  it('z sztuka (PC): te same testidy, tlo 640/480 i komendy', () => {
    const m = createMockEndgame({ start: 'main-menu', lastSave: 'slot1' });
    wrap(
      <MainMenuScreen view={m.view} commands={m.commands} version="0.1.0" />,
      sourceOf({ 'menu.bg': [640, 480] }),
      'pc',
    );
    const stage = document.querySelector('[data-art-stage]') as HTMLElement | null;
    expect(stage).toBeTruthy();
    expect(stage!.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    expect(stage!.style.backgroundImage).toContain('menu.bg.png');
    for (const id of [
      'menu-load-last',
      'menu-new',
      'menu-load',
      'menu-settings',
      'menu-credits',
      'menu-quit',
    ]) {
      expect(screen.getByTestId(id).closest('button')).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId('menu-load-last'));
    fireEvent.click(screen.getByTestId('menu-new'));
    fireEvent.click(screen.getByTestId('menu-load'));
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.click(screen.getByTestId('menu-credits'));
    fireEvent.click(screen.getByTestId('menu-quit'));
    expect(m.calls).toEqual(['loadLast', 'newGame', 'load', 'openSettings', 'showCredits', 'quit']);
  });

  it('z sztuka (PC): canQuit=false ukrywa wyjscie; wersja w scenie', () => {
    const m = createMockEndgame({ start: 'main-menu' });
    wrap(
      <MainMenuScreen view={m.view} commands={m.commands} version="9.9.9" canQuit={false} />,
      sourceOf({ 'menu.bg': [640, 480] }),
      'pc',
    );
    expect(screen.queryByTestId('menu-quit')).toBeNull();
    const ver = screen.getByTestId('menu-version');
    expect(ver.textContent).toContain('9.9.9');
    expect(ver.closest('[data-art-stage]')).toBeTruthy();
  });

  it('z sztuka (touch): kazdy wpis ma cel dotykowy min 44px', () => {
    const m = createMockEndgame({ start: 'main-menu', lastSave: 'slot1' });
    wrap(
      <MainMenuScreen view={m.view} commands={m.commands} />,
      sourceOf({ 'menu.bg': [640, 480] }),
      'touch',
    );
    const list = document.querySelector('.f2-mainmenu__list');
    expect(list).toBeTruthy();
    for (const id of [
      'menu-load-last',
      'menu-new',
      'menu-load',
      'menu-settings',
      'menu-credits',
      'menu-quit',
    ]) {
      const btn = screen.getByTestId(id).closest('button') as HTMLElement | null;
      expect(btn).toBeTruthy();
      expect(btn!.style.minHeight).toBe('44px');
      expect(btn!.style.minWidth).toBe('44px');
    }
  });

  it('lista touch jest wycentrowana pionowo, na prawo od wypalonych plytek (styl css)', () => {
    const css = cssText();
    const rules = css.match(/\.f2-mainmenu--art \.f2-mainmenu__list \{[^}]+\}/g) ?? [];
    const rule = rules.find((r) => r.includes('position')) ?? '';
    expect(rule).toBeTruthy();
    expect(rule).toContain('top: 50%');
    expect(rule).toContain('left: calc(100% * 222 / 640)');
    expect(rule).toContain('transform: translateY(-50%)');
  });

  it('css nie zawiera martwej klasy entryat (wrapper generuje ArtAt jako f2-art-at)', () => {
    expect(cssText()).not.toContain('entryat');
  });
});

describe('DeathScreen - skorka FRM', () => {
  it('art z providera gdy brak artUrl; artUrl wygrywa gdy podane', () => {
    const m = createMockEndgame({ start: 'death' });
    const r1 = wrap(
      <DeathScreen view={m.view} commands={m.commands} />,
      sourceOf({ 'menu.death': [640, 480] }),
    );
    const img1 = screen.getByTestId('death-art') as HTMLElement;
    expect(img1.tagName).toBe('IMG');
    expect(img1.getAttribute('src')).toContain('menu.death.png');
    r1.unmount();

    wrap(
      <DeathScreen view={m.view} commands={m.commands} artUrl={() => 'custom-309.png'} />,
      sourceOf({ 'menu.death': [640, 480] }),
    );
    const img2 = screen.getByTestId('death-art') as HTMLElement;
    expect(img2.getAttribute('src')).toContain('custom-309.png');
  });

  it('bez sztuki i bez artUrl: placeholder bez zmian', () => {
    const m = createMockEndgame({ start: 'death' });
    wrap(<DeathScreen view={m.view} commands={m.commands} />);
    const art = screen.getByTestId('death-art') as HTMLElement;
    expect(art.tagName).toBe('DIV');
  });
});
