import { describe, expect, it } from 'vitest';
import { RingResampler } from '../src/worklet/acm-stream-processor.js';

describe('RingResampler', () => {
  it('ten sam rate: kopiuje probki, bez NaN', () => {
    const r = new RingResampler(1000, 1000, 1, 1);
    r.push(Int16Array.from([16384, 16384, 16384, 16384]));
    const out = [new Float32Array(3)];
    r.pull(out, 3);
    expect([...out[0]!]).toEqual([0.5, 0.5, 0.5]);
  });
  it('underrun daje cisze i zlicza', () => {
    const r = new RingResampler(1000, 1000, 1, 1);
    const out = [new Float32Array(4).fill(9)];
    r.pull(out, 4);
    expect([...out[0]!]).toEqual([0, 0, 0, 0]);
    expect(r.underruns).toBe(4);
  });
  it('upsampling x2 daje stala wartosc dla stalego sygnalu, mono -> stereo', () => {
    const r = new RingResampler(1000, 2000, 1, 1);
    r.push(new Int16Array(100).fill(8192));
    const out = [new Float32Array(50), new Float32Array(50)];
    r.pull(out, 50);
    expect(out[1]!.every((v) => v === 0.25)).toBe(true);
    expect(r.frames).toBeLessThan(100);
  });
  it('push nie przekracza pojemnosci', () => {
    const r = new RingResampler(10, 10, 1, 1);
    expect(r.push(new Int16Array(50))).toBe(10);
  });
});

describe('RingResampler: ramki stereo', () => {
  it('push nieparzystej liczby probek odrzuca niepelna ramke (kanaly nie zamieniaja sie)', () => {
    const r = new RingResampler(10, 10, 2, 1);
    expect(r.push(Int16Array.from([100, 200, 300]))).toBe(2);
    expect(r.frames).toBe(1);
  });
});
