import { signal, type Signal } from '@preact/signals';
import { SPEED_FACTOR, settings } from './settings';

/** Dlugosc kroku symulacji w ms (1 tick GameClock = 1/10 s). */
export const STEP_MS = 100;
/** Gorny limit zaleglosci po przerwie (karta w tle), zeby nie wpasc w spirale krokow. */
const MAX_FRAME_MS = 1000;

/**
 * Petla o stalym kroku 100 ms: `step(1)` wolane tyle razy, ile pelnych krokow sie zebralo,
 * potem `render(alpha)` z ulamkiem kroku (0..1). Zegar to `requestAnimationFrame`;
 * `frame(now)` jest publiczne, zeby dalo sie je testowac bez przegladarki.
 */
export class GameLoop {
  readonly fps: Signal<number> = signal(0);
  private acc = 0;
  private last: number | null = null;
  private raf = 0;
  private running = false;
  private fpsStart = 0;
  private fpsFrames = 0;
  paused = false;
  /** Mnoznik tempa gry (ustawienie `gameSpeed`); podmieniany w testach. */
  speed: () => number = () => SPEED_FACTOR[settings.value.gameSpeed];

  constructor(
    private readonly step: (ticks: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = null;
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.last = null;
  }

  frame(now: number): void {
    if (this.last === null) {
      this.last = now;
      this.fpsStart = now;
      this.fpsFrames = 0;
    }
    const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - this.last));
    this.last = now;
    if (!this.paused) {
      this.acc += dt * this.speed();
      while (this.acc >= STEP_MS) {
        this.step(1);
        this.acc -= STEP_MS;
      }
    }
    this.render(this.acc / STEP_MS);
    this.fpsFrames++;
    const span = now - this.fpsStart;
    if (span >= 500) {
      this.fps.value = Math.round((this.fpsFrames * 1000) / span);
      this.fpsStart = now;
      this.fpsFrames = 0;
    }
  }
}
