import { unzlibSync } from 'fflate';
import { FormatError } from '../errors.js';

/** Blad przekroczenia limitu rozmiaru: nie moze wpasc w fallback. */
class TooMuchData extends Error {}

async function inflateNative(data: Uint8Array, limit: number): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (globalThis as any).DecompressionStream;
  const ds = new Ctor('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const out = new Uint8Array(limit);
  let total = 0;
  try {
    // zapis i odczyt rownolegle, zeby uniknac zakleszczenia przy duzych danych
    const writing = (async () => {
      await writer.write(data);
      await writer.close();
    })();
    writing.catch(() => {});
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > limit) {
        throw new TooMuchData(`wynik przekracza oczekiwany rozmiar ${limit}`);
      }
      out.set(value, total);
      total += value.length;
    }
    await writing;
  } catch (e) {
    await reader.cancel().catch(() => {});
    writer.abort().catch(() => {});
    throw e;
  }
  return out.subarray(0, total);
}

/** Twardy limit rozmiaru wyniku (publiczne API: expectedSize bywa z niezaufanego naglowka). */
export const MAX_INFLATE_SIZE = 256 * 1024 * 1024;

/**
 * Do tego rozmiaru (po rozpakowaniu) liczy sie synchronicznie (fflate): strumien natywny
 * (`DecompressionStream`) ma stały koszt ~0.9 ms na wpis (pomiar: scripts/perf-bench.ts),
 * wiec dla typowych, malych wpisow DAT (FRM, PRO, MSG) jest wielokrotnie wolniejszy.
 * Duze wpisy (np. mapy, dzwieki) zostaja na strumieniu, zeby nie blokowac watku.
 */
export const SYNC_INFLATE_MAX = 256 * 1024;

export async function inflateZlib(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (!Number.isInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_INFLATE_SIZE) {
    throw new FormatError('zlib', `niedozwolony oczekiwany rozmiar: ${expectedSize}`);
  }
  let result: Uint8Array | undefined;
  if (
    expectedSize > SYNC_INFLATE_MAX &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).DecompressionStream === 'function'
  ) {
    try {
      result = await inflateNative(data, expectedSize);
    } catch (e) {
      if (e instanceof TooMuchData) throw new FormatError('zlib', e.message);
      result = undefined; // blad strumienia natywnego: fallback ponizej
    }
  }
  if (!result) {
    try {
      result = unzlibSync(data, { out: new Uint8Array(expectedSize + 1) });
    } catch (e) {
      throw new FormatError('zlib', `rozpakowanie zlib nie powiodlo sie: ${(e as Error).message}`);
    }
  }
  if (result.length > expectedSize) {
    throw new FormatError('zlib', `wynik przekracza oczekiwany rozmiar ${expectedSize}`);
  }
  if (result.length !== expectedSize) {
    throw new FormatError(
      'zlib',
      `rozmiar po rozpakowaniu ${result.length} != oczekiwany ${expectedSize}`,
    );
  }
  return result;
}
