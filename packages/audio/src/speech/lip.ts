export class LipFormatError extends Error {}

export interface LipMarker {
  type: number;
  offset: number;
}

export interface LipData {
  version: number;
  flags: number;
  u1: number;
  pcmBytes: number;
  phonemeCount: number;
  markerCount: number;
  acmName: string;
  phonemes: Uint8Array;
  markers: LipMarker[];
}

const HEADER = 44;

/** Parsuje plik LIP v2 (big-endian), spec: dokumentacja techniczna */
export function parseLip(bytes: Uint8Array): LipData {
  if (bytes.length < HEADER) throw new LipFormatError('LIP za krotki');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== 2) throw new LipFormatError(`Nieobslugiwana wersja LIP: ${version}`);
  const flags = view.getUint32(4);
  const u1 = view.getUint32(8);
  const pcmBytes = view.getUint32(16);
  const phonemeCount = view.getUint32(20);
  const markerCount = view.getUint32(28);
  if (markerCount !== phonemeCount + 1) {
    throw new LipFormatError('markerCount musi byc rowne phonemeCount + 1');
  }
  const expected = HEADER + phonemeCount + 8 * markerCount;
  if (bytes.length !== expected) throw new LipFormatError('Rozmiar LIP nie pasuje do licznikow');

  let acmName = '';
  for (let i = 32; i < 40; i++) {
    const c = bytes[i] ?? 0;
    if (c === 0) break;
    acmName += String.fromCharCode(c);
  }
  const phonemes = bytes.slice(HEADER, HEADER + phonemeCount);
  const markers: LipMarker[] = [];
  const base = HEADER + phonemeCount;
  let prev = 0;
  for (let i = 0; i < markerCount; i++) {
    const type = view.getUint32(base + 8 * i);
    const offset = view.getUint32(base + 8 * i + 4);
    if (type > 1) throw new LipFormatError(`Zly typ markera ${i}: ${type}`);
    if (i === 0 && offset !== 0) throw new LipFormatError('Marker 0 musi miec offset 0');
    if (offset < prev) throw new LipFormatError(`Marker ${i} cofa pozycje`);
    prev = offset;
    markers.push({ type, offset });
  }
  return { version, flags, u1, pcmBytes, phonemeCount, markerCount, acmName, phonemes, markers };
}
