import { pickAmbient, type AmbientSfx, type SfxPlayer } from '@f2/audio';

export interface AmbientTimers {
  set(cb: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const realTimers: AmbientTimers = {
  set: (cb, ms) => setTimeout(cb, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Dzwieki otoczenia mapy (`ambient_sfx=` z maps.txt). Z: odstep losowy 15-20 s (z exe 0x452634:
 * rand(15..20) * 10 tickow, tick = 100 ms niezweryfikowany) i minimum 5 s miedzy efektami (0x1388 ms, D).
 */
export class AmbientDirector {
  private timer: unknown = null;
  private token = 0;

  constructor(
    private readonly sfx: Pick<SfxPlayer, 'play'>,
    private readonly rand: () => number = Math.random,
    private readonly timers: AmbientTimers = realTimers,
    private readonly minMs = 15000,
    private readonly maxMs = 20000,
  ) {}

  onMap(list: readonly AmbientSfx[] | undefined): void {
    this.stop();
    if (!list?.length) return;
    const my = this.token;
    const schedule = (): void => {
      const wait = this.minMs + this.rand() * (this.maxMs - this.minMs);
      this.timer = this.timers.set(() => {
        if (my !== this.token) return;
        const pick = pickAmbient(list, this.rand);
        void (pick ? this.sfx.play(pick.name.toUpperCase()) : Promise.resolve()).finally(() => {
          if (my === this.token) schedule();
        });
      }, wait);
    };
    schedule();
  }

  stop(): void {
    this.token++;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}
