import { describe, expect, it, vi } from 'vitest';
import { GestureRecognizer } from './gestures.js';

describe('GestureRecognizer', () => {
  it('tap', () => {
    const onTap = vi.fn();
    const g = new GestureRecognizer({ onTap });
    g.down(1, 10, 10, 0);
    g.up(1, 10, 10, 50);
    expect(onTap).toHaveBeenCalledWith(10, 10);
  });
  it('pan bez tapa', () => {
    const onTap = vi.fn();
    const onPan = vi.fn();
    const onPanEnd = vi.fn();
    const g = new GestureRecognizer({ onTap, onPan, onPanEnd });
    g.down(1, 10, 10, 0);
    g.move(1, 30, 10, 20);
    g.up(1, 30, 10, 40);
    expect(onPan).toHaveBeenCalledTimes(1);
    expect(onPan).toHaveBeenCalledWith(20, 0);
    expect(onTap).not.toHaveBeenCalled();
    expect(onPanEnd).toHaveBeenCalledTimes(1);
  });
  it('pan przyrostowy', () => {
    const onPan = vi.fn();
    const g = new GestureRecognizer({ onPan });
    g.down(1, 0, 0, 0);
    g.move(1, 20, 0, 1);
    g.move(1, 25, 3, 2);
    expect(onPan).toHaveBeenNthCalledWith(2, 5, 3);
  });
  it('pinch', () => {
    const onPinch = vi.fn();
    const onTap = vi.fn();
    const g = new GestureRecognizer({ onPinch, onTap });
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 0);
    g.move(2, 300, 100, 10);
    expect(onPinch).toHaveBeenCalledWith(2, 200, 100);
    g.up(2, 300, 100, 20);
    g.up(1, 100, 100, 20);
    expect(onTap).not.toHaveBeenCalled();
  });
});
