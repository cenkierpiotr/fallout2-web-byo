import {
  Mixer,
  MusicPlayer,
  SfxPlayer,
  SpeechPlayer,
  type AcmDecoder,
  type MixChannel,
  type MusicAcm,
  type MusicDeps,
  type MusicNodeLike,
  type SchedulerOptions,
  type SpeechVfs,
} from '@f2/audio';

export type Volumes = Record<MixChannel, number>;

/** Zaleznosci miksera i odtwarzaczy; w testach atrapy (bez prawdziwego AudioContext). */
export interface AudioSystemDeps extends SchedulerOptions {
  ctx: AudioContext;
  vfs: SpeechVfs;
  /** Klient workera ACM (`AcmWorkerClient`) w postaci surowej: decode -> {header, samples}. */
  acm: {
    decode(buf: Uint8Array): Promise<{
      header: { channels: number; sampleRate: number };
      samples: Int16Array;
    }>;
  } & MusicAcm;
  createNode: MusicDeps['createNode'];
  schedule?: MusicDeps['schedule'];
  volumes?: Partial<Volumes>;
  /** Cel nasluchu pierwszego gestu (domyslnie brak: wolaj `resume()` recznie). */
  gestureTarget?: EventTarget;
}

/** Mikser + mowa + muzyka na jednym kontekscie audio. */
export class AudioSystem {
  readonly mixer: Mixer;
  readonly speech: SpeechPlayer;
  readonly music: MusicPlayer;
  readonly sfx: SfxPlayer;
  private resuming: Promise<void> | null = null;

  constructor(private readonly d: AudioSystemDeps) {
    this.mixer = new Mixer(d.ctx, d.volumes);
    const decoder: AcmDecoder = {
      decode: async (bytes) => {
        const r = await d.acm.decode(bytes);
        return { pcm: r.samples, channels: r.header.channels, sampleRate: r.header.sampleRate };
      },
    };
    this.speech = new SpeechPlayer(d.ctx, d.vfs, decoder, this.mixer.channel('speech'), {
      ...(d.raf ? { raf: d.raf } : {}),
      ...(d.caf ? { caf: d.caf } : {}),
    });
    this.sfx = new SfxPlayer(d.ctx, d.vfs, decoder, this.mixer.channel('sfx'));
    this.music = new MusicPlayer(d.ctx as never, d.vfs, d.acm, this.mixer.channel('music'), {
      createNode: d.createNode as (o: { sourceRate: number; channels: number }) => MusicNodeLike,
      ...(d.schedule ? { schedule: d.schedule } : {}),
    });
    if (d.gestureTarget) this.mixer.resumeOnGesture(d.gestureTarget);
  }

  /** Wznawia kontekst (przegladarka wymaga gestu); bezpieczne wielokrotnie. */
  resume(): Promise<void> {
    if (this.d.ctx.state === 'running') return Promise.resolve();
    this.resuming ??= this.d.ctx
      .resume()
      .catch(() => undefined)
      .finally(() => {
        this.resuming = null;
      });
    return this.resuming;
  }

  applyVolumes(v: Partial<Volumes>): void {
    for (const ch of ['master', 'music', 'sfx', 'speech'] as const) {
      const x = v[ch];
      if (x !== undefined) this.mixer.setVolume(ch, x);
    }
  }

  dispose(): void {
    this.speech.stop();
    this.sfx.stopAll();
    void this.music.stop();
  }
}
