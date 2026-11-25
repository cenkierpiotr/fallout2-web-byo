import type { CombatEvent } from './combat';

/** Maksymalna liczba wpisow dziennika komunikatow (starsze sa odrzucane). */
export const MESSAGE_LOG_MAX = 200;

/** Dziennik komunikatow (okienko u dolu HUD w oryginale): lista linii z subskrypcja. */
export class MessageLog {
  private items: string[] = [];
  private readonly subs = new Set<(lines: readonly string[]) => void>();

  add(line: string): void {
    const text = line.trim();
    if (!text) return;
    this.items.push(text);
    if (this.items.length > MESSAGE_LOG_MAX)
      this.items.splice(0, this.items.length - MESSAGE_LOG_MAX);
    this.emit();
  }

  clear(): void {
    this.items = [];
    this.emit();
  }

  lines(): readonly string[] {
    return this.items;
  }

  subscribe(fn: (lines: readonly string[]) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private emit(): void {
    const snap = [...this.items];
    for (const fn of this.subs) fn(snap);
  }
}

/**
 * Bazy id wpisow combat.msg (D, exe 0x4251c9-0x425320): 500 = podmiot to gracz, 600 = inny podmiot; warianty dla plci
 * zenskiej (stat 0x22 = 1): 550 gracz, 700 inny. Podmiot (D): przy trafieniu (attack.attackerFlags & DAM_HIT, bajt +0x15
 * bit 0) cel (attack.defender, +0x20), inaczej atakujacy (+0x0); wariant wg stat_level(podmiot, 0x22) == 1. Gdy wpisu
 * wariantu brak w combat.msg, uzywany jest meski.
 */
const BASE_PLAYER = 500;
const BASE_OTHER = 600;
const BASE_PLAYER_F = 550;
const BASE_OTHER_F = 700;
const MSG_YOU = 506;
const MSG_YOU_F = 556;
/**
 * Pierwszy id nazw trafionej czesci ciala dla humanoida; kolejnosc = enum BodyPart. Exe (0x42612c, D): id =
 * 1000 + 10 * N + czesc, gdzie N to 2. kolumna wpisu art/critters/critters.lst (humanoid 11 -> 1110, quadruped 15 ->
 * 1150, robot 17 -> 1170, power armor 21 -> 1210); `CombatLogEnv.partBase` podaje te baze per cel.
 */
const MSG_PART_BASE = 1110;

/** Baza nazw czesci ciala z wpisu critters.lst (`hapowr,21,1` -> 1210); undefined gdy brak 2. kolumny. */
export function partMsgBase(lstEntry: string): number | undefined {
  const n = Number.parseInt(lstEntry.split(',')[1] ?? '', 10);
  return Number.isFinite(n) ? 1000 + 10 * n : undefined;
}
const PART_UNCALLED = 8;

export interface CombatLogEnv {
  /** Wpisy combat.msg (jezyk wg ustawienia, z fallbackiem EN). */
  msg: ReadonlyMap<number, string>;
  /** Nazwa obiektu po id (pro_crit.msg). */
  nameOf(id: number): string;
  playerId: number;
  /** Baza id nazw czesci ciala celu (domyslnie 1110 = humanoid); patrz `partMsgBase`. */
  partBase?(id: number): number | undefined;
  /** Tlumaczenie kluczy i18n dla linii bez odpowiednika w combat.msg albo przy braku pliku. */
  t(key: string, params?: Record<string, string | number>): string;
}

/** Wstawia kolejne argumenty w %s / %d (jak printf oryginalu). */
export function fillPrintf(fmt: string, ...args: Array<string | number>): string {
  let i = 0;
  return fmt.replace(/%[sd]/g, () => String(args[i++] ?? ''));
}

/**
 * Tekst dziennika dla zdarzenia walki albo null (tury, ruchy, taunty maja inne kanaly).
 * Trafienie: wzorce 511-528 (cel = gracz) i 611-628 (inni) z combat.msg; pudlo: 514/515 i 614/615 z nazwa atakujacego.
 */
export function formatCombatEvent(e: CombatEvent, env: CombatLogEnv): string | null {
  const { msg } = env;
  if (e.kind === 'death') return env.t('log.death', { name: env.nameOf(e.id) });
  if (e.kind === 'flee') return env.t('log.flee', { name: env.nameOf(e.id) });
  if (e.kind !== 'attack') return null;
  // D (exe 0x425243-0x425273): "Ty" = 506 (gracz meski) albo 556 (stat 0x22 gracza = 1), zawsze wg plci GRACZA
  const playerFemale =
    (e.attacker === env.playerId && !!e.attackerFemale) ||
    (e.target === env.playerId && !!e.targetFemale);
  const youName =
    (playerFemale ? msg.get(MSG_YOU_F) : undefined) ?? msg.get(MSG_YOU) ?? env.t('log.you');
  const name = (id: number): string => (id === env.playerId ? youName : env.nameOf(id));
  if (!e.hit) {
    const isP = e.attacker === env.playerId;
    const off = e.critMiss ? 14 : 15;
    const fb = e.attackerFemale ? (isP ? BASE_PLAYER_F : BASE_OTHER_F) : undefined;
    const tpl =
      (fb !== undefined ? msg.get(fb + off) : undefined) ??
      msg.get((isP ? BASE_PLAYER : BASE_OTHER) + off);
    return tpl ? fillPrintf(tpl, name(e.attacker)) : env.t('log.miss', { name: name(e.attacker) });
  }
  const base = e.target === env.playerId ? BASE_PLAYER : BASE_OTHER;
  const who = name(e.target);
  const partName =
    e.part !== undefined && e.part !== PART_UNCALLED
      ? msg.get((env.partBase?.(e.target) ?? MSG_PART_BASE) + e.part)
      : undefined;
  const crit = !!e.critical;
  const dmg = e.damage;
  // 0 obrazen: 525-528, 1 pkt: 521-524, wiecej: 511/512/513 + 520 (krytyk bez czesci)
  let off: number;
  if (dmg <= 0) off = partName ? (crit ? 25 : 26) : crit ? 28 : 27;
  else if (dmg === 1) off = partName ? (crit ? 21 : 22) : crit ? 24 : 23;
  else off = partName ? (crit ? 11 : 12) : crit ? 20 : 13;
  const fBase = e.targetFemale
    ? e.target === env.playerId
      ? BASE_PLAYER_F
      : BASE_OTHER_F
    : undefined;
  const tpl = (fBase !== undefined ? msg.get(fBase + off) : undefined) ?? msg.get(base + off);
  if (tpl) {
    const args: Array<string | number> = [who];
    if (partName && tpl.includes('%s', tpl.indexOf('%s') + 2)) args.push(partName);
    if (dmg > 1) args.push(dmg);
    return fillPrintf(tpl, ...args);
  }
  return env.t(partName ? 'log.hitPart' : 'log.hit', {
    name: who,
    part: partName ?? '',
    damage: dmg,
  });
}
