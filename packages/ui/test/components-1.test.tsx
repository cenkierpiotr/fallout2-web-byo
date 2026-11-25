import { act, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pointer } from './helpers';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  ICON_NAMES,
  Panel,
  ProgressBar,
  Select,
  Slider,
  Tabs,
  Toggle,
  Tooltip,
} from '../src/components';

describe('Button', () => {
  it('calls onPress on click and not when disabled', () => {
    const onPress = vi.fn();
    const { rerender } = render(
      <Button variant="primary" onPress={onPress}>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(
      <Button variant="primary" disabled onPress={onPress}>
        Go
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes variant and size as classes', () => {
    render(
      <Button variant="danger" size="lg" onPress={() => {}}>
        X
      </Button>,
    );
    const b = screen.getByRole('button');
    expect(b.className).toContain('f2-button--danger');
    expect(b.className).toContain('f2-button--lg');
    expect(b.getAttribute('type')).toBe('button');
  });

  it('icon variant requires aria-label (throws in dev)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Button variant="icon" onPress={() => {}}>
          <Icon name="close" />
        </Button>,
      ),
    ).toThrow(/aria-label/);
    spy.mockRestore();
    render(
      <Button variant="icon" aria-label="Zamknij" onPress={() => {}}>
        <Icon name="close" />
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeTruthy();
  });
});

describe('IconButton and icons', () => {
  it('uses label as aria-label', () => {
    const onPress = vi.fn();
    render(<IconButton icon="inventory" label="Ekwipunek" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekwipunek' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('ships the 24 starter icons', () => {
    expect(ICON_NAMES).toHaveLength(24);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.querySelector('path, circle, rect, line, polyline, polygon')).toBeTruthy();
      unmount();
    }
  });
});

describe('Panel, Badge', () => {
  it('Panel renders title and children', () => {
    render(
      <Panel title="Postac">
        <p>tresc</p>
      </Panel>,
    );
    expect(screen.getByText('Postac')).toBeTruthy();
    expect(screen.getByText('tresc')).toBeTruthy();
  });
  it('Badge renders tone class', () => {
    render(<Badge tone="warning">3</Badge>);
    expect(screen.getByText('3').className).toContain('f2-badge--warning');
  });
});

function touchEvent(el: Element, type: 'pointerdown' | 'pointerup') {
  pointer(el, type);
}

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows on focus and hides on blur / Escape', () => {
    render(
      <Tooltip content="Podpowiedz">
        <button type="button">Cel</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    const btn = screen.getByRole('button', { name: 'Cel' });
    act(() => btn.focus());
    expect(screen.getByRole('tooltip').textContent).toBe('Podpowiedz');
    expect(btn.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => btn.focus());
    fireEvent.blur(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on mouse hover', () => {
    render(
      <Tooltip content="Hover">
        <button type="button">Cel</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn.parentElement!);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(btn.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('touch: long-press 350 ms shows, shorter press does not', () => {
    render(
      <Tooltip content="Dotyk">
        <button type="button">Cel</button>
      </Tooltip>,
    );
    const wrap = screen.getByRole('button').parentElement!;
    touchEvent(wrap, 'pointerdown');
    act(() => void vi.advanceTimersByTime(200));
    touchEvent(wrap, 'pointerup');
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.queryByRole('tooltip')).toBeNull();
    touchEvent(wrap, 'pointerdown');
    act(() => void vi.advanceTimersByTime(360));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it("trigger='info' renders an info button that toggles the tooltip", () => {
    render(
      <Tooltip content="Info" trigger="info">
        <span>Pole</span>
      </Tooltip>,
    );
    const info = screen.getByRole('button', { name: /info/i });
    fireEvent.click(info);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(info);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'a', label: 'Alfa' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ];
  function Wrap({ onChange }: { onChange?: (id: string) => void }) {
    const [v, setV] = useState('a');
    return (
      <Tabs
        items={items}
        value={v}
        placement="top"
        onChange={(id) => {
          setV(id);
          onChange?.(id);
        }}
      />
    );
  }

  it('has tablist/tab roles and aria-selected', () => {
    render(<Wrap />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
    expect(tabs[0]!.getAttribute('tabindex')).toBe('0');
    expect(tabs[1]!.getAttribute('tabindex')).toBe('-1');
  });

  it('arrow navigation wraps, Home/End jump', () => {
    const onChange = vi.fn();
    render(<Wrap onChange={onChange} />);
    const tabs = () => screen.getAllByRole('tab');
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(tabs()[1]!, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(tabs()[2]!, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(tabs()[0]!, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('click selects', () => {
    const onChange = vi.fn();
    render(<Wrap onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

describe('Toggle', () => {
  it('is a switch that toggles', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Dzwiek" />);
    const sw = screen.getByRole('switch', { name: 'Dzwiek' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Slider', () => {
  it('keyboard: arrows, Home, End; clamps to range', () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={10} step={2} value={4} onChange={onChange} label="Glosnosc" />);
    const s = screen.getByRole('slider', { name: 'Glosnosc' });
    expect(s.getAttribute('aria-valuenow')).toBe('4');
    expect(s.getAttribute('aria-valuemin')).toBe('0');
    expect(s.getAttribute('aria-valuemax')).toBe('10');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.keyDown(s, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(s, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(s, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(s, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('does not exceed max with arrow', () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={10} step={3} value={9} onChange={onChange} label="L" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});

describe('Select', () => {
  it('renders options and reports change', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Jezyk"
        value="pl"
        onChange={onChange}
        options={[
          { value: 'pl', label: 'Polski' },
          { value: 'en', label: 'English' },
        ]}
      />,
    );
    const sel = screen.getByLabelText('Jezyk') as HTMLSelectElement;
    expect(sel.value).toBe('pl');
    fireEvent.change(sel, { target: { value: 'en' } });
    expect(onChange).toHaveBeenCalledWith('en');
  });
});

describe('ProgressBar', () => {
  it('has progressbar role and aria values', () => {
    render(<ProgressBar value={30} max={120} label="Punkty zycia" tone="hp" />);
    const p = screen.getByRole('progressbar', { name: 'Punkty zycia' });
    expect(p.getAttribute('aria-valuenow')).toBe('30');
    expect(p.getAttribute('aria-valuemin')).toBe('0');
    expect(p.getAttribute('aria-valuemax')).toBe('120');
    expect(p.className).toContain('f2-progress--hp');
  });
  it('clamps value to 0..max', () => {
    render(<ProgressBar value={999} max={10} label="x" tone="neutral" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
  });
});
