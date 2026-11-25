import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LocalTelemetry, MemoryBackend, installGlobalErrorCapture } from './telemetry.js';

const t0 = new Date('2026-01-01T00:00:00Z');

describe('LocalTelemetry', () => {
  it('test_telemetry_ring_buffer_caps_at_10000', async () => {
    const tel = new LocalTelemetry({ now: () => t0 });
    for (let i = 0; i < 10_050; i++) tel.record({ kind: 'perf', data: { i } });
    expect(tel.size).toBe(10_000);
    const all = await tel.query();
    expect(all[0]!.data['i']).toBe(50);
    await tel.flush();
  });

  it('maxBytes tez ogranicza bufor', () => {
    const tel = new LocalTelemetry({ maxBytes: 2000 });
    for (let i = 0; i < 50; i++) tel.record({ kind: 'error', data: { m: 'x'.repeat(200) } });
    expect(tel.storageBytes).toBeLessThanOrEqual(2000);
    expect(tel.size).toBeGreaterThan(0);
    expect(tel.size).toBeLessThan(50);
  });

  it('test_telemetry_vm_error_includes_script_and_opcode', async () => {
    const tel = new LocalTelemetry();
    tel.recordVmError({
      script: 'klamath.int',
      proc: 'talk_p_proc',
      opcode: 0x8123,
      message: 'zly stos',
    });
    const [e] = await tel.query({ kind: 'vm_error' });
    expect(e!.data['script']).toBe('klamath.int');
    expect(e!.data['proc']).toBe('talk_p_proc');
    expect(e!.data['opcode']).toBe(String(0x8123));
  });

  it('test_telemetry_export_jsonl_parsable', async () => {
    const tel = new LocalTelemetry();
    tel.record({ kind: 'save', data: { slot: 1 } });
    tel.record({ kind: 'map_enter', data: { map: 'arcaves' } });
    const text = await (await tel.export()).text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines.map((l) => JSON.parse(l).kind)).toEqual(['save', 'map_enter']);
  });

  it('query po kind i since', async () => {
    const tel = new LocalTelemetry();
    tel.record({ kind: 'perf', data: {}, t: '2026-01-01T00:00:00Z' });
    tel.record({ kind: 'perf', data: {}, t: '2026-01-01T00:00:10Z' });
    tel.record({ kind: 'error', data: {}, t: '2026-01-01T00:00:20Z' });
    expect((await tel.query({ kind: 'perf' })).length).toBe(2);
    expect((await tel.query({ since: new Date('2026-01-01T00:00:05Z') })).length).toBe(2);
  });

  it('clear czysci pamiec i backend; persystencja przez backend', async () => {
    const backend = new MemoryBackend();
    const a = new LocalTelemetry({ backend });
    a.record({ kind: 'load', data: { slot: 2 } });
    await a.flush();
    const b = new LocalTelemetry({ backend });
    await b.init();
    expect(b.size).toBe(1);
    await b.clear();
    expect(b.size).toBe(0);
    expect(b.storageBytes).toBe(0);
    expect(await backend.load()).toEqual([]);
  });

  it('perfSummary liczy srednia i minimum fps', () => {
    const tel = new LocalTelemetry();
    tel.recordPerfSample(60);
    tel.recordPerfSample(30);
    expect(tel.perfSummary()).toEqual({ avgFps: 45, minFps: 30, samples: 2 });
  });

  it('installGlobalErrorCapture zapisuje error i unhandledrejection', async () => {
    const handlers: Record<string, (e: never) => void> = {};
    const target = {
      addEventListener: vi.fn((t: string, f: (e: never) => void) => void (handlers[t] = f)),
    };
    const tel = new LocalTelemetry();
    installGlobalErrorCapture(tel, target);
    handlers['error']!({ message: 'boom', filename: 'a.js', lineno: 7 } as never);
    handlers['unhandledrejection']!({ reason: new Error('odrzucone') } as never);
    const ev = await tel.query({ kind: 'error' });
    expect(ev.map((e) => e.data['message'])).toEqual(['boom', 'odrzucone']);
  });

  it('test statyczny: zero wywolan sieciowych w kodzie telemetrii', () => {
    const src = readFileSync(new URL('./telemetry.ts', import.meta.url), 'utf8');
    expect(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(src)).toBe(false);
  });
});
