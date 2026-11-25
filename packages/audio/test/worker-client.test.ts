import { describe, expect, it } from 'vitest';
import { decodeAcm } from '../src/acm/decoder.js';
import { AcmWorkerClient, type WorkerLike } from '../src/acm/worker-client.js';
import {
  createAcmWorkerHandler,
  type AcmWorkerRequest,
  type AcmWorkerResponse,
} from '../src/acm/worker.js';

/**
 * Atrapa Workera w tym samym watku: komunikaty przechodza przez structuredClone z transferem
 * (jak postMessage), a odpowiedz wraca asynchronicznie. Nie wymaga @vitest/web-worker.
 */
function fakeWorker(): WorkerLike {
  const listeners: ((e: { data: AcmWorkerResponse }) => void)[] = [];
  const handle = createAcmWorkerHandler((msg, transfer) => {
    const data = structuredClone(msg, { transfer });
    setTimeout(() => listeners.forEach((l) => l({ data })), 0);
  });
  return {
    postMessage(msg: AcmWorkerRequest, transfer: Transferable[] = []) {
      const data = structuredClone(msg, { transfer });
      setTimeout(() => handle(data), 0);
    },
    addEventListener(type: string, fn: never) {
      if (type === 'message') listeners.push(fn);
    },
    terminate() {},
  } as WorkerLike;
}

/** Minimalny poprawny ACM: n blokow zer (levels 7, 16 subblokow, kolumny z kodem 0). */
function zeroAcm(blocks: number, sampleCount: number): Uint8Array {
  const bitsPerBlock = 4 + 16 + 128 * 5;
  const body = new Uint8Array(Math.ceil((bitsPerBlock * blocks) / 8) + 1);
  const out = new Uint8Array(14 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x01032897, true);
  dv.setUint32(4, sampleCount, true);
  dv.setUint16(8, 2, true);
  dv.setUint16(10, 22050, true);
  dv.setUint16(12, (16 << 4) | 7, true);
  out.set(body, 14);
  return out;
}

describe('AcmWorkerClient', () => {
  it('decode zwraca sampleCount probek i przenosi bufor', async () => {
    const client = new AcmWorkerClient(fakeWorker);
    const buf = zeroAcm(2, 3000);
    const pcm = await client.decode(buf);
    expect(pcm.samples.length).toBe(3000);
    expect(pcm.header.sampleCount).toBe(3000);
    expect(buf.byteLength).toBe(0);
  });

  it('dwa rownolegle decode nie mieszaja id', async () => {
    const client = new AcmWorkerClient(fakeWorker);
    const [a, b] = await Promise.all([
      client.decode(zeroAcm(1, 1000)),
      client.decode(zeroAcm(2, 4000)),
    ]);
    expect(a.samples.length).toBe(1000);
    expect(b.samples.length).toBe(4000);
  });

  it('blad dekodowania odrzuca obietnice', async () => {
    const client = new AcmWorkerClient(fakeWorker);
    await expect(client.decode(new Uint8Array(20))).rejects.toThrow();
  });

  it('strumien: read/seek zgodne z decodeAcm, read po done zwraca pusta tablice', async () => {
    const client = new AcmWorkerClient(fakeWorker);
    const full = decodeAcm(zeroAcm(3, 5000)).samples;
    const h = await client.openStream(zeroAcm(3, 5000));
    expect(h.header.sampleCount).toBe(5000);
    const parts: number[] = [];
    let last = { samples: new Int16Array(0), done: false };
    while (!last.done) {
      last = await h.read(2048);
      parts.push(...last.samples);
    }
    expect(parts.length).toBe(full.length);
    const after = await h.read(100);
    expect(after.samples.length).toBe(0);
    expect(after.done).toBe(true);
    await h.seek(10);
    const again = await h.read(5);
    expect(again.samples.length).toBe(5);
    h.close();
    await expect(h.read(1)).rejects.toThrow();
  });
});
