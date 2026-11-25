import { fireEvent, render, screen } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityTab, applyA11y, defaultA11y, setLocale } from '../src';
import { pickGridNeighbor, stepIndex, useRovingFocus } from '../src/a11y/useRovingFocus';

beforeEach(() => setLocale('pl'));

const rect = (l: number, t: number): DOMRect =>
  ({ left: l, top: t, width: 10, height: 10 }) as DOMRect;

describe('useRovingFocus (czyste funkcje)', () => {
  it('stepIndex: granice i zawijanie', () => {
    expect(stepIndex(3, 2, 1, false)).toBe(2);
    expect(stepIndex(3, 2, 1, true)).toBe(0);
    expect(stepIndex(3, 0, -1, true)).toBe(2);
    expect(stepIndex(0, 0, 1, true)).toBe(-1);
  });
  it('pickGridNeighbor: siatka 3x2', () => {
    const r = [rect(0, 0), rect(20, 0), rect(40, 0), rect(0, 20), rect(20, 20), rect(40, 20)];
    expect(pickGridNeighbor(r, 0, 'right')).toBe(1);
    expect(pickGridNeighbor(r, 1, 'down')).toBe(4);
    expect(pickGridNeighbor(r, 4, 'up')).toBe(1);
    expect(pickGridNeighbor(r, 2, 'right')).toBe(2);
    expect(pickGridNeighbor(r, 3, 'left')).toBe(3);
  });
});

function Grid({ orientation }: { orientation: 'vertical' | 'horizontal' | 'grid' }) {
  const ref = useRef<HTMLDivElement>(null);
  useRovingFocus(ref, '.cell', { orientation });
  return (
    <div ref={ref}>
      {[1, 2, 3].map((n) => (
        <button key={n} class="cell" data-testid={`c${n}`}>
          {n}
        </button>
      ))}
    </div>
  );
}

describe('useRovingFocus (DOM)', () => {
  it('tylko jeden element ma tabindex=0, strzalki i Home/End przenosza fokus', () => {
    render(<Grid orientation="horizontal" />);
    const c = [1, 2, 3].map((n) => screen.getByTestId(`c${n}`));
    expect(c.map((e) => e.tabIndex)).toEqual([0, -1, -1]);
    c[0]!.focus();
    fireEvent.keyDown(c[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(c[1]);
    expect(c.map((e) => e.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(c[1]!, { key: 'End' });
    expect(document.activeElement).toBe(c[2]);
    fireEvent.keyDown(c[2]!, { key: 'Home' });
    expect(document.activeElement).toBe(c[0]);
  });
  it('ignoruje strzalki w poprzek osi', () => {
    render(<Grid orientation="horizontal" />);
    const c0 = screen.getByTestId('c1');
    c0.focus();
    fireEvent.keyDown(c0, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(c0);
  });
});

describe('applyA11y', () => {
  it('ustawia i czysci atrybuty na elemencie', () => {
    const el = document.createElement('div');
    applyA11y({ ...defaultA11y, colorBlind: 'deutan', reduceMotion: true }, el);
    expect(el.dataset['colorblind']).toBe('deutan');
    expect(el.dataset['reduceMotion']).toBe('true');
    applyA11y(defaultA11y, el);
    expect(el.dataset['colorblind']).toBeUndefined();
    expect(el.dataset['reduceMotion']).toBe('false');
  });
});

describe('AccessibilityTab', () => {
  it('pokazuje podglad skali i zglasza zmiany', () => {
    const onChange = vi.fn();
    render(<AccessibilityTab values={{ ...defaultA11y, fontScale: 1.25 }} onChange={onChange} />);
    expect(screen.getByTestId('a11y-preview').textContent).toContain('125%');
    fireEvent.click(screen.getByRole('switch', { name: 'Napisy do mowy' }));
    expect(onChange).toHaveBeenCalledWith('speechCaptions', true);
    fireEvent.change(screen.getByLabelText('Tryb dla daltonistów'), {
      target: { value: 'tritan' },
    });
    expect(onChange).toHaveBeenCalledWith('colorBlind', 'tritan');
  });
});
