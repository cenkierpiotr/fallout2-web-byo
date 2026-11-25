import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { normalizeDatPath } from '@f2/formats';
import { COMPLETE_MARKER, finalizeOpfsCopy, OPFS_DIR } from './opfs-copy.js';
import { openOpfsWriter, writeOpfsFile, type OpfsWriter } from './opfs-write.js';
import { walkDirectory, type PickedFolder } from './pick-folder.js';
import { MAX_ZIP_GAME_BYTES, gameRoot, maybeGame } from './zip-import.js';

/** Maly kawalek wejscia: ogranicza ilosc danych rozpakowanych naraz (bufor pracy ~ kawalek x wspolczynnik kompresji). */
const IN_CHUNK = 256 * 1024;
/** Maks. rozpakowanych, jeszcze niezapisanych bajtow w kolejce; powyzej = zip-bomba / absurdalna kompresja. */
const MAX_QUEUED = 64 * 1024 * 1024;

export interface ZipToOpfsOptions {
  maxBytes?: number;
  signal?: AbortSignal;
  /** Test/strojenie: wielkosc kawalka wejscia. */
  inChunk?: number;
  /** Test: najwiekszy naraz zakolejkowany (rozpakowany, niezapisany) bufor. */
  onQueuePeak?: (bytes: number) => void;
}

/** Dziennik importu ZIP w katalogu bazowym: sygnatura archiwum + pliki zapisane w calosci (nazwa -> rozmiar). */
export const ZIP_JOURNAL = '.zipsession';

interface ZipJournal {
  sig: string;
  done: Record<string, number>;
}

function zipSignature(zip: Blob): string {
  const f = zip as Blob & { name?: string; lastModified?: number };
  return `${zip.size}:${f.name ?? ''}:${f.lastModified ?? 0}`;
}

async function readJournal(base: FileSystemDirectoryHandle): Promise<ZipJournal | null> {
  try {
    const j = JSON.parse(await (await (await base.getFileHandle(ZIP_JOURNAL)).getFile()).text());
    return typeof j?.sig === 'string' && j.done && typeof j.done === 'object' ? j : null;
  } catch {
    return null;
  }
}

const segs = (name: string): string[] => name.split(/[\\/]/).filter((s) => s && s !== '.');

/**
 * Importuje ZIP z gra prosto do OPFS: wpisy sa rozpakowywane i zapisywane kawalkami, bez
 * skladania calych plikow w pamieci. Archiwum nie ma spisu z przodu, wiec pliki ida do OPFS
 * pod swoimi sciezkami z archiwum, a po przeczytaniu calosci ustalamy katalog gry (`root` w znaczniku).
 * Blad: caly import jest sprzatany. Przerwanie (AbortSignal) lub odswiezenie strony: pliki zapisane w calosci
 * zostaja (dziennik `.zipsession`), niedokonczone sa usuwane, a kolejny import TEGO SAMEGO archiwum
 * (rozmiar+nazwa+data) pomija gotowe pliki (bez rozpakowywania) i wznawia od pierwszego niepelnego.
 * Jesli nic nie zapisano w calosci, przerwanie sprzata caly katalog. Hasha w ZIP-ie nie sprawdzamy
 * (lokalny wpis nie niesie sumy przy strumieniu), pomijany plik musi miec zapisany rozmiar.
 */
export async function zipToOpfs(
  zip: Blob,
  onProgress?: (done: number, total: number) => void,
  opts: ZipToOpfsOptions = {},
): Promise<PickedFolder> {
  const maxBytes = opts.maxBytes ?? MAX_ZIP_GAME_BYTES;
  const step = Math.max(1, opts.inChunk ?? IN_CHUNK);
  if (opts.signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
  const storage = await navigator.storage.getDirectory();
  const sig = zipSignature(zip);
  let journal: ZipJournal = { sig, done: {} };
  let resumable = false;
  try {
    const prevBase = await storage.getDirectoryHandle(OPFS_DIR);
    const prev = await readJournal(prevBase);
    const complete = await prevBase.getFileHandle(COMPLETE_MARKER).then(
      () => true,
      () => false,
    );
    if (prev && prev.sig === sig && !complete) {
      journal = prev;
      resumable = true;
    }
  } catch {
    /* nie istnialo */
  }
  if (!resumable) {
    try {
      await storage.removeEntry(OPFS_DIR, { recursive: true });
    } catch {
      /* nie istnialo */
    }
  }
  const base = await storage.getDirectoryHandle(OPFS_DIR, { create: true });
  const saveJournal = async (): Promise<void> =>
    writeOpfsFile(await base.getFileHandle(ZIP_JOURNAL, { create: true }), JSON.stringify(journal));
  const dirOf = async (name: string, create: boolean) => {
    const parts = segs(name);
    const file = parts.pop() as string;
    let dir = base;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return { dir, file };
  };
  // gotowe pliki z poprzedniej proby: tylko te o zgodnym rozmiarze (sprawdzane z gory, wpis zip jest synchroniczny)
  const skip = new Set<string>();
  for (const [name, size] of Object.entries(journal.done)) {
    try {
      const { dir, file } = await dirOf(name, false);
      if ((await (await dir.getFileHandle(file)).getFile()).size === size) skip.add(name);
      else delete journal.done[name];
    } catch {
      delete journal.done[name];
    }
  }
  await saveJournal();

  const names: string[] = [];
  const open = new Map<OpfsWriter, string>();
  let stopped = false;
  let failure: Error | null = null;
  let seen = 0;
  let inflated = 0;
  let queued = 0;
  let io: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): void => {
    io = io.then(fn);
    io.catch(() => undefined); // wynik odbieramy przez `await io` po kazdym kawalku
  };

  const unzip = new Unzip((entry) => {
    seen++;
    const name = entry.name;
    if (name.startsWith('/') || name.split(/[\\/]/).includes('..')) {
      failure = new Error('zip: niebezpieczna sciezka');
      return;
    }
    if (name.endsWith('/') || !maybeGame(name)) return;
    names.push(name);
    if (skip.has(name)) {
      inflated += journal.done[name] ?? 0;
      return; // bez entry.start(): fflate pomija dane wpisu bez rozpakowywania
    }
    let w: OpfsWriter | null = null;
    enqueue(async () => {
      if (stopped) return;
      const { dir, file } = await dirOf(name, true);
      w = await openOpfsWriter(await dir.getFileHandle(file, { create: true }));
      open.set(w, name);
    });
    let written = 0;
    entry.ondata = (err, data, final) => {
      if (err) {
        failure = err;
        return;
      }
      inflated += data.length;
      if (inflated > maxBytes) {
        failure = new Error('zip: archiwum zbyt duze po rozpakowaniu');
        entry.terminate();
        return;
      }
      const len = data.length;
      queued += len;
      opts.onQueuePeak?.(queued);
      if (queued > MAX_QUEUED) {
        failure = new Error('zip: zbyt wysoki wspolczynnik kompresji');
        entry.terminate();
        return;
      }
      enqueue(async () => {
        const cur = w as OpfsWriter | null;
        if (!cur) return;
        if (stopped) return;
        if (len > 0) await cur.write(data); // write moze przekazac wlasnosc bufora
        queued -= len;
        written += len;
        if (final) {
          await cur.close();
          open.delete(cur);
          journal.done[name] = written;
          await saveJournal();
        }
      });
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  /** Przerwanie: zostaw gotowe pliki i dziennik, usun tylko niedokonczone; bez gotowych plikow sprzatnij wszystko. */
  const cleanupAborted = async (): Promise<void> => {
    stopped = true;
    await io.catch(() => undefined);
    for (const [w, name] of open) {
      await w.abort();
      try {
        const { dir, file } = await dirOf(name, false);
        await dir.removeEntry(file);
      } catch {
        /* ignoruj */
      }
    }
    open.clear();
    if (Object.keys(journal.done).length === 0) await cleanup();
  };
  const cleanup = async (): Promise<void> => {
    stopped = true;
    for (const w of open.keys()) await w.abort();
    open.clear();
    try {
      await storage.removeEntry(OPFS_DIR, { recursive: true });
    } catch {
      /* ignoruj */
    }
  };

  const total = zip.size;
  try {
    for (let o = 0; o < total; o += step) {
      if (opts.signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
      const buf = new Uint8Array(await zip.slice(o, o + step).arrayBuffer());
      unzip.push(buf, o + step >= total);
      if (failure) throw failure;
      await io; // backpressure: nie czytamy dalej, dopoki zapis nie nadazy
      if (failure) throw failure;
      onProgress?.(Math.min(o + step, total), total);
    }
    await io;
    if (total === 0 || seen === 0) throw new Error('zip: nieprawidlowe archiwum');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      await cleanupAborted();
      throw e;
    }
    await cleanup();
    throw e instanceof Error && e.message.startsWith('zip:')
      ? e
      : new Error(
          `zip: nie mozna odczytac archiwum (${e instanceof Error ? e.message : String(e)})`,
        );
  }

  const root = gameRoot(names);
  if (root === null) {
    await cleanup();
    return { kind: 'files', files: new Map() };
  }
  try {
    await base.removeEntry(ZIP_JOURNAL);
  } catch {
    /* ignoruj */
  }
  const master = names.find((n) => normalizeDatPath(n) === root + 'master.dat') as string;
  const rootParts = segs(master).slice(0, -1);
  let dir = base;
  for (const p of rootParts) dir = await dir.getDirectoryHandle(p);
  if (rootParts.length > 0) {
    // usun wpisy spoza katalogu gry (inne katalogi z archiwum)
    const top: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [n] of (base as any).entries() as AsyncIterable<[string, unknown]>)
      top.push(n);
    for (const n of top) {
      if (n !== rootParts[0]) await base.removeEntry(n, { recursive: true });
    }
  }
  const files = await walkDirectory(dir, true);
  await finalizeOpfsCopy(base, files.size, rootParts.join('/'));
  return { kind: 'opfs', files, handle: dir };
}
