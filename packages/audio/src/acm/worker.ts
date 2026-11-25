import { AcmStreamDecoder, decodeAcm } from './decoder.js';
import type { AcmHeader } from './header.js';

/** Protokol komunikatow miedzy AcmWorkerClient a workerem dekodujacym ACM. */
export type AcmWorkerRequest =
  | { type: 'decode'; id: number; buf: Uint8Array }
  | { type: 'stream-open'; id: number; buf: Uint8Array }
  | { type: 'stream-read'; id: number; maxSamples: number }
  | { type: 'stream-seek'; id: number; sample: number }
  | { type: 'stream-close'; id: number };

export type AcmWorkerResponse =
  | { type: 'decoded'; id: number; header: AcmHeader; samples: Int16Array }
  | { type: 'stream-opened'; id: number; header: AcmHeader }
  | { type: 'stream-chunk'; id: number; samples: Int16Array; done: boolean }
  | { type: 'stream-seeked'; id: number }
  | { type: 'error'; id: number; message: string };

export type PostFn = (msg: AcmWorkerResponse, transfer: Transferable[]) => void;

/**
 * Logika workera bez zaleznosci od globali, wiec testowalna w Node.
 * Dla `decode` id jest id zadania, dla `stream-*` id jest id strumienia
 * (`stream-open` nadaje id, kolejne komunikaty strumienia go uzywaja).
 */
export function createAcmWorkerHandler(post: PostFn): (msg: AcmWorkerRequest) => void {
  const streams = new Map<number, AcmStreamDecoder>();
  return (msg) => {
    try {
      switch (msg.type) {
        case 'decode': {
          const pcm = decodeAcm(msg.buf);
          post({ type: 'decoded', id: msg.id, header: pcm.header, samples: pcm.samples }, [
            pcm.samples.buffer,
          ]);
          break;
        }
        case 'stream-open': {
          const s = new AcmStreamDecoder(msg.buf);
          streams.set(msg.id, s);
          post({ type: 'stream-opened', id: msg.id, header: s.header }, []);
          break;
        }
        case 'stream-read': {
          const s = streams.get(msg.id);
          if (!s) throw new Error(`nieznany strumien ${msg.id}`);
          const samples = s.next(msg.maxSamples);
          post({ type: 'stream-chunk', id: msg.id, samples, done: s.done }, [samples.buffer]);
          break;
        }
        case 'stream-seek': {
          const s = streams.get(msg.id);
          if (!s) throw new Error(`nieznany strumien ${msg.id}`);
          s.seek(msg.sample);
          post({ type: 'stream-seeked', id: msg.id }, []);
          break;
        }
        case 'stream-close':
          streams.delete(msg.id);
          break;
      }
    } catch (e) {
      post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) }, []);
    }
  };
}

// Bootstrap wlasciwego Web Workera (w Node/oknie glownym nic nie robi).
const g = globalThis as unknown as {
  WorkerGlobalScope?: new () => unknown;
  postMessage?: (m: unknown, t: Transferable[]) => void;
  onmessage: ((e: { data: AcmWorkerRequest }) => void) | null;
};
if (typeof g.WorkerGlobalScope !== 'undefined' && globalThis instanceof g.WorkerGlobalScope) {
  const handle = createAcmWorkerHandler((m, t) => g.postMessage!(m, t));
  g.onmessage = (e) => handle(e.data);
}
