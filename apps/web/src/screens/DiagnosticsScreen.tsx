import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { downloadBlob } from '../state/backup';
import type { LocalTelemetry, TelemetryEvent } from '../telemetry';

/** Wycinek LocalTelemetry uzywany przez ekran (ulatwia testy). */
export type DiagnosticsSource = Pick<
  LocalTelemetry,
  'query' | 'export' | 'clear' | 'perfSummary' | 'size' | 'storageBytes'
>;

export interface DiagnosticsScreenProps {
  telemetry: DiagnosticsSource;
  /** Domyslnie pobranie pliku w przegladarce. */
  download?: (blob: Blob, fileName: string) => void;
  now?: () => Date;
}

export function diagnosticsFileName(d: Date): string {
  return `fallout2-web-telemetry-${d.toISOString().slice(0, 10)}.jsonl`;
}

/** Podsumowanie lokalnej telemetrii i reczny eksport (nic nie jest wysylane). */
export function DiagnosticsScreen({ telemetry, download, now }: DiagnosticsScreenProps) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = async (): Promise<void> => setEvents(await telemetry.query());
  useEffect(() => {
    void refresh();
  }, [telemetry]);
  const errors = events.filter((e) => e.kind === 'error' || e.kind === 'vm_error').length;
  const perf = telemetry.perfSummary();
  const doExport = async (): Promise<void> => {
    if (events.length === 0) {
      setMsg(t('diagnostics.exportEmpty'));
      return;
    }
    try {
      const blob = await telemetry.export();
      (download ?? downloadBlob)(blob, diagnosticsFileName((now ?? (() => new Date()))()));
      setMsg(t('diagnostics.exported', { count: events.length }));
    } catch {
      setMsg(t('diagnostics.exportFailed'));
    }
  };
  const doClear = async (): Promise<void> => {
    await telemetry.clear();
    await refresh();
    setMsg(t('diagnostics.cleared'));
  };
  return (
    <section data-testid="diagnostics">
      <h2>{t('diagnostics.title')}</h2>
      <p>{t('diagnostics.intro')}</p>
      <ul>
        <li data-testid="diag-events">{t('diagnostics.events', { count: events.length })}</li>
        <li data-testid="diag-storage">
          {t('diagnostics.storage', { kb: Math.round(telemetry.storageBytes / 1024) })}
        </li>
        <li data-testid="diag-errors">{t('diagnostics.errors', { count: errors })}</li>
        <li data-testid="diag-fps">
          {perf.samples === 0
            ? t('diagnostics.fpsNone')
            : t('diagnostics.fps', {
                avg: Math.round(perf.avgFps),
                min: Math.round(perf.minFps),
                samples: perf.samples,
              })}
        </li>
      </ul>
      <button type="button" data-testid="diag-export" onClick={() => void doExport()}>
        {t('diagnostics.export')}
      </button>{' '}
      <button type="button" data-testid="diag-clear" onClick={() => void doClear()}>
        {t('diagnostics.clear')}
      </button>
      {msg && (
        <p data-testid="diag-msg" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
