/** Limit rozpakowanego JSON-a importu (zapis/kopia/profil); realne pliki to co najwyzej kilka MB. */
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

/**
 * Rozpakowuje gzip do tekstu, przerywajac po przekroczeniu `maxBytes` (ochrona przed gzip-bomb:
 * maly plik rozpakowujacy sie do GB). Rzuca RangeError przy przekroczeniu, inne bledy z DecompressionStream.
 */
export async function gunzipText(file: Blob, maxBytes: number = MAX_IMPORT_BYTES): Promise<string> {
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new RangeError('import: plik zbyt duzy po rozpakowaniu');
      parts.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return new TextDecoder().decode(all);
}
