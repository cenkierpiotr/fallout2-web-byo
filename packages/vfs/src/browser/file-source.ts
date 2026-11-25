import type { RandomAccessSource } from '@f2/formats';

const RETRY_DELAYS_MS = [20, 80, 250, 750, 1500, 3000, 5000];

/**
 * Odczyt z File z ponowieniem przy przejsciowym NotFoundError/NotReadableError: przegladarka bywa
 * (pod duzym obciazeniem, przy ponownym wskazaniu folderu na tej samej karcie) zwracac je dla
 * pliku, ktory chwile pozniej czyta sie poprawnie.
 */
export async function readBlob(
  blob: Blob,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await blob.arrayBuffer();
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      const delay = delays[attempt];
      if ((name !== 'NotFoundError' && name !== 'NotReadableError') || delay === undefined) throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Zrodlo dostepu swobodnego nad File (slice + arrayBuffer). */
export function fileSource(file: File): RandomAccessSource {
  return {
    size: file.size,
    async read(offset, length) {
      return new Uint8Array(await readBlob(file.slice(offset, offset + length)));
    },
  };
}
