import type { SerializedArray } from './arrays.js';
import type { SfallImpl } from './register.js';

/** Zapisywalny stan podzbioru sfall (do pola `sfall` w zapisie gry). */
export interface SfallStateJSON {
  version: 1;
  globals: Record<string, number>;
  arrays: SerializedArray[];
  globalScripts: { name: string; repeat: number; acc: number }[];
}

export function snapshotSfall(impl: SfallImpl): SfallStateJSON {
  return {
    version: 1,
    globals: impl.globals.serialize(),
    arrays: impl.arrays.serialize(),
    globalScripts: impl.globalScripts.serialize(),
  };
}

/** Odtwarza stan; global scripts przywracane tylko dla juz zaladowanych (po `load`). */
export function restoreSfall(impl: SfallImpl, s: SfallStateJSON): void {
  impl.globals.restore(s.globals);
  impl.arrays.restore(s.arrays);
  impl.globalScripts.restore(s.globalScripts);
}
