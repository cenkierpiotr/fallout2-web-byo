export const STEPS = ['folder', 'detect', 'profile', 'scale', 'tutorial'] as const;
export type OnboardingStep = (typeof STEPS)[number];

export interface OnboardingState {
  step: number;
  done: boolean;
}

/** Wersja ukladu krokow w zapisie: v2 = po dodaniu kroku `scale` (wczesniej 4 kroki, indeks 3 = tutorial). */
export const STEPS_VERSION = 2;

const KEY = 'f2.onboarding';

export const initialState = (): OnboardingState => ({ step: 0, done: false });

export function advance(s: OnboardingState): OnboardingState {
  if (s.done) return s;
  const step = s.step + 1;
  return step >= STEPS.length ? { step: STEPS.length, done: true } : { step, done: false };
}

export const skipAll = (): OnboardingState => ({
  step: STEPS.length,
  done: true,
});

export function loadState(): OnboardingState {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof v === 'object' && v !== null) {
      const { step, done } = v as { step?: unknown; done?: unknown };
      if (
        typeof done === 'boolean' &&
        typeof step === 'number' &&
        Number.isInteger(step) &&
        step >= 0 &&
        step <= STEPS.length
      ) {
        // zapis sprzed kroku `scale` (brak `v`): kroki od indeksu 3 przesuniete o 1 (tutorial 3 -> 4, done 4 -> 5)
        const legacy = (v as { v?: unknown }).v === undefined;
        return legacy && step >= STEPS.indexOf('scale')
          ? { step: Math.min(step + 1, STEPS.length), done }
          : { step, done };
      }
    }
  } catch {
    /* brak storage albo zly JSON */
  }
  return initialState();
}

export function saveState(s: OnboardingState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: STEPS_VERSION }));
  } catch {
    /* ignoruj */
  }
}

export type PatchKind = '1.02.25' | 'vanilla' | 'unknown';
export const labelForPatch = (p: PatchKind): string => (p === '1.02.25' ? 'patch 1.02.25' : p);

/** Minimalny ksztalt stanu weryfikacji plikow gry (signal `verification` z game-folder). */
export type VerificationLike =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; result: { status: 'verified' | 'unknown' | 'invalid'; edition?: string } };

/** Etykieta wydania dla panelu: zweryfikowane wydanie z DAT2, w trakcie sprawdzania `pendingText`, inaczej undefined (panel pokaze `unknown`). */
export function releaseLabel(v: VerificationLike, pendingText?: string): string | undefined {
  if (v.phase === 'running') return pendingText;
  if (v.phase === 'done' && v.result.status === 'verified' && v.result.edition)
    return v.result.edition;
  return undefined;
}

export type TutorialEvent = 'move' | 'interact' | 'actionMenu' | 'inventory' | 'save';

/** Zwraca zdarzenie, jesli podpowiedz dla niego jeszcze nie padla (i oznacza jako pokazana); inaczej null. */
export function tutorialHint(fired: Set<string>, ev: TutorialEvent): TutorialEvent | null {
  if (fired.has(ev)) return null;
  fired.add(ev);
  return ev;
}
