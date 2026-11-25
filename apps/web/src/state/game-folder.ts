import { signal } from '@preact/signals';
import { DecodeClient } from '@f2/assets';
import * as browser from '@f2/vfs/browser';
import { t } from '../i18n';

type PickedFolder = browser.PickedFolder;

export const folder = signal<PickedFolder | null>(null);
export const client = signal<DecodeClient | null>(null);
export const hasModLayers = signal(false);
export const status = signal<'idle' | 'copying' | 'indexing' | 'ready' | 'error'>('idle');
export const error = signal<string | null>(null);
export const progress = signal<{ done: number; total: number } | null>(null);
export const indexedEntries = signal<number>(0);
/** Wynik weryfikacji plikow gry: szybka (stopka DAT2 + rozmiary) od razu, pelne SHA-256 w tle. */
export const verification = signal<
  | { phase: 'idle' }
  | { phase: 'running'; name: string; pct: number }
  | { phase: 'done'; result: browser.VerifyResult }
>({ phase: 'idle' });

function opfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

function isSafariLike(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const safari = /safari/i.test(ua) && !/chrome|chromium|android|crios|fxios/i.test(ua);
  return ios || safari;
}

function needsOpfsCopy(picked: PickedFolder): boolean {
  return picked.kind === 'files' && opfsAvailable() && isSafariLike();
}

/**
 * Import ZIP-a: gdy gra i tak trafi do OPFS (Safari/iOS albo "zapamietaj"), rozpakowujemy
 * strumieniowo prosto do OPFS (bez skladania 300 MB+ w pamieci); inaczej do pamieci jak dotad.
 * Zwraca false, gdy w archiwum nie ma gry. `signal` przerywa import (AbortError); ponowny import tego samego ZIP-a wznawia.
 */
export async function importZip(
  zip: Blob,
  onProgress: (done: number, total: number) => void,
  opts: { persist?: boolean; signal?: AbortSignal } = {},
): Promise<boolean> {
  const toOpfs = opfsAvailable() && (opts.persist === true || isSafariLike());
  if (toOpfs) void navigator.storage?.persist?.().catch(() => false);
  const picked = toOpfs
    ? await browser.zipToOpfs(zip, onProgress, opts.signal ? { signal: opts.signal } : {})
    : await browser.folderFromZip(zip, onProgress, undefined, opts.signal);
  if (!picked.files.has('master.dat')) return false;
  await openFolder(picked, opts);
  return true;
}

let generation = 0;

/** Otwiera folder gry; nowsze wywolanie uniewaznia starsze (wyscig dwoch openFolder). */
export async function openFolder(
  picked: PickedFolder,
  opts: { persist?: boolean } = {},
): Promise<void> {
  const gen = ++generation;
  const stale = (): boolean => gen !== generation;
  let c: DecodeClient | null = null;
  error.value = null;
  try {
    const { missing } = browser.findGameFiles(picked);
    if (missing.length > 0) {
      status.value = 'error';
      error.value = t('folder.missing', { file: missing[0] ?? '' });
      return;
    }
    const quick = await browser.verifyGameFiles(picked);
    if (quick.status === 'invalid') {
      status.value = 'error';
      const bad = quick.files.filter((f) => f.check === 'missing' || f.check === 'broken');
      error.value = t('firstrun.invalid', {
        files: bad.map((f) => f.name.toUpperCase()).join(', '),
      });
      return;
    }
    let source = picked;
    if (picked.kind !== 'opfs' && (opts.persist === true || needsOpfsCopy(picked))) {
      const need = [...picked.files.values()].reduce((a, f) => a + f.size, 0);
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      if (est?.quota !== undefined && est.usage !== undefined && est.quota - est.usage < need) {
        status.value = 'error';
        error.value = t('firstrun.quota', { need: Math.ceil(need / 1048576) });
        return;
      }
      void navigator.storage?.persist?.().catch(() => false);
      status.value = 'copying';
      progress.value = { done: 0, total: 0 };
      try {
        source = await browser.copyToOpfs(picked, (done, total) => {
          if (!stale()) progress.value = { done, total };
        });
      } catch (e) {
        // OPFS bywa niedostepny (tryb prywatny Safari, ephemeralny profil WebKit): "unknown transient reason".
        // Zamiast twardego bledu gramy z plikow wskazanych w tej sesji (bez trwalej kopii).
        console.warn('OPFS niedostepny, gra z plikow tej sesji bez trwalej kopii:', e);
        source = picked;
      }
      if (stale()) return;
      progress.value = null;
    }
    status.value = 'indexing';
    const worker = new Worker(
      new URL('../../../../packages/assets/src/decode.worker.ts', import.meta.url),
      { type: 'module' },
    );
    c = new DecodeClient(worker);
    const info = await c.init(source);
    if (stale()) {
      c.terminate();
      return;
    }
    const old = client.value;
    indexedEntries.value = info.entries;
    hasModLayers.value = info.layers.some((l) => l.startsWith('mods/'));
    folder.value = source;
    client.value = c;
    c = null;
    old?.terminate();
    status.value = 'ready';
    if (quick.edition) void runDeepVerify(source, gen);
    else verification.value = { phase: 'done', result: quick };
    if (source.kind === 'fsa' && source.handle) {
      void browser.saveFolderHandle(source.handle).catch(() => {});
    }
  } catch (e) {
    c?.terminate();
    if (stale()) return;
    status.value = 'error';
    error.value = t('error.generic', { message: e instanceof Error ? e.message : String(e) });
  }
}

/** Pelna weryfikacja SHA-256 w tle (ok. 10 MB/s); wynik w signalu `verification`. */
async function runDeepVerify(source: PickedFolder, gen: number): Promise<void> {
  verification.value = { phase: 'idle' };
  try {
    const result = await browser.verifyGameFiles(source, {
      deep: true,
      onProgress: (name, done, total) => {
        if (gen === generation) {
          verification.value = {
            phase: 'running',
            name,
            pct: total > 0 ? Math.floor((done / total) * 100) : 0,
          };
        }
      },
    });
    if (gen === generation) verification.value = { phase: 'done', result };
  } catch {
    if (gen === generation) verification.value = { phase: 'idle' };
  }
}
