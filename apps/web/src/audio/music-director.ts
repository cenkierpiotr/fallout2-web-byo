import { signal, type Signal } from '@preact/signals';
import type { MusicPlayer } from '@f2/audio';
import { musicPath } from './paths';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Muzyka tla wg pola `music=` z maps.txt; brak pliku (np. pusty sound/music) = cisza. */
export class MusicDirector {
  readonly current: Signal<string | null> = signal(null);
  readonly error: Signal<string | null> = signal(null);
  private token = 0;

  constructor(
    private readonly music: Pick<MusicPlayer, 'play' | 'stop'>,
    private readonly has: (path: string) => boolean,
    private readonly crossfadeMs = 1500,
  ) {}

  async onMap(name: string | undefined): Promise<void> {
    const my = ++this.token;
    this.error.value = null;
    if (!name) {
      this.current.value = null;
      await this.music.stop(this.crossfadeMs);
      return;
    }
    if (name === this.current.value) return;
    const path = musicPath(name);
    if (!this.has(path)) {
      this.error.value = `brak muzyki ${name} (${path})`;
      this.current.value = null;
      await this.music.stop(this.crossfadeMs);
      return;
    }
    try {
      await this.music.play(path, { loop: true, crossfadeMs: this.crossfadeMs });
      if (my === this.token) this.current.value = name;
    } catch (e) {
      if (my === this.token) {
        this.error.value = `muzyka ${name}: ${msg(e)}`;
        this.current.value = null;
      }
    }
  }
}
