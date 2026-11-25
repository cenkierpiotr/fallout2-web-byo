/**
 * Wybor backendu renderera (M9): WebGL2 jest baseline. WebGPU tylko za flaga i tylko gdy backend
 * jest zarejestrowany (obecnie NIE jest: patrz dokumentacja techniczna), w przeciwnym razie
 * zawsze fallback na WebGL2. Czysta logika, testowalna w node.
 */
export type Backend = 'webgl2' | 'webgpu';

export interface BackendEnv {
  /** `navigator.gpu` istnieje. */
  hasWebGpu: boolean;
  /** Flaga uzytkownika/eksperymentu (ustawienia). Domyslnie false. */
  webgpuFlag: boolean;
  /** Czy w buildzie jest zarejestrowany backend WebGPU. Domyslnie false. */
  webgpuBackendRegistered?: boolean;
  /** Wynik `requestAdapter()` (null = brak adaptera). Undefined = jeszcze nie sprawdzono. */
  adapterOk?: boolean;
  /** Safari/iOS: WebGPU nie ma w iOS 17, nie probujemy. */
  ios?: boolean;
}

export interface BackendChoice {
  backend: Backend;
  /** Dlaczego nie WebGPU (gdy flaga on, a wybrano WebGL2). */
  fallbackReason?: string;
}

export function selectBackend(env: BackendEnv): BackendChoice {
  if (!env.webgpuFlag) return { backend: 'webgl2' };
  if (env.ios) return { backend: 'webgl2', fallbackReason: 'ios' };
  if (!env.hasWebGpu) return { backend: 'webgl2', fallbackReason: 'no-navigator-gpu' };
  if (!env.webgpuBackendRegistered)
    return { backend: 'webgl2', fallbackReason: 'backend-not-registered' };
  if (env.adapterOk === false) return { backend: 'webgl2', fallbackReason: 'no-adapter' };
  return { backend: 'webgpu' };
}
