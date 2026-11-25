import { readBlob } from './file-source.js';
import { hashFile } from './sha256.js';
import type { PickedFolder } from './pick-folder.js';

/** Znane sumy kontrolne oryginalnych plikow (SHA-256). Inne wydania (GOG, Steam, PL) = Z: nieznane, tylko ostrzezenie. */
export interface KnownFile {
  name: 'master.dat' | 'critter.dat' | 'patch000.dat';
  size: number;
  sha256: string;
}
export interface KnownEdition {
  id: string;
  label: string;
  files: KnownFile[];
}

export const KNOWN_EDITIONS: KnownEdition[] = [
  {
    id: 'retail-1.02-en',
    label: 'Fallout 2 1.02 (EN, retail)',
    files: [
      {
        name: 'master.dat',
        size: 333098563,
        sha256: 'f7239dfd3a1fd84c975f2ba41fff9a9709f9d7b50a3dc8a659ec5066948438f9',
      },
      {
        name: 'critter.dat',
        size: 166951131,
        sha256: 'da83d615967c0bac41fbc50e6b86b3088401ff69ed9d8b2e5be1d6ac0c125bcd',
      },
      {
        name: 'patch000.dat',
        size: 2355526,
        sha256: '16122a47d9fa1fb2f490d1fb38bb1b7eb8ca8edcf2c06a2c9d78beed812ff564',
      },
    ],
  },
];

export type FileCheck = 'ok' | 'size-mismatch' | 'hash-mismatch' | 'unknown' | 'broken' | 'missing';

export interface VerifyFileResult {
  name: string;
  size: number;
  /** rezultat sprawdzenia struktury DAT2 (stopka: rozmiar danych == rozmiar pliku) */
  structure: 'ok' | 'broken';
  check: FileCheck;
  sha256?: string;
}

export interface VerifyResult {
  /** verified: pasuje do znanego wydania; unknown: poprawna struktura, nieznane wydanie; invalid: uszkodzone/niekompletne */
  status: 'verified' | 'unknown' | 'invalid';
  edition?: string;
  files: VerifyFileResult[];
}

/** Stopka DAT2: ostatnie 8 bajtow = [rozmiar drzewa, rozmiar calego pliku] (u32 LE). */
export async function checkDat2Footer(file: Blob): Promise<boolean> {
  if (file.size < 16) return false;
  const dv = new DataView(await readBlob(file.slice(file.size - 8)));
  const tree = dv.getUint32(0, true);
  const total = dv.getUint32(4, true);
  return total === file.size && tree > 0 && tree < file.size;
}

const NAMES = ['master.dat', 'critter.dat', 'patch000.dat'] as const;

/** Szybka kontrola (rozmiar + stopka); `deep` liczy tez pelne SHA-256 (ok. 10 MB/s w TS). */
export async function verifyGameFiles(
  folder: PickedFolder,
  opts: {
    deep?: boolean;
    editions?: KnownEdition[];
    onProgress?: (name: string, done: number, total: number) => void;
  } = {},
): Promise<VerifyResult> {
  const files: VerifyFileResult[] = [];
  for (const name of NAMES) {
    const f = folder.files.get(name);
    if (!f) {
      if (name !== 'patch000.dat')
        files.push({ name, size: 0, structure: 'broken', check: 'missing' });
      continue;
    }
    const structure = (await checkDat2Footer(f)) ? 'ok' : 'broken';
    const r: VerifyFileResult = {
      name,
      size: f.size,
      structure,
      check: structure === 'ok' ? 'unknown' : 'broken',
    };
    if (opts.deep && structure === 'ok') {
      r.sha256 = await hashFile(f, (d, t) => opts.onProgress?.(name, d, t), 1024 * 1024);
    }
    files.push(r);
  }
  if (files.some((f) => f.check === 'missing' || f.check === 'broken'))
    return { status: 'invalid', files };

  for (const ed of opts.editions ?? KNOWN_EDITIONS) {
    let match = true;
    for (const f of files) {
      const k = ed.files.find((x) => x.name === f.name);
      if (!k) {
        match = false;
        continue;
      }
      if (k.size !== f.size) {
        f.check = 'size-mismatch';
        match = false;
      } else if (f.sha256 !== undefined) {
        f.check = f.sha256 === k.sha256 ? 'ok' : 'hash-mismatch';
        if (f.check !== 'ok') match = false;
      } else {
        f.check = 'ok'; // rozmiar zgodny; pelny hash niewykonany
      }
    }
    if (match) {
      const hashed = files.every((f) => f.sha256 !== undefined);
      return { status: hashed ? 'verified' : 'unknown', edition: ed.id, files };
    }
  }
  for (const f of files)
    if (f.check !== 'hash-mismatch' && f.check !== 'size-mismatch') f.check = 'unknown';
  // rozmiar zgodny ze znanym, a hash nie: uszkodzenie, nie inne wydanie
  if (files.some((f) => f.check === 'hash-mismatch')) return { status: 'invalid', files };
  return { status: 'unknown', files };
}
