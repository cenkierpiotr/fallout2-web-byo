import { effect, signal } from '@preact/signals';
import type { DecodeClient } from '@f2/assets';
import { settings } from '../settings';
import { createRemoteVfs, type RemoteVfs } from '../screens/map/remote-vfs';
import type { AudioSystem } from './audio-system';
import { AmbientDirector } from './ambient-director';
import { DialogAudio } from './dialog-audio';
import { MusicDirector } from './music-director';
import { createWebAudioSystem } from './web-audio';

export interface AudioBundle {
  system: AudioSystem;
  rvfs: RemoteVfs;
  dialog: DialogAudio;
  music: MusicDirector;
  ambient: AmbientDirector;
}

const cache = new WeakMap<DecodeClient, Promise<AudioBundle>>();

/** Jeden zestaw audio na klienta gry (leniwie; AudioContext powstaje po pierwszym uzyciu). */
export function ensureAudio(c: DecodeClient): Promise<AudioBundle> {
  let p = cache.get(c);
  if (!p) {
    p = (async () => {
      const rvfs = await createRemoteVfs(c);
      const system = await createWebAudioSystem(rvfs.vfs, settings.value.volume);
      effect(() => system.applyVolumes(settings.value.volume));
      const bundle: AudioBundle = {
        system,
        rvfs,
        dialog: new DialogAudio(system.speech),
        music: new MusicDirector(system.music, (path) => rvfs.has(path)),
        ambient: new AmbientDirector(system.sfx),
      };
      if (import.meta.env.DEV) (window as unknown as { __f2audio?: unknown }).__f2audio = bundle;
      return bundle;
    })();
    p.catch(() => cache.delete(c));
    cache.set(c, p);
  }
  return p;
}

/** Blad inicjalizacji audio (np. brak Web Audio); UI pokazuje komunikat zamiast wyjatku. */
export const audioError = signal<string | null>(null);
