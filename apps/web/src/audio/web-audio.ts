import { AcmWorkerClient } from '@f2/audio';
import workletUrl from '../../../../packages/audio/src/worklet/acm-stream-processor.ts?worker&url';
import { AudioSystem, type Volumes } from './audio-system';

export interface WebAudioFiles {
  resolve(path: string): unknown;
  open(path: string): Promise<Uint8Array>;
}

/** Prawdziwy Web Audio: AudioContext + worker ACM + AudioWorklet strumienia muzyki. */
export async function createWebAudioSystem(
  vfs: WebAudioFiles,
  volumes?: Partial<Volumes>,
): Promise<AudioSystem> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Brak Web Audio API');
  const ctx = new Ctor();
  // Safari/iOS: AudioWorklet moze byc niedostepny (stare wersje) albo kontekst zawieszony do pierwszego gestu.
  if (!ctx.audioWorklet) throw new Error('Brak AudioWorklet (wymagany Safari 14.1+)');
  await ctx.audioWorklet.addModule(workletUrl);
  const acm = new AcmWorkerClient(
    () =>
      new Worker(new URL('../../../../packages/audio/src/acm/worker.ts', import.meta.url), {
        type: 'module',
      }) as never,
  );
  return new AudioSystem({
    ctx,
    vfs,
    acm,
    createNode: ({ sourceRate, channels }) =>
      new AudioWorkletNode(ctx, 'acm-stream-processor', {
        outputChannelCount: [channels],
        processorOptions: { sourceRate, channels },
      }) as never,
    ...(volumes ? { volumes } : {}),
    gestureTarget: window,
  });
}
