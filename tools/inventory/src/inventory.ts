import { frmExtensionDirection, parseFrm } from '@f2/formats';
import type { VfsLayer } from '@f2/vfs';

export interface CategoryStats {
  category: string;
  files: number;
  frames: number;
  pixels: number;
  maxWidth: number;
  maxHeight: number;
  animated: number;
}

const FRM_NAME = /\.(frm|fr[0-5])$/i;

/** Zlicza FRM po katalogach. Warstwy od najwyzszego priorytetu; nazwa z wyzszej warstwy zaslania nizsza. */
export async function collectInventory(
  layers: VfsLayer[],
  onError?: (name: string, message: string) => void,
): Promise<CategoryStats[]> {
  const seen = new Set<string>();
  const map = new Map<string, CategoryStats>();
  for (const layer of layers) {
    for (const key of layer.keys()) {
      if (!FRM_NAME.test(key) || seen.has(key)) continue;
      seen.add(key);
      const slash = key.lastIndexOf('/');
      const category = slash < 0 ? '' : key.slice(0, slash);
      try {
        const single = frmExtensionDirection(key);
        const frm = parseFrm(
          await layer.open(key),
          single === undefined ? {} : { singleDirection: single },
        );
        let s = map.get(category);
        if (!s) {
          s = { category, files: 0, frames: 0, pixels: 0, maxWidth: 0, maxHeight: 0, animated: 0 };
          map.set(category, s);
        }
        s.files++;
        s.frames += frm.framesPerDirection * frm.distinctDirections;
        if (frm.framesPerDirection > 1) s.animated++;
        const done = new Set<unknown>();
        for (const dir of frm.directions) {
          if (dir.length === 0 || done.has(dir)) continue;
          done.add(dir);
          for (const f of dir) {
            s.pixels += f.width * f.height;
            if (f.width > s.maxWidth) s.maxWidth = f.width;
            if (f.height > s.maxHeight) s.maxHeight = f.height;
          }
        }
      } catch (e) {
        onError?.(key, e instanceof Error ? e.message : String(e));
      }
    }
  }
  return [...map.values()];
}
