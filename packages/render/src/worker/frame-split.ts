/**
 * renderWorker E1: podsumowanie podzialu kosztu klatki na budowe batcha (watek glowny) i submit GL.
 * Bramka E1: worker ma sens tylko gdy submit stanowi co najmniej `MIN_SUBMIT_SHARE` klatki
 * (inaczej offload nic nie da, bo budowa batcha i tak zostaje w watku glownym).
 */

export const MIN_SUBMIT_SHARE = 0.25;

export interface FrameSplitSample {
  buildMs: number;
  submitMs: number;
}

export interface FrameSplitSummary {
  frames: number;
  buildMs: number;
  submitMs: number;
  /** submit / (build + submit), 0 gdy brak danych. */
  submitShare: number;
  /** Czy bramka E1 jest spelniona (renderWorker ma potencjalny zysk). */
  worthIt: boolean;
}

/** Srednie z probek (np. `stats.buildMs`/`stats.submitMs` z perf-mobile). */
export function summarizeFrameSplit(
  samples: readonly FrameSplitSample[],
  minShare = MIN_SUBMIT_SHARE,
): FrameSplitSummary {
  const n = samples.length;
  if (n === 0) return { frames: 0, buildMs: 0, submitMs: 0, submitShare: 0, worthIt: false };
  let b = 0;
  let s = 0;
  for (const x of samples) {
    b += x.buildMs;
    s += x.submitMs;
  }
  const buildMs = b / n;
  const submitMs = s / n;
  const total = buildMs + submitMs;
  const submitShare = total > 0 ? submitMs / total : 0;
  return { frames: n, buildMs, submitMs, submitShare, worthIt: submitShare >= minShare };
}

/**
 * Szacunek zysku: po offloadzie watek glowny placi buildMs + koszt wysylki (serializacja batcha),
 * a submit idzie rownolegle w workerze. Klatka (potok) = max(main, worker).
 */
export function estimateWorkerFrame(
  s: FrameSplitSummary,
  remoteSubmitMs: number,
): { mainMs: number; workerMs: number; pipelinedMs: number; savedMs: number } {
  const mainMs = s.buildMs + remoteSubmitMs;
  const workerMs = s.submitMs;
  const pipelinedMs = Math.max(mainMs, workerMs);
  return { mainMs, workerMs, pipelinedMs, savedMs: s.buildMs + s.submitMs - pipelinedMs };
}
