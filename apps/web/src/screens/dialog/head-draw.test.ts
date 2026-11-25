import { describe, expect, it, vi } from 'vitest';
import { drawHead, mouthIndex, type HeadFrame } from './head-draw';

const frame = (w: number, h: number): HeadFrame => ({
  width: w,
  height: h,
  rgba: new Uint8ClampedArray(w * h * 4),
});

describe('mouthIndex', () => {
  it('przycina sygnal ust do 0..count-1 i toleruje smieci', () => {
    expect(mouthIndex(0, 9)).toBe(0);
    expect(mouthIndex(8, 9)).toBe(8);
    expect(mouthIndex(9, 9)).toBe(8);
    expect(mouthIndex(-3, 9)).toBe(0);
    expect(mouthIndex(Number.NaN, 9)).toBe(0);
    expect(mouthIndex(3.7, 9)).toBe(3);
    expect(mouthIndex(5, 0)).toBe(0);
  });
  it('gdy klatek jest mniej niz 9, ostatnia klatka', () => {
    expect(mouthIndex(7, 1)).toBe(0);
  });
});

describe('drawHead', () => {
  it('czyści płótno i rysuje klatke odpowiadajaca ustom', () => {
    const frames = Array.from({ length: 9 }, (_, i) => frame(i + 1, 2));
    const ctx = { clearRect: vi.fn(), putImageData: vi.fn() };
    const mk = vi.fn((d: Uint8ClampedArray, w: number, h: number) => ({ d, w, h }));
    const idx = drawHead(ctx, frames, 4, mk);
    expect(idx).toBe(4);
    expect(ctx.clearRect).toHaveBeenCalledOnce();
    expect(mk).toHaveBeenCalledWith(frames[4]!.rgba, 5, 2);
    expect(ctx.putImageData).toHaveBeenCalledOnce();
  });
  it('brak klatek: tylko czyszczenie', () => {
    const ctx = { clearRect: vi.fn(), putImageData: vi.fn() };
    expect(drawHead(ctx, [], 2, () => ({}))).toBe(-1);
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });
});
