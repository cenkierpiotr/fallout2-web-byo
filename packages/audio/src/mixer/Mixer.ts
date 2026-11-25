export type MixChannel = 'master' | 'music' | 'sfx' | 'speech';
type SubChannel = Exclude<MixChannel, 'master'>;

const TC = 0.01; // stala czasowa rampy (5*TC = 50 ms)
const SUB: readonly SubChannel[] = ['music', 'sfx', 'speech'];

const clamp01 = (v: number): number => (Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)));

/** Mikser: kanaly music/sfx/speech -> master -> destination, krzywa gain = v*v. */
export class Mixer {
  private readonly master: GainNode;
  private readonly channels = new Map<SubChannel, GainNode>();
  private readonly volumes: Record<MixChannel, number> = { master: 1, music: 1, sfx: 1, speech: 1 };
  private muted = false;

  constructor(
    private readonly ctx: AudioContext,
    initial?: Partial<Record<MixChannel, number>>,
  ) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const ch of ['master', ...SUB] as const) {
      const v = initial?.[ch];
      if (v !== undefined) this.volumes[ch] = clamp01(v);
    }
    this.apply(this.master, this.volumes.master);
    for (const ch of SUB) this.apply(this.channel(ch), this.volumes[ch]);
  }

  channel(ch: SubChannel): GainNode {
    let node = this.channels.get(ch);
    if (!node) {
      node = this.ctx.createGain();
      node.connect(this.master);
      this.channels.set(ch, node);
      this.apply(node, this.volumes[ch]);
    }
    return node;
  }

  setVolume(ch: MixChannel, v: number): void {
    const c = clamp01(v);
    this.volumes[ch] = c;
    if (ch === 'master') {
      if (!this.muted) this.apply(this.master, c);
    } else {
      this.apply(this.channel(ch), c);
    }
  }

  getVolume(ch: MixChannel): number {
    return this.volumes[ch];
  }

  /** Pierwszy gest (pointerdown/keydown) wznawia AudioContext, potem listenery znikaja. */
  resumeOnGesture(target: EventTarget): void {
    const handler = (): void => {
      target.removeEventListener('pointerdown', handler);
      target.removeEventListener('keydown', handler);
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    };
    target.addEventListener('pointerdown', handler);
    target.addEventListener('keydown', handler);
  }

  /** Blur wycisza master (rampa <= 50 ms), focus przywraca aktualna wartosc. */
  bindFocusMute(win: Window): void {
    win.addEventListener('blur', () => {
      this.muted = true;
      this.apply(this.master, 0);
    });
    win.addEventListener('focus', () => {
      this.muted = false;
      this.apply(this.master, this.volumes.master);
    });
  }

  /** Wartosc z fallout2.cfg (0..32767) -> 0..1, np. 22281 -> 0.68. */
  static fromCfg(cfgValue: number): number {
    return clamp01(cfgValue / 32767);
  }

  private apply(node: GainNode, v: number): void {
    node.gain.setTargetAtTime(v * v, this.ctx.currentTime, TC);
  }
}
