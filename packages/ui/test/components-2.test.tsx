import { act, fireEvent, render, screen } from '@testing-library/preact';
import { render as preactRender } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextMenu,
  Dialog,
  Grid,
  List,
  Modal,
  RadialMenu,
  Sheet,
  ToastProvider,
  useToast,
  VirtualList,
} from '../src/components';
import { pointer } from './helpers';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="T" onClose={() => {}}>
        <button type="button">w</button>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is aria-modal, labelled by title, focuses first control', () => {
    render(
      <Modal open title="Ustawienia" onClose={() => {}}>
        <button type="button">Pierwszy</button>
        <button type="button">Drugi</button>
      </Modal>,
    );
    const d = screen.getByRole('dialog', { name: 'Ustawienia' });
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Zamknij' }));
  });

  it('Esc zamyka dialog tez gdy fokus jest poza nim, tylko najwyzszy z dwoch', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <>
        <Modal open title="Dolny" onClose={lower}>
          x
        </Modal>
        <Modal open title="Gorny" onClose={upper}>
          y
        </Modal>
      </>,
    );
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('Esc dziala od razu po wstawieniu dialogu do DOM (bez czekania na efekty po malowaniu)', () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    // czysty render preact (bez act): efekty `useEffect` jeszcze nie ruszyly, efekty ukladu juz tak
    preactRender(
      <Modal open title="T" onClose={onClose}>
        <button type="button">A</button>
      </Modal>,
      host,
    );
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    preactRender(null, host);
    host.remove();
  });

  it('traps focus and closes on Esc', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        <button type="button">A</button>
        <button type="button">B</button>
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'Zamknij' });
    const a = screen.getByRole('button', { name: 'A' });
    const b = screen.getByRole('button', { name: 'B' });
    b.focus();
    fireEvent.keyDown(b, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(b);
    a.focus();
    fireEvent.keyDown(a, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button and backdrop click call onClose; restores focus', () => {
    const onClose = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            otworz
          </button>
          <Modal
            open={open}
            title="T"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            x
          </Modal>
        </div>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'otworz' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('Sheet', () => {
  it('is a dialog with a handle; closed renders nothing', () => {
    const { rerender } = render(
      <Sheet open={false} onClose={() => {}} snap="half">
        tresc
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <Sheet open onClose={() => {}} snap="full">
        tresc
      </Sheet>,
    );
    const d = screen.getByRole('dialog');
    expect(d.className).toContain('f2-sheet--full');
    expect(screen.getByTestId('sheet-handle')).toBeTruthy();
  });

  it('Tab krazy w obrebie panelu (pulapka fokusu)', () => {
    render(
      <Sheet open onClose={() => {}} snap="half">
        <button type="button">a</button>
        <button type="button">b</button>
      </Sheet>,
    );
    const d = screen.getByRole('dialog');
    const a = screen.getByText('a');
    const b = screen.getByText('b');
    b.focus();
    fireEvent.keyDown(b, { key: 'Tab' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(b);
    d.focus();
    fireEvent.keyDown(d, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(b);
  });

  it('closes on pan down > 80px, stays open for less', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} snap="half">
        tresc
      </Sheet>,
    );
    const handle = screen.getByTestId('sheet-handle');
    pointer(handle, 'pointerdown', { clientY: 400 });
    pointer(handle, 'pointermove', { clientY: 450 });
    pointer(handle, 'pointerup', { clientY: 450 });
    expect(onClose).not.toHaveBeenCalled();
    pointer(handle, 'pointerdown', { clientY: 400 });
    pointer(handle, 'pointermove', { clientY: 500 });
    pointer(handle, 'pointerup', { clientY: 500 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} snap="half">
        <button type="button">x</button>
      </Sheet>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ContextMenu', () => {
  const items = [
    { id: 'use', label: 'Uzyj' },
    { id: 'drop', label: 'Upusc', disabled: true },
    { id: 'look', label: 'Obejrzyj' },
  ];
  it('renders menu with items at anchor, skips disabled on arrow nav', () => {
    const onSelect = vi.fn();
    render(<ContextMenu items={items} anchor={{ x: 10, y: 20 }} onSelect={onSelect} />);
    const menu = screen.getByRole('menu');
    expect((menu as HTMLElement).style.left).toBe('10px');
    expect((menu as HTMLElement).style.top).toBe('20px');
    const mi = screen.getAllByRole('menuitem');
    expect(mi).toHaveLength(3);
    expect(document.activeElement).toBe(mi[0]);
    fireEvent.keyDown(mi[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(mi[2]);
    fireEvent.keyDown(mi[2]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(mi[0]);
    fireEvent.keyDown(mi[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(mi[2]);
  });
  it('click selects enabled, ignores disabled; Esc calls onClose', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu items={items} anchor={{ x: 0, y: 0 }} onSelect={onSelect} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Obejrzyj' }));
    expect(onSelect).toHaveBeenCalledWith('look');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upusc' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RadialMenu', () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `i${i}`,
      label: `Opcja ${i}`,
      icon: 'use' as const,
    }));

  it('positions 6 items on a circle, evenly spaced, first on top', () => {
    render(<RadialMenu items={mk(6)} center={{ x: 200, y: 300 }} onSelect={() => {}} />);
    const mi = screen.getAllByRole('menuitem');
    expect(mi).toHaveLength(6);
    const pts = mi.map((el) => {
      const st = (el as HTMLElement).style;
      return { dx: parseFloat(st.left), dy: parseFloat(st.top) };
    });
    const r = Math.hypot(pts[0]!.dx, pts[0]!.dy);
    expect(r).toBeGreaterThan(60);
    for (const p of pts) expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(r, 1);
    expect(pts[0]!.dx).toBeCloseTo(0, 1);
    expect(pts[0]!.dy).toBeCloseTo(-r, 1);
    const ang = pts.map((p) => Math.atan2(p.dy, p.dx));
    const step = (2 * Math.PI) / 6;
    for (let i = 1; i < 6; i++) {
      let d = ang[i]! - ang[i - 1]!;
      if (d < 0) d += 2 * Math.PI;
      expect(d).toBeCloseTo(step, 2);
    }
  });

  it('items are at least 56px and labelled; selects by click', () => {
    const onSelect = vi.fn();
    render(<RadialMenu items={mk(3)} center={{ x: 0, y: 0 }} onSelect={onSelect} />);
    const el = screen.getByRole('menuitem', { name: 'Opcja 1' }) as HTMLElement;
    expect(el.style.width).toBe('56px');
    expect(el.style.height).toBe('56px');
    fireEvent.click(el);
    expect(onSelect).toHaveBeenCalledWith('i1');
  });

  it('renders at most 8 items', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<RadialMenu items={mk(11)} center={{ x: 0, y: 0 }} onSelect={() => {}} />);
    expect(screen.getAllByRole('menuitem')).toHaveLength(8);
    spy.mockRestore();
  });
});

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function Trigger({ ms }: { ms?: number }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.show('Zapisano', 'ok', ms)}>
        go
      </button>
    );
  }

  it('announces via aria-live=polite and auto-dismisses', () => {
    render(
      <ToastProvider>
        <Trigger ms={1000} />
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(region.textContent).toContain('Zapisano');
    expect(region.querySelector('.f2-toast--ok')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1100));
    expect(region.textContent).toBe('');
  });

  it('useToast outside provider throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow();
    spy.mockRestore();
  });
});

describe('List and Grid', () => {
  it('List renders items with render fn and list roles', () => {
    render(<List items={['a', 'b', 'c']} label="Lista" render={(x) => <span>{x}</span>} />);
    expect(screen.getByRole('list', { name: 'Lista' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
  it('List onSelect on click', () => {
    const onSelect = vi.fn();
    render(<List items={['a', 'b']} label="L" render={(x) => x} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('listitem')[1]!.querySelector('button')!);
    expect(onSelect).toHaveBeenCalledWith('b', 1);
  });
  it('Grid sets min cell width and renders items', () => {
    const { container } = render(
      <Grid items={[1, 2, 3, 4]} minCell={72} label="Siatka" render={(n) => <i>{n}</i>} />,
    );
    const g = screen.getByRole('list', { name: 'Siatka' }) as HTMLElement;
    expect(g.style.gridTemplateColumns).toContain('72px');
    expect(container.querySelectorAll('li')).toHaveLength(4);
  });
});

describe('VirtualList', () => {
  const items = Array.from({ length: 1000 }, (_, i) => i);
  it('renders only visible rows plus overscan and sets total height', () => {
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={40}
        height={200}
        overscan={2}
        label="Dluga"
        render={(n) => <span>wiersz {n}</span>}
      />,
    );
    const rows = container.querySelectorAll('[data-index]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5 + 2 + 2);
    expect(screen.getByText('wiersz 0')).toBeTruthy();
    expect(screen.queryByText('wiersz 500')).toBeNull();
    const inner = container.querySelector('.f2-vlist__inner') as HTMLElement;
    expect(inner.style.height).toBe('40000px');
  });
  it('renders window around scrollTop after scroll', () => {
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={40}
        height={200}
        overscan={2}
        label="Dluga"
        render={(n) => <span>wiersz {n}</span>}
      />,
    );
    const sc = screen.getByRole('list', { name: 'Dluga' });
    sc.scrollTop = 4000;
    fireEvent.scroll(sc);
    expect(screen.getByText('wiersz 100')).toBeTruthy();
    expect(screen.queryByText('wiersz 0')).toBeNull();
    expect(container.querySelectorAll('[data-index]').length).toBeLessThanOrEqual(9);
  });
});

describe('Dialog (game screen)', () => {
  it('shows speaker and text, numbered options, choose by click and digit key', () => {
    const onChoose = vi.fn();
    render(
      <Dialog
        speaker="Vic"
        text="Czego chcesz?"
        options={[
          { id: 'a', label: 'Handel' },
          { id: 'b', label: 'Nic', disabled: true },
          { id: 'c', label: 'Pa' },
        ]}
        onChoose={onChoose}
      />,
    );
    expect(screen.getByRole('region', { name: 'Vic' })).toBeTruthy();
    expect(screen.getByText('Czego chcesz?')).toBeTruthy();
    const opts = screen.getAllByRole('button');
    expect(opts).toHaveLength(3);
    expect(opts[0]!.textContent).toContain('1');
    fireEvent.click(opts[0]!);
    expect(onChoose).toHaveBeenLastCalledWith('a');
    fireEvent.click(opts[1]!);
    expect(onChoose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('region'), { key: '3' });
    expect(onChoose).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(screen.getByRole('region'), { key: '2' });
    expect(onChoose).toHaveBeenCalledTimes(2);
  });
});
