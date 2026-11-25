import {
  IdbBackend,
  LocalTelemetry,
  installGlobalErrorCapture,
  type ErrorTarget,
} from './telemetry.js';

let instance: LocalTelemetry | null = null;

/**
 * Jedyna instancja LocalTelemetry (IndexedDB, dane zostaja w przegladarce, nic nie jest wysylane).
 * Pierwsze wywolanie wczytuje zapisane zdarzenia i podpina globalne przechwytywanie bledow.
 */
export function getTelemetry(): LocalTelemetry {
  if (instance) return instance;
  const tel = new LocalTelemetry({ backend: new IdbBackend() });
  instance = tel;
  void tel.init().catch(() => {
    /* telemetria nie moze psuc gry */
  });
  if (typeof window !== 'undefined')
    installGlobalErrorCapture(tel, window as unknown as ErrorTarget);
  return tel;
}

/** Tylko do testow. */
export function resetTelemetryForTests(): void {
  instance = null;
}
