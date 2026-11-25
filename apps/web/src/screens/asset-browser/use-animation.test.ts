import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { runAnimation } from './use-animation';

describe('runAnimation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fps 8, 12 klatek: po 125 ms klatka 1, po 1500 ms zawija do 0', () => {
    const frame = signal(0);
    const stop = runAnimation(frame, 8, 12, true);
    vi.advanceTimersByTime(125);
    expect(frame.value).toBe(1);
    vi.advanceTimersByTime(1375);
    expect(frame.value).toBe(0);
    stop();
  });

  it('fps 0 stoi na klatce 0', () => {
    const frame = signal(0);
    const stop = runAnimation(frame, 0, 12, true);
    vi.advanceTimersByTime(5000);
    expect(frame.value).toBe(0);
    stop();
  });

  it('pauza i zatrzymanie nie zmieniaja klatki', () => {
    const frame = signal(0);
    runAnimation(frame, 8, 12, false);
    vi.advanceTimersByTime(1000);
    expect(frame.value).toBe(0);
    const stop = runAnimation(frame, 8, 12, true);
    stop();
    vi.advanceTimersByTime(1000);
    expect(frame.value).toBe(0);
  });
});
