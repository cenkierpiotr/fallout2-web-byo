import {
  createSfallImpl,
  registerSfallOpcodes,
  restoreSfall,
  snapshotSfall,
  type HookEvent,
  type HookResult,
  type OpHandler,
  type SfallImpl,
  type SfallOptions,
  type SfallStateJSON,
} from '@f2/vm';

export interface SfallBindingOptions extends SfallOptions {
  /** Gotowa instancja (np. wspoldzielona z testem); domyslnie nowa. */
  impl?: SfallImpl;
}

/**
 * Wpiecie podzbioru sfall w silnik. Przy `enabled !== true` (domyslnie) nic nie jest rejestrowane,
 * hooki nie sa wolane (`hook` zwraca undefined) a stan zapisu to null: zachowanie identyczne jak bez sfall.
 */
export class SfallBinding {
  readonly enabled: boolean;
  readonly impl: SfallImpl | undefined;
  private readonly opts: SfallBindingOptions;

  constructor(opts: SfallBindingOptions = {}) {
    this.opts = opts;
    this.enabled = opts.enabled === true;
    this.impl = this.enabled ? (opts.impl ?? createSfallImpl()) : undefined;
  }

  /** Dokleja handlery opkodow sfall do mapy VM; 0 gdy wylaczone. */
  register(target: Map<number, OpHandler>): number {
    return this.impl ? registerSfallOpcodes(target, this.impl, { ...this.opts, enabled: true }) : 0;
  }

  /** Wola hooki zdarzenia; undefined gdy sfall wylaczony albo brak handlerow/wyniku. */
  hook(event: HookEvent, ...args: number[]): HookResult | undefined {
    if (!this.impl || !this.impl.hooks.has(event)) return undefined;
    const r = this.impl.hooks.on(event, ...args);
    return r.handled ? r : undefined;
  }

  /** Funkcja dla `ToHitFinishInput.onToHit` albo undefined gdy sfall wylaczony. */
  toHitHook(
    attackerId = 0,
    targetId = 0,
    part = 0,
  ): ((computed: number) => number | undefined) | undefined {
    if (!this.impl) return undefined;
    return (computed) => this.hook('tohit', computed, attackerId, targetId, part)?.returns[0];
  }

  snapshot(): SfallStateJSON | null {
    return this.impl ? snapshotSfall(this.impl) : null;
  }

  /** Przy wylaczonym sfall zapis jest ignorowany (dane zostaja w pliku przy kolejnym zapisie tylko gdy wlaczony). */
  restore(state: SfallStateJSON | null | undefined): void {
    if (this.impl && state) restoreSfall(this.impl, state);
  }
}
