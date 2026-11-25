import { signal } from '@preact/signals';
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import { attachDrag } from '../src/screens/inventory/DragDrop';
import { InventoryScreen } from '../src/screens/inventory/InventoryScreen';
import { compareItems, filterItems, sortItems } from '../src/screens/inventory/model';
import { createMockInventory, sampleItems } from '../src/screens/inventory/mockStore';
import type { ItemView } from '../src/screens/inventory/types';
import { pointer } from './helpers';

const item = (over: Partial<ItemView> & { id: number }): ItemView => ({
  pid: over.id,
  name: `P${over.id}`,
  fid: 1,
  category: 'misc',
  count: 1,
  weight: 1,
  value: 1,
  usable: false,
  ...over,
});

const sprite = () => undefined;

beforeEach(() => setLocale('pl'));
afterEach(() => vi.restoreAllMocks());

describe('model inwentarza', () => {
  const items = [
    item({ id: 1, name: 'Zlom', category: 'misc', weight: 5, value: 1 }),
    item({ id: 2, name: 'Apteczka', category: 'drug', weight: 1, value: 40, count: 3 }),
    item({ id: 3, name: 'Karabin', category: 'weapon', weight: 9, value: 300 }),
  ];
  it('filtruje po kategorii i frazie (bez wielkosci liter)', () => {
    expect(filterItems(items, 'drug', '').map((i) => i.id)).toEqual([2]);
    expect(filterItems(items, 'all', 'KAR').map((i) => i.id)).toEqual([3]);
    expect(filterItems(items, 'weapon', 'apt')).toEqual([]);
  });
  it('sortuje po nazwie rosnaco, wadze i wartosci malejaco', () => {
    expect(sortItems(items, 'name', 'pl').map((i) => i.id)).toEqual([2, 3, 1]);
    expect(sortItems(items, 'weight', 'pl').map((i) => i.id)).toEqual([3, 1, 2]);
    expect(sortItems(items, 'value', 'pl').map((i) => i.id)).toEqual([3, 2, 1]);
  });
  it('porownuje bron i pancerz z zalozonym', () => {
    const a = item({
      id: 1,
      category: 'weapon',
      weight: 4,
      stats: { damageMin: 10, damageMax: 20, range: 30 },
    });
    const b = item({
      id: 2,
      category: 'weapon',
      weight: 6,
      stats: { damageMin: 5, damageMax: 9, range: 40 },
    });
    const rows = Object.fromEntries(compareItems(a, b).map((r) => [r.key, r]));
    expect(rows['damage']).toMatchObject({ value: 15, equipped: 7, delta: 8, better: true });
    expect(rows['range']).toMatchObject({ delta: -10, better: false });
    expect(rows['weight']).toMatchObject({ delta: -2, better: true });
    const arm = item({ id: 3, category: 'armor', stats: { dt: 2, dr: 20 } });
    expect(compareItems(arm, null).find((r) => r.key === 'dt')).toMatchObject({
      value: 2,
      delta: undefined,
    });
  });
});

describe('attachDrag', () => {
  function setup() {
    const el = document.createElement('button');
    document.body.appendChild(el);
    el.setPointerCapture = vi.fn();
    const zone = document.createElement('div');
    zone.setAttribute('data-drop', 'slot:armor');
    document.body.appendChild(zone);
    let under: Element | null = zone;
    document.elementFromPoint = () => under;
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    const detach = attachDrag<number>(el, {
      payload: () => 7,
      createGhost: () => Object.assign(document.createElement('div'), { id: 'ghost' }),
      onDrop,
      onCancel,
    });
    return { el, onDrop, onCancel, detach, setUnder: (e: Element | null) => (under = e) };
  }
  const ghost = () => document.getElementById('ghost');

  it('mysz: upuszczenie nad celem wola onDrop i usuwa ducha', () => {
    const { el, onDrop } = setup();
    pointer(el, 'pointerdown', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 20, clientY: 0 });
    expect(ghost()).not.toBeNull();
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 20, clientY: 0 });
    expect(onDrop).toHaveBeenCalledWith('slot:armor', 7);
    expect(ghost()).toBeNull();
  });
  it('maly ruch to klik: bez ducha i bez onDrop', () => {
    const { el, onDrop } = setup();
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 2 });
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 2 });
    expect(ghost()).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('pointercancel zwraca przedmiot: brak ducha, brak onDrop', () => {
    const { el, onDrop, onCancel } = setup();
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 30 });
    expect(ghost()).not.toBeNull();
    pointer(el, 'pointercancel', { pointerType: 'mouse' });
    expect(ghost()).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
  it('upuszczenie poza celem: onDrop(null), brak ducha', () => {
    const { el, onDrop, setUnder } = setup();
    setUnder(null);
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 30 });
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 30 });
    expect(onDrop).toHaveBeenCalledWith(null, 7);
    expect(ghost()).toBeNull();
  });
  it('dotyk: ruch przed przytrzymaniem to przewijanie, po przytrzymaniu przeciaganie', () => {
    vi.useFakeTimers();
    try {
      const { el, onDrop } = setup();
      pointer(el, 'pointerdown', { pointerType: 'touch' });
      pointer(el, 'pointermove', { pointerType: 'touch', clientY: 40 });
      vi.advanceTimersByTime(500);
      expect(ghost()).toBeNull();
      pointer(el, 'pointerup', { pointerType: 'touch', clientY: 40 });

      pointer(el, 'pointerdown', { pointerType: 'touch' });
      vi.advanceTimersByTime(300);
      expect(ghost()).not.toBeNull();
      pointer(el, 'pointermove', { pointerType: 'touch', clientX: 50 });
      pointer(el, 'pointerup', { pointerType: 'touch', clientX: 50 });
      expect(onDrop).toHaveBeenCalledWith('slot:armor', 7);
    } finally {
      vi.useRealTimers();
    }
  });
  it('odlaczenie w trakcie przeciagania sprzata ducha', () => {
    const { el, detach } = setup();
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 30 });
    detach();
    expect(ghost()).toBeNull();
  });
});

describe('InventoryScreen', () => {
  function mount(opts: { weightMax?: number; withContainer?: boolean } = {}) {
    const mock = createMockInventory({
      weightMax: opts.weightMax ?? 100,
      items: [
        item({ id: 1, name: 'Kombinezon', category: 'armor', weight: 8, stats: { dt: 2, dr: 20 } }),
        item({
          id: 2,
          name: 'Pistolet',
          category: 'weapon',
          weight: 3,
          stats: { damageMin: 5, damageMax: 10, range: 20 },
        }),
        item({ id: 3, name: 'Stimpak', category: 'drug', usable: true, count: 2 }),
      ],
      slots: {
        armor: item({
          id: 9,
          name: 'Skora',
          category: 'armor',
          weight: 5,
          stats: { dt: 1, dr: 10 },
        }),
      },
      container: opts.withContainer
        ? {
            id: 50,
            name: 'Skrzynia',
            items: [
              item({ id: 60, name: 'Zlota sztaba', weight: 30 }),
              item({ id: 61, name: 'Nozyk', category: 'weapon', weight: 1 }),
            ],
          }
        : null,
    });
    render(
      <ThemeProvider>
        <ToastProvider>
          <InventoryScreen
            inventory={mock.inventory}
            container={mock.container}
            commands={mock.commands}
            sprite={sprite}
          />
        </ToastProvider>
      </ThemeProvider>,
    );
    return mock;
  }
  const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

  it('stuknij przedmiot, potem akcje: zaloz pancerz', () => {
    const mock = mount();
    fireEvent.click(card('Kombinezon'));
    fireEvent.click(screen.getByRole('button', { name: 'Załóż pancerz' }));
    expect(mock.log).toContain('equip:1:armor');
    expect(mock.inventory.value.slots.armor?.name).toBe('Kombinezon');
  });
  it('porownanie pokazuje roznice wzgledem zalozonego', () => {
    mount();
    fireEvent.click(card('Kombinezon'));
    const dt = screen.getByTestId('cmp-dt');
    expect(within(dt).getByText('+1')).toBeTruthy();
  });
  it('wyszukiwanie filtruje liste', () => {
    mount();
    fireEvent.input(screen.getByLabelText('Szukaj'), { target: { value: 'stim' } });
    expect(screen.queryByRole('button', { name: /^Pistolet/ })).toBeNull();
    expect(card('Stimpak')).toBeTruthy();
  });
  it('wez wszystko: za ciezki przedmiot zostaje i pokazuje powod', () => {
    const mock = mount({ weightMax: 25, withContainer: true });
    fireEvent.click(screen.getByRole('button', { name: 'Weź wszystko' }));
    expect(mock.container.value?.items.map((i) => i.name)).toEqual(['Zlota sztaba']);
    expect(screen.getByRole('status').textContent).toContain('Za ciężkie');
  });
  it('upuszczenie przedmiotu na slot przez Pointer Events zaklada go', () => {
    const mock = mount();
    const el = card('Kombinezon');
    const slot = screen.getByTestId('slot-armor');
    document.elementFromPoint = () => slot;
    el.setPointerCapture = vi.fn();
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 40 });
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 40 });
    expect(mock.log).toContain('equip:1:armor');
    expect(screen.queryByTestId('drag-ghost')).toBeNull();
  });
  it('bron nie wejdzie w slot pancerza: komunikat, brak komendy', () => {
    const mock = mount();
    const el = card('Pistolet');
    document.elementFromPoint = () => screen.getByTestId('slot-armor');
    el.setPointerCapture = vi.fn();
    pointer(el, 'pointerdown', { pointerType: 'mouse' });
    pointer(el, 'pointermove', { pointerType: 'mouse', clientX: 40 });
    pointer(el, 'pointerup', { pointerType: 'mouse', clientX: 40 });
    expect(mock.log).not.toContain('equip:2:armor');
    expect(screen.getByRole('status').textContent).toContain('nie pasuje');
  });
  it('angielski interfejs', () => {
    setLocale('en');
    mount();
    expect(screen.getByText('Inventory')).toBeTruthy();
  });
});

describe('wydajnosc', () => {
  it('500 przedmiotow renderuje tylko okno wiersza', () => {
    const mock = createMockInventory({ weightMax: 9999, items: sampleItems(500) });
    render(
      <ThemeProvider>
        <ToastProvider>
          <InventoryScreen
            inventory={signal(mock.inventory.value)}
            container={mock.container}
            commands={mock.commands}
            sprite={sprite}
          />
        </ToastProvider>
      </ThemeProvider>,
    );
    expect(screen.getAllByTestId('inv-item').length).toBeLessThan(60);
  });
});
