import { parseBio, parseGcd, type GcdRecord } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';

/** Postac premade z kreatora (gcd.md): plik GCD, biografia i FRM twarzy. */
export interface Preset {
  id: string;
  gcd: GcdRecord;
  bio: string;
  fid: number;
}

/** Tablica 0x51c850: sciezki i faceFrm (201..203). Napisy "VID" to pozostalosc narzedziowa, nie implementowane. */
export const PRESET_TABLE: readonly { id: string; fid: number }[] = [
  { id: 'combat', fid: 201 },
  { id: 'stealth', fid: 202 },
  { id: 'diplomat', fid: 203 },
];

export async function loadPresets(vfs: Pick<VirtualFs, 'open'>): Promise<Preset[]> {
  const out: Preset[] = [];
  for (const { id, fid } of PRESET_TABLE) {
    const gcd = parseGcd(await vfs.open(`premade/${id}.gcd`));
    const bio = parseBio(await vfs.open(`premade/${id}.bio`));
    out.push({ id, gcd, bio, fid });
  }
  return out;
}
