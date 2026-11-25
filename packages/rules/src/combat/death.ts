/**
 * Wybor animacji smierci (0x41060c, specyfikacja formatu R13e, status D; nazwy animacji Z, tylko numery).
 * Odtwarzanie: 0x410814 (tryb 0 zagraj, 2 sciezka flagi, 3 sonda).
 */
export const DEATH_ANIM_NORMAL = [0x1a, 0x1c, 0x18, 0x18, 0x1b, 0x14, 0x17] as const; // 0x5106e0
export const DEATH_ANIM_BRUTAL = [0x19, 0x1c, 0x21, 0x20, 0x1e, 0x14, 0x1f] as const; // 0x5106fc

export interface DeathAnimInput {
  attackerIsPlayer: boolean;
  /** Atakujacy jest graczem z cecha Bloody Mess (trait 8). */
  bloodyMess: boolean;
  /** Perk 0x65 gracza (rank != 0). */
  pyromaniac: boolean;
  /** Flaga proto ofiary 0x1000 (D: `proto+0x20`, test 0x42e6ac z maska 0x1000). */
  victimSkipsDeathAnim: boolean;
  /** pid broni lub 0 gdy brak. */
  weaponPid: number;
  /** 0x478d58(bron) == 0x43 (D: pole `proto+0x50` = data[11], perk broni; wartosc 0x43). */
  weaponKind43: boolean;
  /** Typ obrazen 0..6. */
  damageType: number;
  /** Config preferences/violence_level, domyslnie 3. */
  violence: number;
  attackAnim: number;
  damage: number;
  fallingBack: boolean;
  /** Sonda (tryb 3): zwraca animacje, ktora faktycznie zostanie zagrana dla kandydata. */
  probeAnim: (anim: number) => number;
}

export interface DeathAnimResult {
  anim: number;
  mode: 0 | 2;
}

export function selectDeathAnim(i: DeathAnimInput): DeathAnimResult {
  let dtype = i.damageType;
  let lo = 15;
  let hi = 45;
  let attackAnim = i.attackAnim;
  if (i.weaponPid === 0x9f) {
    dtype = 2;
    lo = 5;
    hi = 15;
    attackAnim = 0x2d;
  }
  if (i.attackerIsPlayer && i.pyromaniac && dtype === 2) {
    lo = 1;
    hi = 1;
  }
  if (i.weaponKind43) {
    lo = Math.trunc(lo / 3);
    hi = Math.trunc(hi / 3);
  }
  if (i.victimSkipsDeathAnim) return { anim: 0x1f, mode: 2 };

  const bloody = i.bloodyMess; // wywolujacy: atakujacy==gracz && has_trait(8)
  const v = i.violence;
  const finish = (a: number): DeathAnimResult => ({
    anim: !i.fallingBack && a === 0x14 ? 0x15 : a,
    mode: 0,
  });

  const rangedLike =
    (attackAnim === 0x10 && dtype === 0) ||
    attackAnim === 0x11 ||
    attackAnim === 0x29 ||
    attackAnim === 0x2a ||
    (attackAnim === 0x12 && dtype !== 6);
  if (rangedLike) return finish(v === 3 && bloody ? 0x17 : 0x14);

  if (attackAnim === 0x2d && dtype === 0) {
    if (v !== 3) return finish(0x14);
    if (bloody) return finish(0x17);
    return finish(i.damage >= hi ? 0x17 : 0x14);
  }

  if (v <= 1) return finish(0x14);
  if (!bloody && lo > i.damage) return finish(0x14);
  const normal = DEATH_ANIM_NORMAL[dtype] ?? 0x14;
  if (v <= 2) return finish(normal);
  if (!bloody && hi > i.damage) return finish(normal);
  const cand = DEATH_ANIM_BRUTAL[dtype] ?? 0x14;
  return finish(i.probeAnim(cand) === cand ? cand : normal);
}
