import {
  backupFileName,
  exportAllSaves,
  importBackup,
  type BackupImportResult,
  type SaveStore,
} from '@f2/engine-core';

/** Eksport wszystkich zapisow do pliku `.f2save` (pobranie przez <a download>, dziala tez na Safari). */
export async function backupToDownload(
  store: SaveStore,
  download: (blob: Blob, fileName: string) => void,
  now: Date = new Date(),
): Promise<void> {
  const blob = await exportAllSaves(store, { app: 'fallout2-web', now: now.getTime() });
  download(blob, backupFileName(now));
}

export const restoreFromFile = (
  store: SaveStore,
  file: Blob,
  mode: 'merge' | 'replace',
): Promise<BackupImportResult> => importBackup(file, store, mode);

export function backupMessageKey(r: BackupImportResult): string {
  if (r.errors.includes('backup-corrupt')) return 'backup.corrupt';
  if (r.errors.length > 0) return 'backup.partial';
  return r.imported > 0 ? 'backup.done' : 'backup.nothingNew';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
