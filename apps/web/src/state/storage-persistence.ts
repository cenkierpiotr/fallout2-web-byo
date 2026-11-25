import { signal } from '@preact/signals';

export type PersistResult = 'granted' | 'denied' | 'unsupported';

/**
 * Prosi przegladarke o trwaly magazyn (storage.persist). Wazne na iOS/Safari, gdzie dane
 * witryny bez tego moga zostac wyczyszczone po ok. 7 dniach bez uzycia. Nigdy nie rzuca.
 */
export async function ensurePersistent(
  storage: StorageManager | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.storage,
): Promise<PersistResult> {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Ostatni wynik prosby o trwaly magazyn (null = jeszcze nie pytano). */
export const persistState = signal<PersistResult | null>(null);

export async function requestPersistence(): Promise<void> {
  persistState.value = await ensurePersistent();
}
