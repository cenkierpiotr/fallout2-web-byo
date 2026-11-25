// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { DiagnosticsScreen, diagnosticsFileName } from './DiagnosticsScreen';
import { LocalTelemetry, MemoryBackend } from '../telemetry';
import { setLocale } from '../i18n';

async function seeded(): Promise<LocalTelemetry> {
  const tel = new LocalTelemetry({ backend: new MemoryBackend(), flushMs: 1e9 });
  tel.record({ kind: 'save', data: { slot: 'quick' } });
  tel.recordVmError({ script: 'x', proc: 'p', opcode: 1, message: 'm' });
  tel.recordPerfSample(60);
  tel.recordPerfSample(30);
  return tel;
}

describe('DiagnosticsScreen', () => {
  it('pokazuje licznik zdarzen, bledy i FPS (PL)', async () => {
    setLocale('pl');
    render(<DiagnosticsScreen telemetry={await seeded()} />);
    await waitFor(() => expect(screen.getByTestId('diag-events').textContent).toBe('Zdarzenia: 4'));
    expect(screen.getByTestId('diag-errors').textContent).toBe('Błędy: 1');
    expect(screen.getByTestId('diag-fps').textContent).toContain('45');
    cleanup();
  });

  it('eksport przekazuje blob JSONL do pobrania (EN)', async () => {
    setLocale('en');
    const download = vi.fn();
    render(
      <DiagnosticsScreen
        telemetry={await seeded()}
        download={download}
        now={() => new Date('2026-11-11T10:00:00Z')}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('diag-events').textContent).toBe('Events: 4'));
    fireEvent.click(screen.getByTestId('diag-export'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toBe('fallout2-web-telemetry-2026-11-11.jsonl');
    expect(blob.size).toBeGreaterThan(0);
    expect(screen.getByTestId('diag-msg').textContent).toBe('Exported 4 events');
    cleanup();
  });

  it('czyszczenie zeruje licznik; pusty eksport nie pobiera', async () => {
    setLocale('en');
    const download = vi.fn();
    render(<DiagnosticsScreen telemetry={await seeded()} download={download} />);
    await waitFor(() => expect(screen.getByTestId('diag-events').textContent).toBe('Events: 4'));
    fireEvent.click(screen.getByTestId('diag-clear'));
    await waitFor(() => expect(screen.getByTestId('diag-events').textContent).toBe('Events: 0'));
    fireEvent.click(screen.getByTestId('diag-export'));
    await waitFor(() =>
      expect(screen.getByTestId('diag-msg').textContent).toBe('No events to export'),
    );
    expect(download).not.toHaveBeenCalled();
    expect(diagnosticsFileName(new Date('2026-01-02T00:00:00Z'))).toContain('2026-01-02');
    cleanup();
  });
});
