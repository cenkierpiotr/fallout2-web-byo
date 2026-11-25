import { describe, expect, it } from 'vitest';
import { setWriterWorkerFactory, writeOpfsFile } from './opfs-write.js';

describe('writeOpfsFile', () => {
  it('uzywa createWritable gdy dostepne (string)', async () => {
    let written = '';
    let closed = false;
    const fh = {
      createWritable: async () => ({
        write: async (d: string) => void (written = d),
        close: async () => void (closed = true),
      }),
    };
    await writeOpfsFile(fh as never, 'abc');
    expect(written).toBe('abc');
    expect(closed).toBe(true);
  });

  it('uzywa createWritable gdy dostepne (Blob, kawalkami)', async () => {
    const chunks: Uint8Array[] = [];
    let closed = false;
    const fh = {
      createWritable: async () => ({
        write: async (c: Uint8Array) => void chunks.push(c),
        close: async () => void (closed = true),
      }),
    };
    await writeOpfsFile(fh as never, new Blob(['xyzxyz']), { chunkSize: 4 });
    expect(chunks.map((c) => new TextDecoder().decode(c))).toEqual(['xyzx', 'yz']);
    expect(closed).toBe(true);
  });

  it('fallback: worker z sync access handle gdy brak createWritable (protokol open/write/close)', async () => {
    const ops: string[] = [];
    let handle: unknown;
    let terminated = false;
    const fake = {
      onmessage: null as ((e: unknown) => void) | null,
      onerror: null as unknown,
      postMessage(m: { op: string; handle?: unknown }) {
        ops.push(m.op);
        if (m.op === 'open') handle = m.handle;
        queueMicrotask(() => this.onmessage?.({ data: { ok: true } }));
      },
      terminate() {
        terminated = true;
      },
    };
    setWriterWorkerFactory(() => fake as never);
    const fh = {};
    await writeOpfsFile(fh as never, new Blob(['q']));
    expect(handle).toBe(fh);
    expect(ops).toEqual(['open', 'write', 'close']);
    expect(terminated).toBe(true);
  });

  it('fallback: blad workera odrzuca obietnice i zatrzymuje worker', async () => {
    let terminated = false;
    const fake = {
      onmessage: null as ((e: unknown) => void) | null,
      onerror: null as unknown,
      postMessage() {
        queueMicrotask(() => this.onmessage?.({ data: { ok: false, error: 'boom' } }));
      },
      terminate() {
        terminated = true;
      },
    };
    setWriterWorkerFactory(() => fake as never);
    await expect(writeOpfsFile({} as never, 'x')).rejects.toThrow('boom');
    expect(terminated).toBe(true);
  });
});
