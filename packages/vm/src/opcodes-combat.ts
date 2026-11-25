import type { ExecContext, OpHandler, ScriptInstance } from './interpreter.js';
import { int, toInt, type Value } from './stack.js';

/**
 * Opkody rzutow, skilli, XP, widzenia i animacji (Zadanie M3-combat). Semantyka z deasemblacji
 * handlerow (specyfikacja formatu silnik gry; patrz `dokumentacja techniczna`, sekcja "Badania M3-combat").
 * Silnik dostarcza port `CombatHooks`; host dokleja `combatHandlers` PO `gameHandlers`.
 * Brak obiektu = id -1 po stronie hookow, {t:'null'} na stosie; w oryginalu to blad zalogowany
 * i wynik 0 (nie przerwanie skryptu), tak samo tutaj.
 */
export interface CombatHooks {
  /** give_exp_points (0x80a1): dodaje doswiadczenie graczowi (z bonusem Swift Learner). */
  giveExpPoints(xp: number): void;
  /** Wartosc skilla krytera (has_skill 0x80aa); -5 poza zakresem 0..17. */
  skillValue(critter: number, skill: number): number;
  /** Czy obiekt jest krytterem (pid>>24 == 1); roll_vs_skill/has_skill wymagaja krytera. */
  isCritter(id: number): boolean;
  /** roll_vs_skill (0x80ac): rzut pod skill+mod; delta = szansa - d100. */
  rollVsSkill(critter: number, skill: number, mod: number): { degree: number; delta: number };
  /** using_skill (0x80ab): tylko (gracz, skill 8 skradanie) daje stan skradania, reszta 0. */
  usingSkill(critter: number, skill: number): number;
  /** do_check (0x80ae): d10 pod stat+mod, stat 0..6; krytter != null. */
  statCheck(critter: number, stat: number, mod: number): { degree: number; delta: number };
  /** obj_can_see_obj (0x80dc): wzrok `src` na `target` (zasieg percepcji + linia widzenia). */
  canSee(src: number, target: number): boolean;
  /** anim_busy (0x80e7): czy obiekt ma niedokonczona animacje. */
  animBusy(id: number): boolean;
  /** reg_anim_func (0x810e): 1 = begin(flagi), 2 = clear(obiekt), 3 = end. */
  regAnimFunc(op: number, value: number): void;
}

const ch = (c: ExecContext): CombatHooks => c.hooks as unknown as CombatHooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();

/** Pole script+0x4c oryginalu: delta ostatniego rzutu danego skryptu (how_much). */
const lastDelta = new WeakMap<ScriptInstance, number>();

/** Kafel = y*200 + x (0x45607c rozbija wartosc na reszte i iloraz przez 200). */
const TILE_W = 200;

const h = new Map<number, OpHandler>();

h.set(0x80a1, (c) => ch(c).giveExpPoints(popInt(c)));

h.set(0x80aa, (c) => {
  const skill = popInt(c);
  const id = popObj(c);
  c.stack.push(int(id === -1 || !ch(c).isCritter(id) ? 0 : ch(c).skillValue(id, skill)));
});

// using_skill(krytter, skill): oryginal (0x454634) sprawdza wylacznie skill 8 u gracza (0x42e2f8,
// flaga skradania); w pozostalych przypadkach wynik jest niezainicjowany, tu 0.
h.set(0x80ab, (c) => {
  const skill = popInt(c);
  const id = popObj(c);
  c.stack.push(int(id === -1 ? 0 : ch(c).usingSkill(id, skill)));
});

// skill_contest(a, b, c) i roll_dice(a, b): w vanilla atrapy (log "not implemented", wynik 0)
h.set(0x80ad, (c) => {
  popInt(c);
  popInt(c);
  popInt(c);
  c.stack.push(int(0));
});
h.set(0x80b5, (c) => {
  popInt(c);
  popInt(c);
  c.stack.push(int(0));
});

// do_check(obj, stat, mod): obiekt niezerowy, stat 0..6 (0x454890); delta trafia do script+0x4c
h.set(0x80ae, (c) => {
  const mod = popInt(c);
  const stat = popInt(c);
  const who = c.stack.pop();
  const id = objId(who);
  if (id === -1 || id === 0 || stat < 0 || stat > 6) {
    c.stack.push(int(0));
    return;
  }
  const r = ch(c).statCheck(id, stat, mod);
  lastDelta.set(c.instance, r.delta);
  c.stack.push(int(r.degree));
});

h.set(0x80ac, (c) => {
  const mod = popInt(c);
  const skill = popInt(c);
  const id = popObj(c);
  if (id === -1 || !ch(c).isCritter(id)) {
    c.stack.push(int(0));
    return;
  }
  const r = ch(c).rollVsSkill(id, skill, mod);
  lastDelta.set(c.instance, r.delta);
  c.stack.push(int(r.degree));
});

// how_much(rzut): argument jest zdejmowany i ignorowany, wynik = delta ostatniego rzutu skryptu
h.set(0x80b1, (c) => {
  c.stack.pop();
  c.stack.push(int(lastDelta.get(c.instance) ?? 0));
});

h.set(0x80cf, (c) => {
  const tile = popInt(c);
  const lr = popInt(c);
  popInt(c); // ll: oryginal nie uzywa
  popInt(c); // ur: oryginal nie uzywa
  const ul = popInt(c);
  const tx = tile % TILE_W;
  const ty = Math.floor(tile / TILE_W);
  const inside =
    tx <= ul % TILE_W &&
    tx >= lr % TILE_W &&
    ty >= Math.floor(ul / TILE_W) &&
    ty <= Math.floor(lr / TILE_W);
  c.stack.push(int(inside ? 1 : 0));
});

h.set(0x80dc, (c) => {
  const target = popObj(c);
  const src = popObj(c);
  c.stack.push(int(src === -1 || target === -1 ? 0 : ch(c).canSee(src, target) ? 1 : 0));
});

h.set(0x80e7, (c) => {
  const id = popObj(c);
  c.stack.push(int(id === -1 ? 0 : ch(c).animBusy(id) ? 1 : 0));
});

h.set(0x810e, (c) => {
  const value = c.stack.pop();
  const op = popInt(c);
  ch(c).regAnimFunc(op, objId(value));
});

export const combatHandlers: ReadonlyMap<number, OpHandler> = h;
