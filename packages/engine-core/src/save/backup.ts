import { gunzipText } from './gunzip-limited.js';
import { migrate } from './migrations.js';
import { SAVE_SLOTS, isValidSlot, type SaveGame } from './schema.js';
import type { SaveStore } from './save-store.js';

export const BACKUP_MAGIC = 'f2save-backup';

export interface BackupImportResult {
  imported: number;
  skipped: number;
  /** Kody bledow: `backup-corrupt` (caly plik) albo `<slot>:<kod>` (pojedynczy zapis). */
  errors: string[];
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/** Wszystkie czytelne sloty magazynu w jednym pliku `.f2save` (JSON + gzip). */
export async function exportAllSaves(
  store: SaveStore,
  info: { app: string; now?: number },
): Promise<Blob> {
  const slots: SaveGame[] = [];
  for (const slot of SAVE_SLOTS) {
    const s = await store.read(slot);
    if (s) slots.push(s);
  }
  return gzip(
    JSON.stringify({
      magic: BACKUP_MAGIC,
      app: info.app,
      exportedAt: info.now ?? Date.now(),
      slots,
    }),
  );
}

export function backupFileName(date: Date = new Date()): string {
  return `fallout2-web-${date.toISOString().slice(0, 10)}.f2save`;
}

/**
 * Import kopii. `merge`: slot z nowszym `meta.realTime` wygrywa, sloty spoza kopii zostaja;
 * `replace`: sloty kopii nadpisuja wszystko, pozostale sloty sa usuwane (dopiero po poprawnym odczycie pliku).
 */
export async function importBackup(
  file: Blob,
  store: SaveStore,
  mode: 'merge' | 'replace',
): Promise<BackupImportResult> {
  const fail: BackupImportResult = { imported: 0, skipped: 0, errors: ['backup-corrupt'] };
  let doc: unknown;
  try {
    const text = await gunzipText(file);
    doc = JSON.parse(text);
  } catch {
    return fail;
  }
  if (
    typeof doc !== 'object' ||
    doc === null ||
    (doc as { magic?: unknown }).magic !== BACKUP_MAGIC ||
    !Array.isArray((doc as { slots?: unknown }).slots)
  ) {
    return fail;
  }
  const result: BackupImportResult = { imported: 0, skipped: 0, errors: [] };
  const accepted: SaveGame[] = [];
  for (const raw of (doc as { slots: unknown[] }).slots) {
    const r = migrate(raw);
    const rawSlot = raw as { meta?: { slot?: unknown }; slot?: unknown } | null;
    const id = String(rawSlot?.meta?.slot ?? rawSlot?.slot ?? '?');
    if ('error' in r) {
      result.errors.push(`${id}:${r.error}`);
    } else if (!isValidSlot(r.meta.slot)) {
      result.errors.push(`${id}:bad-slot`);
    } else {
      accepted.push(r);
    }
  }
  if (mode === 'replace') {
    const keep = new Set(accepted.map((s) => s.meta.slot));
    for (const slot of SAVE_SLOTS) if (!keep.has(slot)) await store.delete(slot);
  }
  for (const s of accepted) {
    if (mode === 'merge') {
      const cur = await store.read(s.meta.slot);
      if (cur && cur.meta.realTime >= s.meta.realTime) {
        result.skipped++;
        continue;
      }
    }
    await store.write(s.meta.slot, s);
    result.imported++;
  }
  return result;
}
