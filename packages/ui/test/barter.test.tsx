import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import { BarterScreen } from '../src/screens/barter/BarterScreen';
import { filterByCategory } from '../src/screens/barter/model';
import { createMockBarter, sampleBarter, SAMPLE_IDS as I } from '../playground/barter-mock';
import { pointer } from './helpers';

beforeEach(() => setLocale('pl'));
afterEach(() => setLocale('pl'));

const sprite = () => undefined;
const setup = (over: Parameters<typeof sampleBarter>[0] = {}) => {
  const mock = createMockBarter(sampleBarter(over));
  render(
    <ThemeProvider>
      <ToastProvider>
        <BarterScreen view={mock.view} commands={mock.commands} sprite={sprite} compact={false} />
      </ToastProvider>
    </ThemeProvider>,
  );
  return mock;
};
const row = (col: string, id: number) =>
  within(screen.getByTestId(col))
    .getAllByTestId('barter-item')
    .find((e) => e.getAttribute('data-item-id') === String(id))!;

describe('model handlu', () => {
  it('filtr kategorii zostawia kapsle', () => {
    const v = createMockBarter(sampleBarter()).view.value;
    expect(filterByCategory(v.player, 'drug').map((i) => i.name)).toEqual(['Kapsle', 'Stimpak']);
    expect(filterByCategory(v.player, 'all')).toHaveLength(4);
  });
  it('sumy z sesji: kapsle nie sa mnozone, cena wg @f2/rules', () => {
    const m = createMockBarter(sampleBarter());
    m.commands.move('player', I.caps, 100, 'table');
    m.commands.move('merchant', I.jacket, 1, 'table');
    expect(m.view.value.totals).toEqual({ offer: 100, wanted: 100, balanced: true });
    m.commands.move('player', I.pistol, 1, 'table');
    expect(m.view.value.totals.offer).toBe(100 + 2 * 250);
    expect(m.view.value.containerMode).toBe(false);
  });
  it('balance dokłada kapsle do pokrycia stolu kupca', () => {
    const m = createMockBarter(sampleBarter());
    m.commands.move('merchant', I.rifle, 1, 'table');
    expect(m.commands.balance()).toEqual({ ok: true });
    expect(m.view.value.totals.balanced).toBe(true);
    expect(m.view.value.totals.offer).toBe(400);
    expect(m.commands.balance()).toEqual({ ok: false, reason: 'nothing-to-balance' });
  });
  it('balance: za malo kapsli', () => {
    const m = createMockBarter(sampleBarter());
    m.commands.move('merchant', I.gold, 1, 'table');
    expect(m.commands.balance()).toEqual({ ok: false, reason: 'not-enough-caps' });
  });
  it('tryb pojemnika: kupiec nie uniesie', () => {
    const m = createMockBarter(
      sampleBarter({ params: { containerMode: true, merchantFreeCarry: 1 } }),
    );
    m.commands.move('player', I.pistol, 1, 'table');
    expect(m.commands.accept()).toEqual({ ok: false, reason: 'merchant-cannot-carry' });
    expect(m.commands.balance()).toEqual({ ok: false, reason: 'nothing-to-balance' });
  });
  it('po zakonczeniu sesji komendy zwracaja session-closed', () => {
    const m = createMockBarter(sampleBarter());
    m.commands.move('merchant', I.jacket, 1, 'table');
    m.commands.balance();
    expect(m.commands.accept()).toEqual({ ok: true });
    expect(m.commands.move('player', I.stimpak, 1, 'table')).toEqual({
      ok: false,
      reason: 'session-closed',
    });
  });
});

describe('ekran handlu', () => {
  it('tap pojedynczego przedmiotu przenosi go na stol, tap na stole zwraca', () => {
    const mock = setup();
    fireEvent.click(row('barter-player-inv', 2));
    expect(mock.log).toContain('move:player:2:1:table');
    expect(
      within(screen.getByTestId('barter-player-table')).getAllByTestId('barter-item'),
    ).toHaveLength(1);
    fireEvent.click(row('barter-player-table', 2));
    expect(mock.log).toContain('move:player:2:1:inventory');
    expect(screen.getByTestId('barter-offer').textContent).toBe('0');
  });

  it('stos otwiera wybor ilosci i przenosi wskazana liczbe', () => {
    const mock = setup();
    fireEvent.click(row('barter-player-inv', 3));
    const input = screen.getByTestId('barter-qty-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź' }));
    expect(mock.log).toContain('move:player:3:2:table');
    expect(row('barter-player-table', 3).getAttribute('aria-label')).toContain('ilość 2');
    expect(row('barter-player-inv', 3).getAttribute('aria-label')).toContain('ilość 2');
  });

  it('odmowa: za niska oferta, pusty stol, przedmiot nie na sprzedaz', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Handluj' }));
    expect(screen.getByTestId('barter-status').textContent).toContain('zbyt niska');
    fireEvent.click(row('barter-merchant-inv', I.jacket));
    fireEvent.click(screen.getByRole('button', { name: 'Handluj' }));
    expect(screen.getByTestId('barter-status').textContent).toContain('zbyt niska');
    expect(screen.getByTestId('barter-balance').textContent).toContain('Za mało');
    fireEvent.click(row('barter-player-inv', 4));
    expect(screen.getByTestId('barter-status').textContent).toContain('nie jest na sprzedaż');
  });

  it('odmowa: przekroczony udzwig gracza', () => {
    setup({ params: { playerFreeCarry: 20 } });
    fireEvent.click(row('barter-merchant-inv', I.gold));
    fireEvent.click(row('barter-player-inv', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Handluj' }));
    expect(screen.getByTestId('barter-status').textContent).toContain('udźwig');
  });

  it('udana transakcja zamienia towary i czysci stoly', () => {
    const mock = setup();
    fireEvent.click(row('barter-merchant-inv', I.jacket));
    fireEvent.click(row('barter-player-inv', 2));
    expect(screen.getByTestId('barter-balance').textContent).toContain('Zbilansowane');
    fireEvent.click(screen.getByRole('button', { name: 'Handluj' }));
    expect(screen.getByTestId('barter-status').textContent).toBe('Transakcja zakończona.');
    expect(mock.view.value.tablePlayer).toHaveLength(0);
    expect(mock.view.value.player.some((i) => i.id === I.jacket)).toBe(true);
    expect(mock.view.value.merchant.some((i) => i.id === 2)).toBe(true);
  });

  it('mysz: przeciagniecie na stol (pointer events)', () => {
    const mock = setup();
    const target = screen.getByTestId('barter-player-table');
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => target;
    const el = row('barter-player-inv', 2);
    pointer(el, 'pointerdown', { pointerType: 'mouse', clientX: 1, clientY: 1 });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 30, clientY: 30 });
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 30, clientY: 30 });
    document.elementFromPoint = orig;
    expect(mock.log).toContain('move:player:2:1:table');
  });

  it('zamkniecie zwraca przedmioty ze stolow', () => {
    const mock = setup();
    fireEvent.click(row('barter-player-inv', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij handel' }));
    expect(mock.closed.value).toBe(true);
    expect(mock.view.value.tablePlayer).toHaveLength(0);
    expect(mock.view.value.player.some((i) => i.id === 2)).toBe(true);
  });

  it('filtr kategorii zaweza kolumny inwentarzy', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Broń' }));
    const ids = (col: string) =>
      within(screen.getByTestId(col))
        .getAllByTestId('barter-item')
        .map((e) => e.getAttribute('data-item-id'));
    expect(ids('barter-merchant-inv')).toEqual([String(I.rifle)]);
    expect(ids('barter-player-inv')).toEqual([String(I.caps), String(I.pistol)]);
    fireEvent.click(screen.getByRole('tab', { name: 'Wszystko' }));
    expect(ids('barter-merchant-inv')).toHaveLength(4);
  });

  it('wyrownaj dokłada kapsle i odblokowuje zbilansowanie', () => {
    const mock = setup();
    const btn = () => screen.getByRole('button', { name: 'Wyrównaj' }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    fireEvent.click(row('barter-merchant-inv', I.rifle));
    expect(btn().disabled).toBe(false);
    fireEvent.click(btn());
    expect(mock.log).toContain('balance');
    expect(screen.getByTestId('barter-balance').textContent).toContain('Zbilansowane');
    expect(screen.getByTestId('barter-offer').textContent).toBe('400');
    expect(btn().disabled).toBe(true);
  });

  it('wyrownaj: za malo kapsli pokazuje odmowe', () => {
    setup();
    fireEvent.click(row('barter-merchant-inv', I.gold));
    fireEvent.click(screen.getByRole('button', { name: 'Wyrównaj' }));
    expect(screen.getByTestId('barter-status').textContent).toContain('za mało kapsli');
  });

  it('opis cennika pokazuje Barter i modyfikator', () => {
    setup({ params: { barterMod: 20, masterTrader: true } });
    const t = screen.getByTestId('barter-skill').textContent ?? '';
    expect(t).toContain('kupiec 50');
    expect(t).toContain('modyfikator 20%');
    expect(t).toContain('Master Trader');
  });

  it('pojemnik: kupiec nie uniesie (pl i en)', () => {
    setup({ params: { containerMode: true, merchantFreeCarry: 1 } });
    expect(screen.queryByRole('button', { name: 'Wyrównaj' })).toBeNull();
    fireEvent.click(row('barter-player-inv', I.pistol));
    fireEvent.click(screen.getByRole('button', { name: 'Handluj' }));
    expect(screen.getByTestId('barter-status').textContent).toBe(
      'Kupiec nie uniesie Twoich przedmiotów.',
    );
    act(() => setLocale('en'));
    fireEvent.click(screen.getByRole('button', { name: 'Trade' }));
    expect(screen.getByTestId('barter-status').textContent).toBe(
      'The merchant cannot carry your items.',
    );
  });

  it('przelaczenie na EN bez przeladowania', () => {
    setup();
    act(() => setLocale('en'));
    expect(screen.getByRole('button', { name: 'Trade' })).toBeTruthy();
  });
});
