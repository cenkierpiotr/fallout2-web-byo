import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import { SavesScreen } from '../src/screens/saves/SavesScreen';
import { createMockSaves } from '../src/screens/saves/mock-store';

beforeEach(() => setLocale('pl'));

function setup(profile: 'desktop' | 'touch' = 'desktop') {
  const store = createMockSaves();
  const loaded: string[] = [];
  render(
    <ThemeProvider theme="modern" profile={profile} fontScale={1}>
      <ToastProvider>
        <SavesScreen
          view={store.view}
          commands={store.commands}
          onLoaded={(id) => loaded.push(id)}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
  return { store, loaded };
}

const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid=save-card][data-slot="${id}"]`)!;

describe('ekran zapisow', () => {
  it('pokazuje sloty z metadanymi i puste sloty', () => {
    setup();
    expect(screen.getAllByTestId('save-card')).toHaveLength(6);
    expect(card('manual-0').textContent).toContain('Arroyo');
    expect(card('manual-0').textContent).toContain('Wybraniec');
    expect(card('manual-1').textContent).toContain('Pusty slot');
    expect(
      card('manual-1').querySelector<HTMLButtonElement>('button[aria-label^="Wczytaj"]')!.disabled,
    ).toBe(true);
  });

  it('zapis do pustego slotu bez potwierdzenia', async () => {
    const { store } = setup();
    fireEvent.click(card('manual-1').querySelector('button[aria-label^="Zapisz"]')!);
    await waitFor(() => expect(store.log).toEqual(['save:manual-1']));
    await waitFor(() => expect(card('manual-1').dataset['empty']).toBe('false'));
  });

  it('nadpisanie pyta o potwierdzenie, anulowanie nic nie zapisuje', async () => {
    const { store } = setup();
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Zapisz"]')!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(store.log).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.log).toEqual([]);
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Zapisz"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Nadpisz' }));
    await waitFor(() => expect(store.log).toEqual(['save:manual-0']));
  });

  it('wczytanie wola onLoaded; usuniecie wymaga potwierdzenia', async () => {
    const { store, loaded } = setup();
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Wczytaj"]')!);
    await waitFor(() => expect(loaded).toEqual(['manual-0']));
    fireEvent.click(card('manual-0').querySelector('button[aria-label^="Usuń"]')!);
    fireEvent.click(within_dialog('Usuń'));
    await waitFor(() => expect(card('manual-0').dataset['empty']).toBe('true'));
    expect(store.log).toContain('remove:manual-0');
  });

  it('autozapis nie ma przycisku Zapisz', () => {
    setup();
    expect(card('auto').querySelector('button[aria-label^="Zapisz"]')).toBeNull();
  });

  it('F5 zapisuje w quicksave, F8 wczytuje, bez quicksave ostrzega', async () => {
    const { store, loaded } = setup();
    fireEvent.keyDown(window, { key: 'F8' });
    expect(await screen.findByText('Brak szybkiego zapisu do wczytania')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'F5' });
    await waitFor(() => expect(card('quick').dataset['empty']).toBe('false'));
    expect(store.log).toEqual(['save:quick']);
    await screen.findByText('Zapisano: Szybki zapis');
    fireEvent.keyDown(window, { key: 'F8' });
    await waitFor(() => expect(loaded).toEqual(['quick']));
  });

  it('strzalki przenosza fokus miedzy kartami, Enter wczytuje, Delete pyta', async () => {
    const { loaded } = setup();
    card('manual-0').focus();
    fireEvent.keyDown(card('manual-0'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(card('manual-1'));
    fireEvent.keyDown(card('manual-1'), { key: 'ArrowUp' });
    fireEvent.keyDown(card('manual-0'), { key: 'Enter' });
    await waitFor(() => expect(loaded).toEqual(['manual-0']));
    fireEvent.keyDown(card('manual-0'), { key: 'Delete' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('import blednego pliku pokazuje przetlumaczony blad, w EN tez', async () => {
    setup();
    const input = screen.getByTestId('saves-import-input') as HTMLInputElement;
    const file = new File(['to nie json'], 'x.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Plik zapisu jest uszkodzony lub nieprawidłowy')).toBeTruthy();
    act(() => setLocale('en'));
    expect(screen.getByRole('button', { name: 'Import save' })).toBeTruthy();
  });

  it('import poprawnego pliku zajmuje wolny slot', async () => {
    const { store } = setup();
    const input = screen.getByTestId('saves-import-input') as HTMLInputElement;
    const file = new File(['{"format":"f2save"}'], 'ok.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(card('manual-1').dataset['empty']).toBe('false'));
    expect(store.log).toEqual(['import:ok.json']);
  });
});

function within_dialog(name: string): HTMLElement {
  const dlg = screen.getByRole('dialog');
  return Array.from(dlg.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent === name,
  )!;
}
