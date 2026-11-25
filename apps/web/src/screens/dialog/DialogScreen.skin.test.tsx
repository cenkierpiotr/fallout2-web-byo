// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiArtProvider, type UiArtSource } from '@f2/ui';
import type { DialogState } from '@f2/vm';
import { setLocale } from '../../i18n';
import { DialogScreen, type DialogViewLike } from './DialogScreen';

/** Zrodlo grafik jak w testach warstwy art: klucze to nazwy logiczne, brakujaca = null (nie blad). */
const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

afterEach(() => {
  cleanup();
  setLocale('pl');
});

function opt(i: number, text: string, extra: Partial<DialogState['options'][number]> = {}) {
  return { index: i, text, iqRequired: 0, reaction: 50, visible: true, ...extra };
}
function makeState(over: Partial<DialogState> = {}): DialogState {
  return {
    npcObjId: 1,
    headFid: 0,
    background: 0,
    reaction: 50,
    npcText: 'Witaj, wedrowcze.',
    options: [
      opt(0, 'Pierwsza'),
      opt(1, 'Druga'),
      opt(2, 'Ukryta', { visible: false }),
      opt(3, 'Trzecia', { iqRequired: 6 }),
    ],
    history: [{ who: 'npc', text: 'Dawna kwestia' }],
    mode: 'reply',
    ...over,
  };
}
function makeView(state: DialogState | null): DialogViewLike {
  let v = state;
  const subs = new Set<(x: DialogState | null) => void>();
  return {
    dialog: {
      get value() {
        return v;
      },
      set value(n) {
        v = n;
        subs.forEach((f) => f(n));
      },
      subscribe(fn) {
        subs.add(fn);
        fn(v);
        return () => subs.delete(fn);
      },
    },
  };
}
const cmds = () => ({ choose: vi.fn(), close: vi.fn() });

const panelOf = (): HTMLElement =>
  screen.getByTestId('dialog-screen').querySelector('.dialog-panel') as HTMLElement;

describe('DialogScreen: skorka FRM (zadanie 9)', () => {
  it('test_dialogScreen_skin_fallback_bez_providera_bez_data_art', () => {
    render(<DialogScreen view={makeView(makeState())} commands={cmds()} profile="desktop" />);
    const panel = panelOf();
    expect(panel.hasAttribute('data-art')).toBe(false);
    expect(panel.getAttribute('style')).toBe(null);
    // struktura fallback jak przed skorka
    expect(screen.getByTestId('dialog-option-0')).toBeTruthy();
    expect(screen.getByTestId('dialog-options')).toBeTruthy();
    expect(screen.getByTestId('dialog-npc-text').textContent).toBe('Witaj, wedrowcze.');
    expect(screen.getByTestId('dialog-history')).toBeTruthy();
  });

  it('test_dialogScreen_skin_data_art_z_grafika_podokna', () => {
    render(
      <UiArtProvider
        source={sourceOf({
          'dlg.subwin': [640, 190],
          'dlg.hi.top': [89, 81],
          'dlg.done.up': [82, 46],
          'dlg.done.dn': [82, 46],
        })}
      >
        <DialogScreen view={makeView(makeState())} commands={cmds()} profile="desktop" />
      </UiArtProvider>,
    );
    const panel = panelOf();
    expect(panel.getAttribute('data-art')).toBe('1');
    expect(panel.getAttribute('data-art-done')).toBe('1');
    expect(panel.style.getPropertyValue('--f2-dlg-bg')).toBe('url(dlg.subwin.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-hi')).toBe('url(dlg.hi.top.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-done')).toBe('url(dlg.done.up.png)');
    expect(panel.style.getPropertyValue('--f2-dlg-done-ratio')).toBe(String(82 / 46));
    // te same data-testid w trybie art
    expect(screen.getByTestId('dialog-option-0')).toBeTruthy();
    expect(screen.getByTestId('dialog-npc-text').textContent).toBe('Witaj, wedrowcze.');
  });

  it('test_dialogScreen_skin_touch_targets_min_48px_tez_z_grafika', () => {
    render(
      <UiArtProvider source={sourceOf({ 'dlg.subwin': [640, 190] })}>
        <DialogScreen view={makeView(makeState())} commands={cmds()} profile="touch" />
      </UiArtProvider>,
    );
    expect(panelOf().getAttribute('data-art')).toBe('1');
    for (const b of screen.getAllByRole('button')) {
      expect(parseInt((b as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(48);
    }
    // klasy .option-card uzywane przez querySelectory klawiatury zostaja
    expect(screen.getByTestId('dialog-screen').querySelectorAll('.option-card').length).toBe(3);
    cleanup();
    // tryb message: Zamknij tez z grafika i >= 48 px
    render(
      <UiArtProvider source={sourceOf({ 'dlg.subwin': [640, 190] })}>
        <DialogScreen
          view={makeView(makeState({ mode: 'message', options: [] }))}
          commands={cmds()}
          profile="touch"
        />
      </UiArtProvider>,
    );
    expect(parseInt(screen.getByTestId('dialog-close').style.minHeight, 10)).toBeGreaterThanOrEqual(
      48,
    );
    expect(panelOf().getAttribute('data-art')).toBe('1');
  });

  it('test_dialogScreen_skin_klik_i_klawisze_dzialaja_z_grafika', () => {
    const c = cmds();
    render(
      <UiArtProvider source={sourceOf({ 'dlg.subwin': [640, 190] })}>
        <DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />
      </UiArtProvider>,
    );
    fireEvent.click(screen.getByText('Trzecia'));
    expect(c.choose).toHaveBeenCalledWith(3);
    fireEvent.keyDown(screen.getByTestId('dialog-screen'), { key: '2' });
    expect(c.choose).toHaveBeenLastCalledWith(1);
  });
});
