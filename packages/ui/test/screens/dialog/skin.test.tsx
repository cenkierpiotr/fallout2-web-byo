// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale, UiArtProvider, type UiArtSource } from '../../../src';
import { DialogScreen } from '../../../src/screens/dialog/DialogScreen';
import { createMockDialog } from '../../../src/screens/dialog/mock-store';

/** Zrodlo grafik jak w testach warstwy art: klucze to nazwy logiczne, brakujaca = null (nie blad). */
const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

beforeEach(() => setLocale('pl'));

const mount = (opts: { source?: UiArtSource | null; profile?: 'desktop' | 'touch' } = {}) => {
  const m = createMockDialog();
  const r = render(
    <UiArtProvider source={opts.source ?? null}>
      <DialogScreen
        view={{ dialog: m.dialog }}
        commands={m.commands}
        profile={opts.profile ?? 'desktop'}
      />
    </UiArtProvider>,
  );
  return { m, ...r };
};

const panelOf = (): HTMLElement =>
  screen.getByTestId('dialog-screen').querySelector('.f2-dialog__panel') as HTMLElement;

describe('DialogScreen: skorka FRM (zadanie 9)', () => {
  it('bez providera grafik panel nie ma data-art ani stylu inline (fallback 1:1)', () => {
    mount();
    const panel = panelOf();
    expect(panel.hasAttribute('data-art')).toBe(false);
    expect(panel.getAttribute('style')).toBe(null);
    // struktura fallback dokladnie jak przed skorka
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
    expect(screen.getByTestId('dialog-options')).toBeTruthy();
    expect(screen.getByTestId('dialog-portrait')).toBeTruthy();
    expect(screen.getByTestId('dialog-npc-text').textContent).toContain('Witaj');
    expect(screen.getByTestId('dialog-barter')).toBeTruthy();
  });

  it('z grafika podokna: data-art na panelu, url grafik w zmiennych, te same data-testid', () => {
    mount({
      source: sourceOf({
        'dlg.subwin': [640, 190],
        'dlg.hi.top': [89, 81],
        'dlg.done.up': [82, 46],
        'dlg.done.dn': [82, 46],
      }),
    });
    const panel = panelOf();
    expect(panel.getAttribute('data-art')).toBe('1');
    expect(panel.getAttribute('data-art-done')).toBe('1');
    expect(panel.style.getPropertyValue('--f2-dlg-bg')).toBe('url(dlg.subwin.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-hi')).toBe('url(dlg.hi.top.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-done')).toBe('url(dlg.done.up.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-done-ratio')).toBe(String(82 / 46));
    // te same data-testid w trybie art (opcje dalej jako lista z numerami)
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
    expect(screen.getByTestId('dialog-npc-text').textContent).toContain('Witaj');
    expect(screen.getAllByTestId('dialog-option-req').length).toBeGreaterThan(0);
  });

  it('wariant party (dlg.subwin.party) wlacza skorka, gdy brak dlg.subwin', () => {
    mount({ source: sourceOf({ 'dlg.subwin.party': [640, 190] }) });
    const panel = panelOf();
    expect(panel.getAttribute('data-art')).toBe('1');
    expect(panel.getAttribute('data-art-done')).toBe(null);
    expect(panel.style.getPropertyValue('--f2-dlg-bg')).toBe('url(dlg.subwin.party.png)');
    // brak hilightu/done: zmienne puste, struktura bez zmian
    expect(panel.style.getPropertyValue('--f2-dlg-hi')).toBe('');
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
  });

  it('grafiki w touch nie wylaczaja skorki ani struktury opcji', () => {
    mount({ source: sourceOf({ 'dlg.subwin': [640, 190] }), profile: 'touch' });
    const root = screen.getByTestId('dialog-screen');
    expect(root.getAttribute('data-profile')).toBe('touch');
    expect(panelOf().getAttribute('data-art')).toBe('1');
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
  });

  it('przejscie ladowania -> grafika nie psuje renderu (oba hooki podokna bezwarunkowe)', () => {
    // Zrodlo jak echte UiArtSource: get zwraca undefined (ladowanie), potem obraz po notyfikacji.
    let loaded = false;
    const notify = new Set<() => void>();
    const source: UiArtSource = {
      get: (name) =>
        loaded && name === 'dlg.subwin' ? { url: 'dlg.subwin.png', width: 640, height: 190 } : null,
      subscribe: (cb) => {
        notify.add(cb);
        return () => notify.delete(cb);
      },
    };
    const m = createMockDialog();
    render(
      <UiArtProvider source={source}>
        <DialogScreen view={{ dialog: m.dialog }} commands={m.commands} profile="desktop" />
      </UiArtProvider>,
    );
    // przed ladowaniem: fallback, brak data-art
    expect(panelOf().hasAttribute('data-art')).toBe(false);
    // grafika dochodzi (jak po zakonczeniu dekodowania): komponent renders without crash
    loaded = true;
    act(() => notify.forEach((cb) => cb()));
    const panel = panelOf();
    expect(panel.getAttribute('data-art')).toBe('1');
    expect(panel.style.getPropertyValue('--f2-dlg-bg')).toBe('url(dlg.subwin.png)');
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
  });

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

  it('CSS: cel dotyku >= 48 px zostaje, skorka wlaczona tylko przez [data-art]', () => {
    const css = readFileSync(join(uiRoot, 'src/screens/dialog/dialog.css'), 'utf8');
    expect(css).toMatch(/--dialog-target:\s*max\(48px/);
    expect(css).toMatch(/\.f2-dialog__panel\[data-art\]/);
    expect(css).toMatch(/\.f2-dialog__panel\[data-art\][^{]*\{[^}]*image-rendering:\s*pixelated/);
    // skorka nie zeruje wysokosci celu dotyku
    expect(css).not.toMatch(/\.f2-dialog__panel\[data-art\][^{]*\{[^}]*min-height:\s*0/);
  });

  it('CSS: pasek reakcji widoczny (border-left z stylem solid, nie sam width)', () => {
    const css = readFileSync(join(uiRoot, 'src/screens/dialog/dialog.css'), 'utf8');
    // po "border: 0" sam border-left-width nic nie narysuje (style = none)
    expect(css).toMatch(
      /\.f2-option-card\[data-reaction='good'\][\s\S]{0,120}?border-left:\s*3px\s+solid/,
    );
    expect(css).toMatch(
      /\.f2-option-card\[data-reaction='bad'\][\s\S]{0,120}?border-left:\s*3px\s+solid/,
    );
    expect(css).toMatch(/--dialog-panel-bg:\s*rgba\(/);
  });

  it('kod: brak warunkowego hooka useUiArt w skrocie ??', () => {
    const code = readFileSync(join(uiRoot, 'src/screens/dialog/DialogScreen.tsx'), 'utf8');
    // useUiArt('dlg.subwin') ?? useUiArt('dlg.subwin.party') laczy warunkowo hooki (rules of hooks)
    expect(code).not.toMatch(/useUiArt\([^)]*\)\s*\?\?\s*useUiArt/);
  });
});
