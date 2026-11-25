import type { SpeechPlayer } from '@f2/audio';

type SpeechLike = Pick<SpeechPlayer, 'say' | 'stop'>;
export type NarrationResult = 'finished' | 'skipped' | 'missing';

/**
 * Narracja zakonczenia (EndgameFlow.deps.speech): `play` rozwiazuje sie po koncu mowy ('finished'),
 * po `stop()` ('skipped') albo od razu przy braku/uszkodzonym pliku ('missing'; EndgameFlow wtedy
 * czeka na timeout zamiast na mowe). Brak Web Audio (getSpeech rzuca) tez daje 'missing'.
 */
export function createNarrationSpeech(getSpeech: () => Promise<SpeechLike>): {
  play(path: string): Promise<NarrationResult>;
  stop(): void;
} {
  let pending: ((r: NarrationResult) => void) | undefined;
  let speech: SpeechLike | undefined;
  return {
    async play(path) {
      try {
        // nowe play() konczy poprzednie (inaczej jego promise wisialby po nadpisaniu pending)
        const prev = pending;
        pending = undefined;
        prev?.('skipped');
        speech ??= await getSpeech();
        const s = speech;
        return await new Promise<NarrationResult>((resolve, reject) => {
          let settled = false;
          const done = (r: NarrationResult): void => {
            if (settled) return;
            settled = true;
            if (pending === done) pending = undefined;
            resolve(r);
          };
          pending = done;
          s.say(path, { onEnd: () => done('finished') }).catch((e: unknown) => {
            if (pending === done) pending = undefined;
            settled = true;
            reject(e);
          });
        });
      } catch {
        return 'missing';
      }
    },
    stop() {
      const p = pending;
      pending = undefined;
      p?.('skipped');
      speech?.stop();
    },
  };
}
