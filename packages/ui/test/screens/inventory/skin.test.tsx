import { act, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { InventoryScreen, useBoxHeight } from '../../../src/screens/inventory/InventoryScreen';
import { createMockInventory } from '../../../src/screens/inventory/mockStore';
import type { ItemView } from '../../../src/screens/inventory/types';

beforeEach(() => setLocale('pl'));

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

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});
const ART: Record<string, [number, number]> = {
  'inv.bg': [640, 480],
  'inv.done.up': [15, 16],
  'inv.done.dn': [15, 16],
};

function setup(source?: UiArtSource, layout?: 'pc' | 'touch', withContainer = true) {
  const mock = createMockInventory({
    weightMax: 100,
    items: [
      item({ id: 2, name: 'Pistolet', category: 'weapon', weight: 3 }),
      item({ id: 3, name: 'Stimpak', category: 'drug', usable: true, count: 2 }),
    ],
    container: withContainer
      ? { id: 50, name: 'Skrzynia', items: [item({ id: 60, name: 'Zlota sztaba' })] }
      : null,
  });
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>
          <InventoryScreen
            inventory={mock.inventory}
            container={mock.container}
            commands={mock.commands}
            sprite={() => undefined}
          />
        </ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );
  return mock;
}

describe('InventoryScreen - skorka FRM', () => {
  it('bez sztuki: fallback bez zmian (panele, brak sceny)', () => {
    setup();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getByTestId('inventory-screen').className).not.toContain('--art');
    expect(document.querySelectorAll('.f2-panel__title').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('paperdoll')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeTruthy();
  });

  it('z sztuka (PC): scena inv.bg, te same testidy, loot dziala, dodatki w panelu', () => {
    const mock = setup(sourceOf(ART), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.backgroundImage).toContain('inv.bg.png');
    expect(document.querySelector('.f2-panel__title')).toBeNull();
    for (const id of [
      'paperdoll',
      'drop-ground',
      'slot-left',
      'slot-right',
      'slot-armor',
      'grid-player',
      'grid-container',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-art-at]').length).toBe(6);
    // wez wszystko
    fireEvent.click(screen.getByRole('button', { name: 'Weź wszystko' }));
    expect(mock.log).toContain('takeAll');
    // Done grafiki zamyka loot
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(mock.log).toContain('close');
    // nasze dodatki (szukaj/sortuj) w panelu dodatkow, nie na scenie
    const extras = document.querySelector('.f2-art-extras')!;
    expect(extras.querySelector('input[type=search]')).toBeTruthy();
    expect(stage.querySelector('input[type=search]')).toBeNull();
    // aktywacja przedmiotu i uzycie
    fireEvent.click(
      screen.getAllByTestId('inv-item').find((e) => e.getAttribute('data-item-id') === '3')!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Użyj' }));
    expect(mock.log).toContain('use:3');
  });

  it('z sztuka (PC) bez kontenera: te same regiony (kontener w ekranie)', () => {
    setup(sourceOf(ART), 'pc', false);
    expect(document.querySelectorAll('[data-art-at]').length).toBe(6);
    expect(screen.queryByTestId('grid-container')).toBeNull();
  });

  it('z sztuka (touch): nakladka, wyszukiwanie w srodku, cele 44px', () => {
    setup(sourceOf(ART), 'touch');
    const body = document.querySelector('.f2-inv__touch-body')!;
    expect(body).toBeTruthy();
    expect(body.querySelector('input[type=search]')).toBeTruthy();
    expect(body.closest('[data-art-stage]')).toBeNull();
    expect(document.querySelector('.f2-art-extras')).toBeNull();
    expect(screen.getByTestId('inventory-screen').className).toContain('f2-inv-screen--touch');
    const takeAll = screen.getByRole('button', { name: 'Weź wszystko' }) as HTMLElement;
    expect(takeAll.style.minHeight).toBe('44px');
    const done = screen.getByRole('button', { name: 'Zamknij' }) as HTMLElement;
    expect(done.style.minHeight).toBe('44px');
  });

  it('przelaczenie sztuki nie lamie hookow (bez/ z sztuka w tym samym drzewie)', () => {
    expect(() => {
      setup();
      setup(sourceOf(ART), 'pc');
    }).not.toThrow();
  });
});

describe('useBoxHeight', () => {
  it('podpina obserwator do elementu pojawiajacego sie pozniej (ref zmienia element)', () => {
    const observed: Element[] = [];
    const orig = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor() {}
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 123,
    });
    let toggle = (): void => {};
    function Harness() {
      const [ref, h] = useBoxHeight();
      const [on, setOn] = useState(false);
      toggle = () => setOn(true);
      return (
        <div>
          <span data-testid="h">{h}</span>
          {on && <div ref={ref} data-testid="box" />}
        </div>
      );
    }
    try {
      render(<Harness />);
      expect(screen.getByTestId('h').textContent).toBe('0');
      act(() => toggle());
      expect(observed).toContain(screen.getByTestId('box'));
      expect(screen.getByTestId('h').textContent).toBe('123');
    } finally {
      globalThis.ResizeObserver = orig;
      if (desc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', desc);
    }
  });
});
