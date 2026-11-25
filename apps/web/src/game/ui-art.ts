import type { Frm } from '@f2/formats';
import { canvasToUrl, frameToRgba } from './icon-sprites';

export interface UiArtImage {
  url: string;
  width: number;
  height: number;
}

export interface UiArtSource {
  /** undefined = laduje sie, null = brak/blad (trwale), obraz = gotowy. */
  get(name: string, frame?: number): UiArtImage | null | undefined;
  subscribe(cb: () => void): () => void;
}

export function createUiArt(deps: {
  pathFor(name: string): string | undefined;
  loadFrm(path: string): Promise<Frm>;
  paletteRgba: Uint8Array;
  toUrl: typeof canvasToUrl;
}): UiArtSource {
  const cache = new Map<string, UiArtImage | null>();
  const pending = new Set<string>();
  const subs = new Set<() => void>();
  const notify = (): void => {
    for (const cb of subs) cb();
  };
  return {
    get(name, frame = 0) {
      const key = `${name}#${frame}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      if (pending.has(key)) return undefined;
      const path = deps.pathFor(name);
      if (!path) {
        cache.set(key, null);
        return null;
      }
      pending.add(key);
      void deps
        .loadFrm(path)
        .then((frm) => {
          const f = frm.directions[0]?.[frame];
          cache.set(
            key,
            f
              ? {
                  url: deps.toUrl(frameToRgba(f, deps.paletteRgba), f.width, f.height),
                  width: f.width,
                  height: f.height,
                }
              : null,
          );
        })
        .catch(() => cache.set(key, null))
        .finally(() => {
          pending.delete(key);
          notify();
        });
      return undefined;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}
