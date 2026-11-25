/**
 * Elementy walki ze statusem Z (dokumentacja techniczna, Niewiadome). Nie implementowane do czasu
 * domkniecia R13b/R13d; flagi dla pozniejszych zadan (23, 24, PK-1), bez zgadywania formul.
 */
export const COMBAT_PENDING_Z = {
  burstExplosionGeometry:
    'combat.md U2: geometria linii serii (0x4163c8) i pierscieni eksplozji (0x4b1a6c), semantyka 0x478d58==0x43, flaga proto 0x1000',
  xp: 'combat.md U2: nagroda XP za zabicie',
  criticalFlagSemantics: 'criticals.md U1: semantyka bitow flag',
} as const;
