import { useEffect, useRef, useState } from 'preact/hooks';
import * as browser from '@f2/vfs/browser';
import { t } from '../../i18n';
import { importZip as importZipFile, openFolder, progress, status } from '../../state/game-folder';

type PermHandle = FileSystemDirectoryHandle & {
  queryPermission(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'read' }): Promise<PermissionState>;
};

const opfsAvailable = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';

function readPersistPref(): boolean {
  try {
    const v = localStorage.getItem('f2.persist');
    if (v !== null) return v === '1';
  } catch {
    /* ignoruj */
  }
  return true;
}

/** Ekran pierwszego uruchomienia (BYO): wskazanie folderu, plikow lub ZIP, zapamietanie w OPFS, weryfikacja. */
export function FolderPicker() {
  const dirInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<PermHandle | null>(null);
  const [persist, setPersist] = useState<boolean>(readPersistPref);
  const zipAbort = useRef<AbortController | null>(null);
  const [zipPct, setZipPct] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fsa = browser.supportsFsa();
  const canPersist = opfsAvailable();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const opfs = await browser.openOpfsFolder();
      if (cancelled) return;
      if (opfs) {
        void openFolder(opfs);
        return;
      }
      const h = (await browser.loadFolderHandle().catch(() => null)) as PermHandle | null;
      if (cancelled || !h) return;
      const perm = await h.queryPermission({ mode: 'read' }).catch(() => 'prompt' as const);
      if (perm === 'granted') await openSaved(h);
      else setSaved(h);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const opts = () => ({ persist: canPersist && persist });

  const openSaved = async (h: PermHandle) => {
    const files = await browser.walkDirectory(h, true);
    await openFolder({ kind: 'fsa', files, handle: h });
  };

  const resume = async () => {
    if (!saved) return;
    if ((await saved.requestPermission({ mode: 'read' })) === 'granted') await openSaved(saved);
  };

  const togglePersist = (v: boolean) => {
    setPersist(v);
    try {
      localStorage.setItem('f2.persist', v ? '1' : '0');
    } catch {
      /* ignoruj */
    }
  };

  const importZip = async (zip: Blob) => {
    setLocalError(null);
    setZipPct(0);
    const ac = new AbortController();
    zipAbort.current = ac;
    try {
      const found = await importZipFile(
        zip,
        (d, total) => setZipPct(total > 0 ? Math.floor((d / total) * 100) : 0),
        { ...opts(), signal: ac.signal },
      );
      setZipPct(null);
      if (!found) setLocalError(t('firstrun.noGameInZip'));
    } catch (e) {
      setZipPct(null);
      if (e instanceof DOMException && e.name === 'AbortError') return; // anulowano: wracamy do wyboru zrodla
      setLocalError(
        t('firstrun.zipError', { message: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      if (zipAbort.current === ac) zipAbort.current = null;
    }
  };

  const handleFileList = async (list: FileList) => {
    setLocalError(null);
    const zips = [...list].filter((f) => f.name.toLowerCase().endsWith('.zip'));
    if (zips.length === 1 && list.length === 1 && zips[0]) await importZip(zips[0]);
    else await openFolder(browser.folderFromFileList(list), opts());
  };

  const pickFolder = async () => {
    setLocalError(null);
    if (fsa) {
      const picked = await browser.pickFolderFsa();
      if (picked) await openFolder(picked, opts());
    } else dirInput.current?.click();
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer?.items;
    const first = items?.[0] as
      | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
      | undefined;
    if (first?.getAsFileSystemHandle) {
      const h = await first.getAsFileSystemHandle();
      if (h?.kind === 'directory') {
        const files = await browser.walkDirectory(h as FileSystemDirectoryHandle, true);
        await openFolder({ kind: 'fsa', files, handle: h as FileSystemDirectoryHandle }, opts());
        return;
      }
    }
    const list = e.dataTransfer?.files;
    if (list && list.length > 0) await handleFileList(list);
  };

  const clear = async () => {
    await browser.clearOpfs();
    setCleared(true);
  };

  const busy = status.value === 'copying' || status.value === 'indexing' || zipPct !== null;
  const p = progress.value;
  return (
    <div
      class={dragging ? 'picker firstrun dragging' : 'picker firstrun'}
      data-testid="first-run"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <h2>{t('firstrun.title')}</h2>
      <p>{t('firstrun.intro')}</p>
      <div class="firstrun-actions">
        <button type="button" class="primary" disabled={busy} onClick={() => void pickFolder()}>
          {fsa ? t('firstrun.pickFolder') : t('folder.pickFallback')}
        </button>
        <button type="button" disabled={busy} onClick={() => filesInput.current?.click()}>
          {t('firstrun.pickFiles')}
        </button>
        <button type="button" disabled={busy} onClick={() => zipInput.current?.click()}>
          {t('firstrun.pickZip')}
        </button>
      </div>
      <input
        ref={dirInput}
        type="file"
        // @ts-expect-error webkitdirectory nie jest w typach preact
        webkitdirectory={true}
        multiple
        hidden
        data-testid="pick-folder-input"
        onChange={(e) => {
          const list = e.currentTarget.files;
          if (list && list.length > 0) void handleFileList(list);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        data-testid="pick-files-input"
        onChange={(e) => {
          const list = e.currentTarget.files;
          if (list && list.length > 0) void handleFileList(list);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-testid="pick-zip-input"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void importZip(f);
          e.currentTarget.value = '';
        }}
      />
      <p class="hint dropzone">{t('firstrun.drop')}</p>
      {canPersist && (
        <label class="persist">
          <input
            type="checkbox"
            data-testid="persist-opfs"
            checked={persist}
            disabled={busy}
            onChange={(e) => togglePersist(e.currentTarget.checked)}
          />{' '}
          {t('firstrun.persist')}
          <span class="hint"> {t('firstrun.persistHint')}</span>
        </label>
      )}
      {zipPct !== null && (
        <p role="status">
          {t('firstrun.zipReading', { pct: zipPct })}{' '}
          <button type="button" data-testid="zip-cancel" onClick={() => zipAbort.current?.abort()}>
            {t('firstrun.zipCancel')}
          </button>
          <span class="hint"> {t('firstrun.zipResumeHint')}</span>
        </p>
      )}
      {status.value === 'copying' && p && (
        <p role="status">{t('folder.copying', { done: p.done, total: p.total })}</p>
      )}
      {localError && (
        <p class="status error" role="alert" data-testid="firstrun-error">
          {localError}
        </p>
      )}
      {saved && !busy && (
        <button type="button" onClick={() => void resume()}>
          {t('folder.resume', { name: saved.name })}
        </button>
      )}
      {canPersist && (
        <p>
          <button
            type="button"
            data-testid="clear-opfs"
            disabled={busy}
            onClick={() => void clear()}
          >
            {t('firstrun.clear')}
          </button>
          {cleared && <span class="hint"> {t('firstrun.cleared')}</span>}
        </p>
      )}
      <p class="hint">{t('firstrun.privacy')}</p>
    </div>
  );
}
