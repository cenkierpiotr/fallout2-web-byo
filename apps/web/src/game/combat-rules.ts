import {
  BodyPart,
  DamageType,
  RollResult,
  computeRoundDamage,
  criticalLevel,
  criticalStatCheck,
  criticalMissLevel,
  difficultyPercent,
  determineToHit,
  Perk,
  Trait,
  lookupCritical,
  resolveBurst,
  resolveCritical,
  rollWithMargin,
  totalDamage,
  rangedBonusDamage,
  applyAttackRollPerks,
  silentDeathMultiplier,
  isBehind,
  enhancedKnockoutFlag,
  knockbackDamage,
  stonewallKnockback,
  type Difficulty,
  type Rng,
} from '@f2/rules';
import type { AttackContext, AttackOutcome, AttackResolver, Combatant, WeaponSpec } from './combat';

/**
 * Rozstrzyganie ataku z formul `@f2/rules/combat` (toHit, rzut z krytykiem, obrazenia rundy,
 * tablice krytykow, seria, obrazenia obszarowe). Z (combat.md U1): formula dystansu i skala
 * mnoznika krytyka; wybrane tu wartosci sa jawnymi zalozeniami, nie dowiedzionymi.
 */

/** Kara/premia dystansu: distanceModifier z @f2/rules (D, combat.md krok 3); bron biala nie ma modyfikatora. */

/** Opcje szansy trafienia spoza pary atakujacy/cel: trudnosc walki (krok 14) i druzyna gracza. */
export interface HitOptions {
  difficulty?: Difficulty;
  /** Druzyna gracza; atakujacy z innej druzyny dostaje modyfikator trudnosci (D). */
  playerTeam?: number;
  /** Liczba zywych krytykow na linii strzalu (krok 4); Z: geometria linii 0x426cc4 nie jest podpieta. */
  coverCount?: number;
  /** Kara swiatla (krok 11, <= 0), liczona tylko dla gracza jako atakujacego (D); brak = 0. */
  lightPenalty?: number;
  /** Krok 12 (D): rekord walki 0x51094c +0xc (bonus z opcode skryptowego `attack`); brak = 0. */
  recordBonus?: number;
}

/** Dodatkowe wejscia szansy trafienia zalezne od mapy (linia strzalu, swiatlo); dostarcza walka. */
export type HitExtras = (
  a: Combatant,
  t: Combatant,
  w: WeaponSpec,
) => Pick<HitOptions, 'coverCount' | 'lightPenalty'>;

/** Krok 14 (D): druzyna atakujacego != druzyna gracza: trudnosc 0 (latwy) -20, 2 (trudny) +20. */
function difficultyToHit(a: Combatant, o: HitOptions): number {
  if (o.playerTeam === undefined || a.team === o.playerTeam) return 0;
  return o.difficulty === 'easy' ? -20 : o.difficulty === 'hard' ? 20 : 0;
}

export function hitChance(
  a: Combatant,
  t: Combatant,
  w: WeaponSpec,
  part: BodyPart,
  distance: number,
  /** Hook sfall `tohit` (undefined przy wylaczonej fladze = zachowanie bez zmian). */
  onToHit?: ToHitHookFactory,
  opts: HitOptions = {},
): number {
  // podtypy 3 (rzut) i 4 (dystansowa): dystans, oslona, pelna kara czesci ciala (D, krok 2)
  const ranged = w.cls === 3 || w.cls === 4 || (w.cls === undefined && w.range > 1);
  return determineToHit({
    skill: w.skill,
    part,
    ranged,
    distance: {
      dist: distance,
      perception: a.perception ?? 5,
      isPlayer: a.isPlayer,
      ...(w.weaponPerk !== undefined ? { weaponPerk: w.weaponPerk } : {}),
      ...(a.eyesCrippled ? { eyesCrippled: true } : {}),
      ...(a.perks?.[Perk.Sharpshooter]
        ? { sharpshooter: a.perks[Perk.Sharpshooter] as number }
        : {}),
    },
    coverCount: opts.coverCount ?? 0,
    ...(opts.lightPenalty !== undefined ? { lightPenalty: opts.lightPenalty } : {}),
    isPlayer: a.isPlayer,
    oneHander: a.traits?.includes(Trait.OneHander) ?? false,
    twoHanded: w.twoHanded ?? false,
    minSt: w.minSt ?? 0,
    st: a.special?.[0] ?? 5,
    weaponHandling: (a.perks?.[Perk.WeaponHandling] ?? 0) > 0,
    accurate: w.weaponPerk === 0x3b,
    targetAc: t.ac ?? 0,
    ammoAcMod: w.ammoAcMod ?? 0,
    targetMultihex: t.multihex ?? false,
    targetProne: t.prone ?? false,
    attackerEyesCrippled: a.eyesCrippled ?? false,
    ...(opts.recordBonus !== undefined ? { recordBonus: opts.recordBonus } : {}),
    difficultyMod: difficultyToHit(a, opts),
    ...hookArg(onToHit?.(a.id, t.id, part)),
  });
}

/** Fabryka funkcji `onToHit` dla pary (atakujacy, cel, czesc ciala); np. `SfallBinding.toHitHook`. */
export type ToHitHookFactory = (
  attackerId: number,
  targetId: number,
  part: number,
) => ((computed: number) => number | undefined) | undefined;

const hookArg = (
  f: ((computed: number) => number | undefined) | undefined,
): { onToHit?: (computed: number) => number | undefined } => (f ? { onToHit: f } : {});

export interface ResolverOptions {
  rng: Rng;
  difficulty?: Difficulty;
  toHitHook?: ToHitHookFactory | undefined;
  /** Druzyna gracza (krok 14: modyfikator trudnosci dla atakujacych z innych druzyn). */
  playerTeam?: number;
  /** Wejscia z mapy do szansy trafienia (osłona, swiatlo); brak = 0 (zachowanie sprzed podpiecia). */
  hitExtras?: HitExtras;
  /**
   * Czy gracz ma Jinxed (atut 9 lub perk 118; has_trait czyta tylko gracza, ale efekt dotyczy rzutow
   * WSZYSTKICH atakujacych, D 0x4238b2). Brak = nie.
   */
  jinxed?: () => boolean;
}

/** Statystyka SPECIAL (indeks 0..6) do testu statu krytyka (0x4afa78); tablica `special` ma pierwszenstwo. */
export function statValue(c: Combatant, stat: number): number {
  const v = c.special?.[stat];
  if (v !== undefined) return v;
  if (stat === 5) return c.agility;
  if (stat === 6) return c.luck ?? 5;
  if (stat === 1) return c.perception ?? 5;
  return 5;
}

/** Bonus rolki z perka 4 (Bonus Ranged Damage): 2 na stopien, tylko dla gracza i broni dystansowej (cls 4). */
export function rangedDamageBonus(a: Combatant, w: WeaponSpec): number {
  if (!a.isPlayer || w.cls !== 4) return 0;
  return 2 * (a.perks?.[Perk.BonusRangedDamage] ?? 0);
}

/** Jinxed (D 0x4238b2): zwykla porazka -> krytyczna porazka gdy rand(0,1) != 0; los tylko przy zwyklej porazce. */
export function applyJinxedRoll(result: RollResult, jinxed: boolean, rng: Rng): RollResult {
  if (!jinxed || result !== RollResult.Failure) return result;
  return rng.int(0, 1) !== 0 ? RollResult.CriticalFailure : result;
}

export function createRulesResolver(o: ResolverOptions): AttackResolver {
  const { rng } = o;
  const level = o.difficulty ?? 'normal';

  const roundDamage = (
    a: Combatant,
    t: Combatant,
    w: WeaponSpec,
    dtype: DamageType,
    mult: number,
  ): number => {
    const base = rng.int(w.minDmg, w.maxDmg);
    // D (0x4249f1): bonus perka 4 dochodzi do rzutu PRZED mnoznikiem krytyka/amunicji
    const bonus = rangedBonusDamage(a.perks?.[Perk.BonusRangedDamage] ?? 0, a.isPlayer, w.cls);
    return computeRoundDamage({
      // Z: mnoznik krytyka m (normalny = 2) wchodzi jako roll * m; computeRoundDamage dzieli przez 2
      roll: (base + bonus) * mult,
      rangedBonus: 0,
      ammoMult: w.ammoMult ?? 1,
      ammoDiv: w.ammoDiv ?? 1,
      difficulty: difficultyPercent(a.isPlayer, level),
      dt: t.dt?.[dtype] ?? 0,
      dr: t.dr?.[dtype] ?? 0,
      ...(w.ammoDrMod !== undefined ? { ammoDrMod: w.ammoDrMod } : {}),
      damageType: dtype,
    });
  };

  const damageOpts = (a: Combatant, t: Combatant, w: WeaponSpec) => ({
    attackerIsPlayer: a.isPlayer,
    damageType: w.damageType,
    livingAnatomy: (a.perks?.[Perk.LivingAnatomy] ?? 0) > 0,
    pyromaniac: (a.perks?.[Perk.Pyromaniac] ?? 0) > 0,
    ...(t.killType !== undefined ? { killType: t.killType } : {}),
  });

  return (a: Combatant, t: Combatant, ctx: AttackContext): AttackOutcome => {
    const w = ctx.weapon;
    if (ctx.splash) {
      const d = roundDamage(a, t, w, DamageType.Explosion, 2);
      return { hit: d > 0, damage: d, part: BodyPart.Torso };
    }
    if (ctx.forcedHits !== undefined) {
      const n = ctx.forcedHits;
      if (n <= 0) return { hit: false, damage: 0, part: ctx.part };
      const rs: number[] = [];
      for (let i = 0; i < n; i++) rs.push(roundDamage(a, t, w, w.damageType, 2));
      const damage = totalDamage(rs, damageOpts(a, t, w));
      return { hit: true, damage, part: ctx.part, rounds: w.burst, hitRounds: n };
    }
    const chance = hitChance(a, t, w, ctx.part, ctx.distance, o.toHitHook, {
      difficulty: level,
      ...(o.playerTeam !== undefined ? { playerTeam: o.playerTeam } : {}),
      ...(o.hitExtras?.(a, t, w) ?? {}),
    });
    const critChance = a.critChance ?? 0;
    let hitRounds = 0;
    let crit = false;
    let critMiss: number | undefined;
    let silentDeathMult: number | undefined;
    if (w.burst > 1) {
      hitRounds = ctx.burstSpread
        ? ctx.burstSpread(chance, rng)
        : resolveBurst(
            {
              rounds: w.burst,
              mode: 'burst',
              targets: [{ id: t.id, toHit: chance, isMain: true }],
            },
            rng,
          ).mainHits;
      if (hitRounds > 0) crit = rng.int(1, 100) <= critChance;
      else if (rng.int(1, 100) <= 5) critMiss = criticalMissLevel(rng.int(1, 100), a.luck ?? 5);
    } else {
      const r0 = rollWithMargin(chance, critChance, rng, true);
      const rawResult = r0.result;
      // D (0x42378c): Slayer/Sniper zamieniaja zwykly sukces gracza na krytyczny
      const r = {
        ...r0,
        result: applyJinxedRoll(
          applyAttackRollPerks(
            rawResult,
            {
              attackClass: w.cls,
              attackerIsPlayer: a.isPlayer,
              slayer: a.perks?.[Perk.Slayer] ?? 0,
              sniper: a.perks?.[Perk.Sniper] ?? 0,
              luck: statValue(a, 6),
            },
            rng,
          ),
          o.jinxed?.() ?? false,
          rng,
        ),
      };
      silentDeathMult = silentDeathMultiplier({
        result: rawResult,
        attackClass: w.cls,
        attackerIsPlayer: a.isPlayer,
        silentDeath: a.perks?.[Perk.SilentDeath] ?? 0,
        behind:
          a.rotation !== undefined && t.rotation !== undefined && isBehind(a.rotation, t.rotation),
        sneaking: a.sneaking ?? false,
        targetLastHitByPlayer: t.whoHitMeId === a.id,
      });
      if (r.result >= RollResult.Success) {
        hitRounds = 1;
        crit = r.result === RollResult.CriticalSuccess;
      } else if (r.result === RollResult.CriticalFailure) {
        critMiss = criticalMissLevel(rng.int(1, 100), a.luck ?? 5);
      }
    }
    if (hitRounds === 0) {
      return {
        hit: false,
        damage: 0,
        part: ctx.part,
        chance,
        rounds: w.burst,
        hitRounds: 0,
        ...(critMiss !== undefined ? { critMiss } : {}),
      };
    }
    let mult = silentDeathMult ?? 2;
    let critical: AttackOutcome['critical'];
    let part = ctx.part;
    if (crit) {
      const lvl = criticalLevel(rng.int(1, 100), a.betterCriticals ?? 0);
      // Z: przy strzale bez celowania czesc ciala dla tablicy krytykow jest losowa
      if (part === BodyPart.Uncalled) part = rng.int(0, 7) as BodyPart;
      const e = lookupCritical(t.killType ?? 0, part, lvl, t.isPlayer);
      if (e) {
        // D (0x4afa78): d10 <= stat + modyfikator
        const c = resolveCritical(e, (stat, mod) =>
          criticalStatCheck(statValue(t, stat), mod, rng.int(1, 10)),
        );
        mult = c.multiplier;
        critical = { level: lvl, multiplier: c.multiplier, msgId: c.msgId, flags: c.flags };
      }
    }
    const rounds: number[] = [];
    for (let i = 0; i < hitRounds; i++) rounds.push(roundDamage(a, t, w, w.damageType, mult));
    const damage = totalDamage(rounds, damageOpts(a, t, w));
    // D (0x423714): Enhanced Knockout; trafienie krytyczne z flaga powalenia/ogluszenia (flagi & 3)
    const knockedDown =
      enhancedKnockoutFlag(w.weaponPerk, statValue(a, 0), false, rng) ||
      (critical !== undefined && (critical.flags & 3) !== 0);
    // D (0x424b37): odrzut = dmg/10 (dmg/5 z perkiem broni 0x3d), Stonewall celu-gracza go anuluje lub dzieli
    const knockback = stonewallKnockback(
      knockbackDamage(damage, w.weaponPerk === 0x3d),
      t.isPlayer,
      t.perks?.[Perk.Stonewall] ?? 0,
      () => rng.int(0, 99),
    );
    return {
      hit: true,
      damage,
      part,
      chance,
      rounds: w.burst,
      hitRounds,
      ...(critical ? { critical } : {}),
      ...(knockedDown ? { knockedDown: true } : {}),
      ...(knockback > 0 ? { knockback } : {}),
    };
  };
}
