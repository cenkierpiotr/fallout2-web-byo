import { normalizeDatPath } from '@f2/formats';
import { writeOpfsFile } from './opfs-write.js';
import { isGamePath, walkDirectory, type PickedFolder } from './pick-folder.js';

export const OPFS_DIR = 'fallout2-game';
/** Znacznik zapisywany jako OSTATNI; jego brak = kopia przerwana/niekompletna. */
export const COMPLETE_MARKER = '.complete';

/** Zapisywany na poczatku kopii: sygnatura zrodla; pozwala wznowic przerwana kopie (ten sam zestaw plikow). */
export const SESSION_FILE = '.session';

export interface CopyOptions {
  /** Przerwanie kopii; czesciowe dane zostaja i kolejna kopia tego samego zrodla je wznowi. */
  signal?: AbortSignal;
  /** Postep w bajtach (laczny, dla duzych plikow ktore sa jednym "plikiem" w onProgress). */
  onBytes?: (done: number, total: number) => void;
}

/** Sygnatura zrodla: nazwy, rozmiary i daty modyfikacji (bez zawartosci). */
function sourceSignature(entries: [string, File][]): string {
  return JSON.stringify(
    entries
      .map(([k, f]) => [k, f.size, f.lastModified] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
  );
}

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

/**
 * Kopiuje master/critter/patch000 i data/** do OPFS (strumieniowo, kawalkami); zwraca folder kind 'opfs'.
 * Przerwana kopia (brak .complete) jest wznawiana: pliki o pelnym rozmiarze sa pomijane.
 */
export async function copyToOpfs(
  folder: PickedFolder,
  onProgress: (done: number, total: number) => void,
  opts: CopyOptions = {},
): Promise<PickedFolder> {
  const root = await navigator.storage.getDirectory();
  const entries = [...folder.files].filter(([k]) => isGamePath(k));
  const sig = sourceSignature(entries);
  let base: FileSystemDirectoryHandle | null = null;
  let resume = false;
  try {
    base = await root.getDirectoryHandle(OPFS_DIR);
    resume =
      (await readText(base, COMPLETE_MARKER)) === null &&
      (await readText(base, SESSION_FILE)) === sig;
  } catch {
    /* nie istnialo */
  }
  if (!resume) {
    try {
      await root.removeEntry(OPFS_DIR, { recursive: true });
    } catch {
      /* nie istnialo */
    }
    base = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    await writeOpfsFile(await base.getFileHandle(SESSION_FILE, { create: true }), sig);
  }
  const dest = base as FileSystemDirectoryHandle;
  const total = entries.length;
  const totalBytes = entries.reduce((a, [, f]) => a + f.size, 0);
  let doneBytes = 0;
  let done = 0;
  onProgress(0, total);
  for (const [key, file] of entries) {
    if (opts.signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
    const parts = key.split('/');
    const name = parts.pop() as string;
    let dir = dest;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const fh = await dir.getFileHandle(name, { create: true });
    const skip = resume && (await fh.getFile()).size === file.size;
    if (!skip) {
      const before = doneBytes;
      await writeOpfsFile(fh, file, {
        ...(opts.signal ? { signal: opts.signal } : {}),
        onBytes: (w) => opts.onBytes?.(before + w, totalBytes),
      });
    }
    doneBytes += file.size;
    opts.onBytes?.(doneBytes, totalBytes);
    onProgress(++done, total);
  }
  await finalizeOpfsCopy(dest, total, '');
  const files = await walkDirectory(dest, true);
  return { kind: 'opfs', files, handle: dest };
}

/** Zapisuje znacznik .complete (ZAWSZE jako ostatni) i usuwa plik sesji. */
export async function finalizeOpfsCopy(
  base: FileSystemDirectoryHandle,
  files: number,
  root: string,
): Promise<void> {
  const marker = await base.getFileHandle(COMPLETE_MARKER, { create: true });
  await writeOpfsFile(marker, JSON.stringify(root ? { files, root } : { files }));
  try {
    await base.removeEntry(SESSION_FILE);
  } catch {
    /* nie bylo */
  }
}

export async function openOpfsFolder(dir?: string): Promise<PickedFolder | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle(dir ?? OPFS_DIR);
    // brak znacznika = kopia przerwana: nie uznawaj jej za poprawna
    const marker = await (await base.getFileHandle(COMPLETE_MARKER)).getFile();
    const meta = JSON.parse(await marker.text()) as { files?: number; root?: string };
    // root: import ZIP zapisuje gre w podkatalogu archiwum (np. "Fallout 2/")
    let at = base;
    for (const p of (meta.root ?? '').split('/').filter(Boolean)) {
      at = await at.getDirectoryHandle(p);
    }
    const files = await walkDirectory(at, true);
    if (files.size !== meta.files) return null;
    if (!files.has(normalizeDatPath('master.dat'))) return null;
    return { kind: 'opfs', files, handle: at };
  } catch {
    return null;
  }
}

/** Usuwa zapisana w przegladarce kopie plikow gry (OPFS). */
export async function clearOpfs(dir: string = OPFS_DIR): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(dir, { recursive: true });
  } catch {
    /* nie istnialo */
  }
}
