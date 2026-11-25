import { readDat2Entry } from '../../src/dat2/index.js';
import type { Dat2Index } from '../../src/dat2/index.js';
import { FormatError } from '../../src/errors.js';
import { frmExtensionDirection, parseFrm } from '../../src/frm/index.js';
import type { Frm } from '../../src/frm/index.js';
import type { RandomAccessSource } from '../../src/io/source.js';

export interface FrmWalkLayer {
  name: string;
  index: Dat2Index;
  src: RandomAccessSource;
}

export interface FrmWalkResult {
  total: number;
  ok: number;
  errors: { name: string; message: string }[];
}

const FRM_NAME = /\.(frm|fr[0-5])$/i;

/** Iteruje wpisy .frm i .fr0..fr5 wszystkich warstw; blad pojedynczego pliku nie przerywa przebiegu. */
export async function walkAllFrm(
  layers: FrmWalkLayer[],
  onFile: (name: string, frm: Frm | FormatError) => void,
): Promise<FrmWalkResult> {
  const result: FrmWalkResult = { total: 0, ok: 0, errors: [] };
  for (const layer of layers) {
    for (const entry of layer.index.entries) {
      if (!FRM_NAME.test(entry.name)) continue;
      result.total++;
      const name = `${layer.name}/${entry.name}`;
      try {
        const bytes = await readDat2Entry(layer.src, entry);
        const single = frmExtensionDirection(entry.name);
        const frm = parseFrm(bytes, single === undefined ? undefined : { singleDirection: single });
        result.ok++;
        onFile(name, frm);
      } catch (e) {
        const err =
          e instanceof FormatError
            ? e
            : new FormatError('frm', e instanceof Error ? e.message : String(e));
        result.errors.push({ name, message: err.message });
        onFile(name, err);
      }
    }
  }
  return result;
}
