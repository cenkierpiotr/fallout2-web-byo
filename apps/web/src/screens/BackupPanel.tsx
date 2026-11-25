import { useEffect, useMemo, useState } from 'preact/hooks';
import { activeProfileId, activeSaveStore } from '../state/profiles';
import { t } from '../i18n';
import { backupMessageKey, backupToDownload, downloadBlob, restoreFromFile } from '../state/backup';
import {
  chooseBackupDir,
  idbHandleStore,
  loadLastBackup,
  runAutoBackup,
  saveLastBackup,
  shouldAutoBackup,
  supportsDirectoryBackup,
  type AutoBackupOutcome,
  type FsDirHandle,
  type HandleStore,
} from '../state/auto-backup';
import { persistState } from '../state/storage-persistence';

export interface BackupPanelDeps {
  /** Wstrzykiwane w testach; domyslnie prawdziwe API przegladarki. */
  supported?: boolean;
  handles?: HandleStore;
  run?: typeof runAutoBackup;
  pick?: (w: never, h: HandleStore) => Promise<FsDirHandle | null>;
  onClose?: (() => void) | undefined;
}

export function autoBackupMessageKey(r: AutoBackupOutcome): string {
  if (r.ok) return 'backup.auto.done';
  return r.reason === 'permission' || r.reason === 'no-folder'
    ? 'backup.auto.denied'
    : 'backup.auto.failed';
}

/** Eksport/import wszystkich zapisow; gdzie dostepne File System Access API: automatyczna kopia do wybranego folderu. */
export function BackupPanel(deps: BackupPanelDeps = {}) {
  const store = useMemo(() => activeSaveStore(), [activeProfileId.value]);
  const supported = deps.supported ?? supportsDirectoryBackup();
  const handles = useMemo(() => deps.handles ?? idbHandleStore(), [deps.handles]);
  const run = deps.run ?? runAutoBackup;
  const [dirName, setDirName] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const report = (r: AutoBackupOutcome): void =>
    setAutoMsg(t(autoBackupMessageKey(r), r.ok ? { file: r.file } : {}));
  // po starcie: jesli folder wybrany i minal odstep, cicha kopia (bez monitu o zgode)
  useEffect(() => {
    if (!supported) return;
    let live = true;
    void handles.get().then(async (h) => {
      if (!live || !h) return;
      setDirName(h.name);
      if (!shouldAutoBackup(loadLastBackup(), Date.now())) return;
      const r = await run(store, handles);
      if (r.ok) saveLastBackup(Date.now());
      if (live && r.ok) report(r);
    });
    return () => {
      live = false;
    };
  }, [supported]);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section class="backup" data-testid="backup-panel" aria-label={t('backup.title')}>
      {deps.onClose ? (
        <div class="backup__head">
          <h2>{t('backup.title')}</h2>
          <button
            type="button"
            data-testid="backup-close"
            aria-label={t('dialog.close')}
            onClick={deps.onClose}
          >
            ✕
          </button>
        </div>
      ) : (
        <h2>{t('backup.title')}</h2>
      )}
      <p class="muted">{t('backup.hint')}</p>
      {persistState.value === 'denied' && <p class="status error">{t('persist.denied')}</p>}
      <button
        type="button"
        data-testid="backup-export"
        onClick={() => {
          void backupToDownload(store, downloadBlob);
        }}
      >
        {t('backup.export')}
      </button>
      <label>
        {t('backup.import')}
        <input
          type="file"
          accept=".f2save"
          data-testid="backup-import"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (!f) return;
            void restoreFromFile(store, f, mode).then((r) => setMsg(t(backupMessageKey(r))));
            e.currentTarget.value = '';
          }}
        />
      </label>
      <select
        data-testid="backup-mode"
        aria-label={t('backup.mode.label')}
        value={mode}
        onChange={(e) => setMode(e.currentTarget.value === 'replace' ? 'replace' : 'merge')}
      >
        <option value="merge">{t('backup.mode.merge')}</option>
        <option value="replace">{t('backup.mode.replace')}</option>
      </select>
      {supported && (
        <div data-testid="auto-backup">
          <h3>{t('backup.auto.title')}</h3>
          <p class="muted">
            {dirName ? t('backup.auto.on', { name: dirName }) : t('backup.auto.hint')}
          </p>
          <button
            type="button"
            data-testid="auto-backup-choose"
            onClick={() => {
              const pick = deps.pick ?? chooseBackupDir;
              void pick(window as never, handles).then(async (h) => {
                if (!h) return;
                setDirName(h.name);
                const r = await run(store, handles, { interactive: true });
                if (r.ok) saveLastBackup(Date.now());
                report(r);
              });
            }}
          >
            {t('backup.auto.choose')}
          </button>
          {dirName && (
            <>
              <button
                type="button"
                data-testid="auto-backup-now"
                onClick={() => {
                  void run(store, handles, { interactive: true }).then((r) => {
                    if (r.ok) saveLastBackup(Date.now());
                    report(r);
                  });
                }}
              >
                {t('backup.auto.now')}
              </button>
              <button
                type="button"
                data-testid="auto-backup-off"
                onClick={() => {
                  void handles.set(null);
                  setDirName(null);
                  setAutoMsg(null);
                }}
              >
                {t('backup.auto.off')}
              </button>
            </>
          )}
          {autoMsg && (
            <p role="status" data-testid="auto-backup-msg">
              {autoMsg}
            </p>
          )}
        </div>
      )}
      {msg && (
        <p role="status" data-testid="backup-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
