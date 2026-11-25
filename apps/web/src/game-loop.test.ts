import { describe, expect, it } from 'vitest';
import { GameLoop } from './game-loop';

describe('GameLoop', () => {
  it('fixed step accumulates 100 ms: 350 ms daje 3 kroki i alpha 0.5', () => {
    const steps: number[] = [];
    const alphas: number[] = [];
    const loop = new GameLoop(
      (t) => steps.push(t),
      (a) => alphas.push(a),
    );
    loop.frame(1000);
    expect(steps).toHaveLength(0);
    loop.frame(1350);
    expect(steps).toEqual([1, 1, 1]);
    expect(alphas[alphas.length - 1]).toBeCloseTo(0.5, 5);
  });

  it('ogranicza zaleglosc po dlugiej przerwie do 1 s', () => {
    let n = 0;
    const loop = new GameLoop(
      () => n++,
      () => {},
    );
    loop.frame(0);
    loop.frame(60_000);
    expect(n).toBe(10);
  });

  it('pauza wstrzymuje kroki, ale nadal rysuje', () => {
    let steps = 0;
    let renders = 0;
    const loop = new GameLoop(
      () => steps++,
      () => renders++,
    );
    loop.paused = true;
    loop.frame(0);
    loop.frame(500);
    expect(steps).toBe(0);
    expect(renders).toBe(2);
  });

  it('liczy fps z klatek na sekunde', () => {
    const loop = new GameLoop(
      () => {},
      () => {},
    );
    for (let i = 0; i <= 60; i++) loop.frame(i * (1000 / 60));
    expect(loop.fps.value).toBeGreaterThanOrEqual(58);
    expect(loop.fps.value).toBeLessThanOrEqual(62);
  });

  it('tempo gry mnozy zebrany czas (szybko 2x: 300 ms daje 6 krokow)', () => {
    let n = 0;
    const loop = new GameLoop(
      () => n++,
      () => {},
    );
    loop.speed = () => 2;
    loop.frame(0);
    loop.frame(300);
    expect(n).toBe(6);
  });
});
