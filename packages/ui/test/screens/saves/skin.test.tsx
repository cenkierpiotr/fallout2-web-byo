import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { SavesScreen } from '../../../src/screens/saves/SavesScreen';
import { createMockSaves } from '../../../src/screens/saves/mock-store';

beforeEach(() => setLocale('pl'));

function setup(source?: UiArtSource, layout?: 'pc' | 'touch', props?: { loadOnly?: boolean }) {
  const store = createMockSaves();
  const loaded: string[] = [];
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>
          <SavesScreen
            view={store.view}
            commands={store.commands}
            onLoaded={(id) => loaded.push(id)}
            {...(props?.loadOnly !== undefined ? { loadOnly: props.loadOnly } : {})}
          />
        </ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );
  return { store, loaded };
}

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});

const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid=save-card][data-slot="${id}"]`)!;

const SAVE_BG: Record<string, [number, number]> = { 'save.bg': [640, 480] };

describe('SavesScreen - skorka FRM', () => {
  it('bez sztuki: struktura fallback bez zmian', () => {
    const { store } = setup();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    const root = screen.getByTestId('saves-screen');
    expect(root.className).not.toContain('f2-saves__root--art');
    // Panel z tytulem i stara lista
    expect(document.querySelector('.f2-panel__title')?.textContent).toBe('Zapisy gry');
    expect(screen.getAllByTestId('save-card')).toHaveLength(6);
    // toolbar: przycisk importu i ukryty input, hint
    expect(screen.getByTestId('saves-import-input')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importuj zapis' })).toBeTruthy();
    expect(screen.getByText('F5: szybki zapis, F8: szybkie wczytanie')).toBeTruthy();
    // eksport per karta (w fallback) dla zajetych slotow; pusty ma przycisk wylaczony
    expect(card('manual-0').querySelector('button[aria-label^="Eksportuj"]')).toBeTruthy();
    expect(
      (card('quick').querySelector('button[aria-label^="Eksportuj"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(store.log).toEqual([]);
  });

  it('z sztuka (PC): te same testidy, tlo 640/480, akcje dzialaja', async () => {
    const { store, loaded } = setup(sourceOf(SAVE_BG), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage).toBeTruthy();
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    expect(stage.style.backgroundImage).toContain('save.bg.png');
    // naglowek a11y zamiast tytulu panelu
    expect(document.querySelector('.f2-panel__title')).toBeNull();
    // te same testidy: karty, lista, import input
    expect(screen.getAllByTestId('save-card')).toHaveLength(6);
    expect(screen.getAllByTestId('saves-list')).toHaveLength(1);
    expect(screen.getByTestId('saves-import-input')).toBeTruthy();

    // zapis przez przycisk na karcie
    const saveBtn = card('manual-1').querySelector('button[aria-label^="Zapisz"]')!;
    fireEvent.click(saveBtn);
    await waitFor(() => expect(store.log).toEqual(['save:manual-1']));
    await waitFor(() => expect(card('manual-1').dataset['empty']).toBe('false'));

    // wczytanie wola onLoaded
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Wczytaj"]')!);
    await waitFor(() => expect(loaded).toEqual(['manual-0']));

    // eksport NIE jest w kartach (przeniesiony do panelu Extras)
    expect(card('manual-0').querySelector('button[aria-label^="Eksportuj"]')).toBeNull();
    // ...ale jest w ExtrasPanel i dziala
    const extras = document.querySelector('.f2-art-extras')!;
    expect(extras).toBeTruthy();
    const exportBtn = extras.querySelector('button[aria-label="Eksportuj: Slot 1"]')!;
    fireEvent.click(exportBtn);
    await waitFor(() => expect(store.log).toContain('export:manual-0'));
    // hint o klawiszach i tak sam widoczny w panelu
    expect(extras.textContent).toContain('F5: szybki zapis');

    // podglad aktywnego slotu w scenie (manual-1 ma thumbnail po zapisie)
    await waitFor(() => {
      const preview = document.querySelector('[data-testid=save-preview]');
      expect(preview).toBeTruthy();
    });
    // pozycjonowanie wzgledem grafiki: >=4 obszary ArtAt
    expect(document.querySelectorAll('[data-art-at]').length).toBeGreaterThanOrEqual(4);
  });

  it('z sztuka (PC): nadpisanie pyta o potwierdzenie w modalu', async () => {
    const { store } = setup(sourceOf(SAVE_BG), 'pc');
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Zapisz"]')!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(store.log).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Nadpisz' }));
    await waitFor(() => expect(store.log).toEqual(['save:manual-0']));
  });

  it('z sztuka (touch): overlay ze slotami i cele dotykowe min 44px', () => {
    setup(sourceOf(SAVE_BG), 'touch');
    const overlay = document.querySelector('.f2-saves__touch-list');
    expect(overlay).toBeTruthy();
    const list = screen.getByTestId('saves-list');
    expect(overlay!.contains(list)).toBe(true);
    // kazdy przycisk w karcie ma 44px celu
    for (const btn of card('manual-0').querySelectorAll('button')) {
      expect((btn as HTMLElement).style.minHeight).toBe('44px');
      expect((btn as HTMLElement).style.minWidth).toBe('44px');
    }
    // eksport w panelu Extras tez >= 44px
    const extrasBtn = document.querySelector('.f2-art-extras button[aria-label^="Eksportuj"]')!;
    expect((extrasBtn as HTMLElement).style.minHeight).toBe('44px');
  });

  it('z sztuka loadOnly: bez importu, eksportu i zapisu; zostaje wczytywanie', () => {
    setup(sourceOf(SAVE_BG), 'pc', { loadOnly: true });
    expect(screen.queryByTestId('saves-import-input')).toBeNull();
    expect(document.querySelector('.f2-art-extras')).toBeNull();
    expect(document.querySelectorAll('button[aria-label^="Eksportuj"]').length).toBe(0);
    expect(document.querySelectorAll('button[aria-label^="Zapisz"]').length).toBe(0);
    // wczytywanie zostaje w kartach
    expect(card('manual-0').querySelector('button[aria-label^="Wczytaj"]')).toBeTruthy();
  });
});
