import { gunzipText } from './gunzip-limited.js';
import { migrate } from './migrations.js';
import type { SaveError, SaveGame } from './schema.js';

/** JSON + gzip (CompressionStream). Nazwa pliku: `<postac>-<slot>-<data>.f2save.json.gz`. */
export async function exportSave(save: SaveGame): Promise<Blob> {
  const stream = new Blob([JSON.stringify(save)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export function exportFileName(save: SaveGame, date: Date = new Date(save.meta.realTime)): string {
  const safe = save.meta.characterName.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'save';
  return `${safe}-${save.meta.slot}-${date.toISOString().slice(0, 10)}.f2save.json.gz`;
}

export async function importSave(file: Blob): Promise<SaveGame | SaveError> {
  try {
    const text = await gunzipText(file);
    return migrate(text);
  } catch {
    return { error: 'save-corrupt' };
  }
}
