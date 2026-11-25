import { effect, signal, type Signal } from '@preact/signals';
import type { SpeechPlayer } from '@f2/audio';

export interface DialogCue {
  speechPath: string;
  lipPath?: string;
  subtitle?: string;
}

type SpeechLike = Pick<SpeechPlayer, 'say' | 'stop'>;

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Mowa dialogowa: kwestia NPC -> SpeechPlayer + LipSync; wystawia sygnaly dla UI
 * (klatka ust glowy 0..8, napis, stan). Brak/uszkodzony plik mowy nie psuje dialogu:
 * napis zostaje, blad trafia do `error`.
 */
export class DialogAudio {
  readonly mouth: Signal<number> = signal(0);
  readonly subtitle: Signal<string | null> = signal(null);
  readonly speaking: Signal<boolean> = signal(false);
  readonly error: Signal<string | null> = signal(null);
  /** Dlugosc ostatnio odtwarzanej kwestii (ms) i informacja czy ma synchronizacje ust. */
  readonly durationMs: Signal<number> = signal(0);
  readonly hasLip: Signal<boolean> = signal(false);
  private token = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly speech: SpeechLike) {}

  /** Nowsze `show` uniewaznia starsze; wywolania sa szeregowane, by dwa `say` nie wyscigaly sie. */
  show(cue: DialogCue | undefined): Promise<void> {
    const my = ++this.token;
    if (!cue) {
      this.reset();
      return Promise.resolve();
    }
    this.subtitle.value = cue.subtitle ?? null;
    this.error.value = null;
    const run = async (): Promise<void> => {
      if (my !== this.token) return; // juz nieaktualne
      try {
        const h = await this.speech.say(cue.speechPath, {
          ...(cue.lipPath ? { lipPath: cue.lipPath } : {}),
          ...(cue.subtitle ? { subtitle: cue.subtitle } : {}),
          onMouth: (f) => {
            if (my === this.token) this.mouth.value = f;
          },
          onEnd: () => {
            if (my === this.token) this.speaking.value = false;
          },
        });
        if (my === this.token) {
          this.speaking.value = true;
          this.durationMs.value = h.durationMs;
          this.hasLip.value = h.hasLip;
        }
      } catch (e) {
        if (my === this.token) {
          this.error.value = msg(e);
          this.speaking.value = false;
        }
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p;
    return p;
  }

  close(): void {
    this.token++;
    this.reset();
  }

  private reset(): void {
    this.speech.stop();
    this.subtitle.value = null;
    this.speaking.value = false;
    this.mouth.value = 0;
    this.error.value = null;
  }
}

/** Podpina sygnal dialogu: zmiana wezla gra kwestie, `null` zatrzymuje mowe. Zwraca odpiecie. */
export function bindDialogAudio<V>(
  audio: DialogAudio,
  source: { readonly value: V | null },
  cueOf: (v: V) => DialogCue | undefined,
): () => void {
  let first = true;
  return effect(() => {
    const v = source.value;
    if (v === null) {
      if (!first) audio.close();
    } else {
      void audio.show(cueOf(v));
    }
    first = false;
  });
}
