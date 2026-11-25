import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Fo1CeHost, type Fo1Status } from '../fo1/fo1-ce-host';
import { signal, effect } from '@preact/signals';

/** Ekran Fallout 1 Community Edition (WASM) w trybie Bring Your Own Game (BYO). */

const host = new Fo1CeHost();
export const fo1Status = signal<Fo1Status>({ phase: 'idle' });
effect(() => {
  host.onStatus = (s): void => {
    fo1Status.value = s;
  };
});

export function Fo1Screen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [progressText, setProgressText] = useState('');
  const [busyImport, setBusyImport] = useState(false);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onFs = (): void => setFs(document.fullscreenElement !== null);
    // host F1 przechwytuje fullscreenchange (odcina SDL) i przekazuje 'fo1-fullscreenchange'
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('fo1-fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('fo1-fullscreenchange', onFs);
    };
  }, []);
  const st = fo1Status.value;
  const dataReady = st.phase === 'ready' || st.phase === 'started';

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || st.phase !== 'idle') return;
    void host.mount(c).catch(() => undefined);
    host.onImportProgress = (p): void => {
      setProgressText(`${t('fo1.importing', { done: p.done, total: p.total })} ${p.name}`);
    };
  }, []);

  const onImport = (): void => {
    setBusyImport(true);
    setProgressText('');
    void host
      .pickAndImport()
      .then((n) => setProgressText(t('fo1.imported', { n })))
      .catch((e: unknown) => setProgressText(String(e)))
      .finally(() => setBusyImport(false));
  };

  const onStart = (): void => {
    host.start();
  };

  return (
    <div class="fo1-screen">
      <div class="fo1-screen__top">
        <h2>{t('fo1.title')}</h2>
        <button
          type="button"
          data-testid="fo1-back-to-select"
          onClick={(): void => {
            try {
              localStorage.removeItem('f2.game');
            } catch {
              /* ignoruj */
            }
            window.location.reload();
          }}
        >
          {t('fo1.back')}
        </button>
      </div>
      <p class="muted">{t('fo1.intro')}</p>
      <div class="fo1-stage" ref={stageRef}>
        <canvas
          id="canvas"
          ref={canvasRef}
          onContextMenu={(e): void => {
            e.preventDefault();
          }}
        />
        {fs && (
          <button
            type="button"
            class="fo1-fs-exit"
            data-testid="fo1-fullscreen-exit"
            onClick={(): void => {
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
            }}
          >
            {t('fo1.windowed')}
          </button>
        )}
      </div>
      <div data-testid="fo1-phase" class="fo1-phase">
        {String(st.phase)}
      </div>
      {dataReady && (
        <div class="fo1-actions">
          <button
            type="button"
            data-testid="fo1-fullscreen"
            onClick={(): void => {
              // pelny ekran na kontenerze canvasu (.fo1-stage): obraz sie centruje (czarne pasy),
              // przycisk wyjscia zostaje nad plansza, silnik SDL nie nadpisuje rozmiaru kontenera
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
              else
                void (stageRef.current?.requestFullscreen?.() ??
                  canvasRef.current?.requestFullscreen?.() ??
                  document.documentElement.requestFullscreen()).catch(() => undefined);
            }}
          >
            {fs ? t('fo1.windowed') : t('fo1.fullscreen')}
          </button>
          <button type="button" data-testid="fo1-import" disabled={busyImport} onClick={onImport}>
            {busyImport ? t('fo1.importingBtn') : t('fo1.importBtn')}
          </button>
          <button
            type="button"
            data-testid="fo1-start"
            disabled={st.phase === 'started'}
            onClick={onStart}
          >
            {t('fo1.startBtn')}
          </button>
        </div>
      )}
      {st.phase === 'error' && <p class="error" role="alert">{`FO1: ${st.detail ?? ''}`}</p>}
      {(st.phase === 'idle' || st.phase === 'loading') && (
        <p class="muted">{t('fo1.loadingEngine')}</p>
      )}
      {progressText && (
        <p class="muted" data-testid="fo1-import-status" role="status">
          {progressText}
        </p>
      )}
    </div>
  );
}
