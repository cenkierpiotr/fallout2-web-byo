// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiArtProvider, type UiArtSource } from '@f2/ui';
import { setLocale } from '../../i18n';
import { IfaceBar } from './IfaceBar';

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

beforeEach(() => setLocale('pl'));
afterEach(() => {
  cleanup();
  setLocale('pl');
});

const base = { hp: 30, hpMax: 45, ac: 8, ap: 7, apMax: 10, messages: ['Trafiles.'] };
const art = sourceOf({
  'iface.bar': [640, 100],
  'iface.inv.up': [32, 21],
  'iface.opts.up': [34, 34],
});

describe('IfaceBar', () => {
  it('bez grafik renderuje fallback z HP/AC/AP', () => {
    render(<IfaceBar {...base} onInventory={() => {}} />);
    expect(screen.getByTestId('iface-hp').textContent).toBe('HP 30/45');
    expect(screen.getByTestId('iface-ac').textContent).toBe('KP 8');
    expect(screen.getByTestId('iface-ap').textContent).toBe('PA 7/10');
    expect(screen.getByTestId('iface-msgs').textContent).toContain('Trafiles.');
    expect(document.querySelector('[data-art-stage]')).toBeNull();
  });

  it('z grafika renderuje scene IFACE i klik INV wola onInventory', () => {
    const onInventory = vi.fn();
    render(
      <UiArtProvider source={art}>
        <IfaceBar {...base} onInventory={onInventory} />
      </UiArtProvider>,
    );
    expect(document.querySelector('[data-art-stage]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('iface-inv'));
    expect(onInventory).toHaveBeenCalledTimes(1);
  });

  it('przycisk bez handlera nie jest rysowany', () => {
    render(
      <UiArtProvider source={art}>
        <IfaceBar {...base} onOptions={() => {}} />
      </UiArtProvider>,
    );
    expect(screen.queryByTestId('iface-inv')).toBeNull();
    expect(screen.getByTestId('iface-opts')).toBeTruthy();
  });

  it('w trybie touch pasek jest zwijalny', () => {
    render(
      <UiArtProvider source={art} layout="touch">
        <IfaceBar {...base} onInventory={() => {}} />
      </UiArtProvider>,
    );
    expect(screen.getByTestId('iface-inv')).toBeTruthy();
    fireEvent.click(screen.getByTestId('iface-toggle'));
    expect(screen.queryByTestId('iface-inv')).toBeNull();
    expect(screen.getByTestId('iface-toggle').textContent).toBe('Rozwin pasek');
    fireEvent.click(screen.getByTestId('iface-toggle'));
    expect(screen.getByTestId('iface-inv')).toBeTruthy();
  });

  it('na PC nie ma przycisku zwijania', () => {
    render(
      <UiArtProvider source={art} layout="pc">
        <IfaceBar {...base} />
      </UiArtProvider>,
    );
    expect(screen.queryByTestId('iface-toggle')).toBeNull();
  });

  it('extras zawiera przekazane przyciski z tymi samymi testid', () => {
    const zoom = vi.fn();
    render(
      <UiArtProvider source={art}>
        <IfaceBar
          {...base}
          extras={
            <>
              <button type="button" data-testid="zoom-in" onClick={zoom}>
                +
              </button>
              <button type="button" data-testid="elevation-up">
                ▲
              </button>
            </>
          }
        />
      </UiArtProvider>,
    );
    const panel = screen.getByTestId('iface-extras');
    expect(panel.contains(screen.getByTestId('zoom-in'))).toBe(true);
    expect(panel.contains(screen.getByTestId('elevation-up'))).toBe(true);
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoom).toHaveBeenCalled();
  });

  it('bez zrodla AC/PA/HP nie rysuje tych pol', () => {
    render(<IfaceBar messages={[]} onInventory={() => {}} />);
    expect(screen.queryByTestId('iface-hp')).toBeNull();
    expect(screen.queryByTestId('iface-ac')).toBeNull();
    expect(screen.queryByTestId('iface-ap')).toBeNull();
    cleanup();
    render(
      <UiArtProvider source={art}>
        <IfaceBar messages={[]} hp={5} hpMax={9} />
      </UiArtProvider>,
    );
    expect(screen.getByTestId('iface-hp')).toBeTruthy();
    expect(screen.queryByTestId('iface-ac')).toBeNull();
    expect(screen.queryByTestId('iface-ap')).toBeNull();
  });

  it('gdy brak arkusza cyfr, cyfry ida tekstem', () => {
    render(
      <UiArtProvider source={art}>
        <IfaceBar {...base} />
      </UiArtProvider>,
    );
    expect(document.querySelector('[data-digit]')).toBeNull();
    expect(screen.getByTestId('iface-hp').textContent).toBe('30');
  });

  it('z arkuszem cyfr rysuje cyfry z grafiki', () => {
    render(
      <UiArtProvider source={sourceOf({ 'iface.bar': [640, 100], 'iface.digits': [90, 12] })}>
        <IfaceBar {...base} />
      </UiArtProvider>,
    );
    expect(document.querySelectorAll('[data-digit]').length).toBeGreaterThan(0);
  });

  it('przycisk OPT przyjmuje wlasna etykiete i testid', () => {
    const onOptions = vi.fn();
    render(
      <UiArtProvider source={art}>
        <IfaceBar
          {...base}
          onOptions={onOptions}
          optionsLabel="Zapisy"
          optionsTestId="open-saves"
        />
      </UiArtProvider>,
    );
    const b = screen.getByTestId('open-saves');
    expect(b.getAttribute('aria-label')).toBe('Zapisy');
    fireEvent.click(b);
    expect(onOptions).toHaveBeenCalled();
  });

  describe('liczniki HP/KP na tle IFACE ze wzorcowymi cyframi', () => {
    const full = sourceOf({ 'iface.bar': [640, 100], 'iface.digits': [360, 17] });
    const cellsOf = (id: string) =>
      [...screen.getByTestId(id).querySelectorAll('[data-digit]')].map((e) => e.textContent);

    it('HP rysowane jako 4 komorki (znak + 3 cyfry z zerami), nie 2 cyfry', () => {
      render(
        <UiArtProvider source={full}>
          <IfaceBar messages={[]} hp={30} hpMax={30} />
        </UiArtProvider>,
      );
      expect(cellsOf('iface-hp')).toEqual(['', '0', '3', '0']);
    });

    it('ujemne KP rysuje minus w komorce znaku, a dodatnie zaslania wzorcowy minus', () => {
      render(
        <UiArtProvider source={full}>
          <IfaceBar messages={[]} ac={-5} />
        </UiArtProvider>,
      );
      expect(cellsOf('iface-ac')).toEqual(['-', '0', '0', '5']);
      cleanup();
      render(
        <UiArtProvider source={full}>
          <IfaceBar messages={[]} ac={12} />
        </UiArtProvider>,
      );
      const first = screen.getByTestId('iface-ac').querySelector('[data-digit]')!;
      expect(first.getAttribute('data-digit')).toBe('blank');
    });

    it('bez wartosci KP/HP pola zaslaniaja wzorcowe cyfry tla pustymi komorkami', () => {
      render(
        <UiArtProvider source={full}>
          <IfaceBar messages={[]} />
        </UiArtProvider>,
      );
      expect(screen.queryByTestId('iface-ac')).toBeNull();
      expect(screen.queryByTestId('iface-hp')).toBeNull();
      const blanks = screen.getAllByTestId('iface-counter-blank');
      expect(blanks).toHaveLength(2);
      for (const b of blanks) {
        const cells = [...b.querySelectorAll('[data-digit]')];
        expect(cells).toHaveLength(4);
        expect(cells.every((c) => c.getAttribute('data-digit') === 'blank')).toBe(true);
      }
    });
  });

  it('zdarzenia wskaznika z przycisku nie docieraja do rodzica (tap w pasek nie jest marszem po mapie)', () => {
    const seen = vi.fn();
    const onInventory = vi.fn();
    render(
      <UiArtProvider source={art}>
        <div onPointerDown={seen} onPointerUp={seen} onPointerMove={seen}>
          <IfaceBar {...base} onInventory={onInventory} />
        </div>
      </UiArtProvider>,
    );
    const inv = screen.getByTestId('iface-inv');
    fireEvent.pointerDown(inv, { pointerType: 'touch' });
    fireEvent.pointerMove(inv, { pointerType: 'touch' });
    fireEvent.pointerUp(inv, { pointerType: 'touch' });
    fireEvent.click(inv);
    expect(seen).not.toHaveBeenCalled();
    expect(onInventory).toHaveBeenCalledTimes(1);
  });

  it('fallback bez grafik tez nie przepuszcza zdarzen wskaznika do mapy', () => {
    const seen = vi.fn();
    render(
      <div onPointerDown={seen} onPointerUp={seen}>
        <IfaceBar {...base} onInventory={() => {}} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByTestId('iface-inv'));
    fireEvent.pointerUp(screen.getByTestId('iface-inv'));
    expect(seen).not.toHaveBeenCalled();
  });
});
