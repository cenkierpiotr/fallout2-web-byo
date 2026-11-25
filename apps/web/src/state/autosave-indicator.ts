import { signal } from '@preact/signals';
import type { AutosaveState } from '@f2/engine-core';

export const autosaveIndicator = signal<{ state: AutosaveState; at: number } | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Wskaznik autozapisu: "zapisuje" -> "zapisano" znika po 2,5 s; pominiety autozapis nic nie pokazuje. */
export function reportAutosave(state: AutosaveState, now: number = Date.now()): void {
  if (hideTimer) clearTimeout(hideTimer);
  if (state === 'skipped') return;
  autosaveIndicator.value = { state, at: now };
  if (state !== 'saving')
    hideTimer = setTimeout(
      () => (autosaveIndicator.value = null),
      state === 'failed' ? 6000 : 2500,
    );
}
