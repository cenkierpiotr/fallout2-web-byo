import type { ExecContext, OpHandler } from './interpreter.js';
import type { GameHooks } from './hooks.js';
import { TICKS_PER_SECOND, type Scheduler } from './scheduler.js';
import { OPCODES } from './opcode-table.js';
import { int, str, toInt, type Value } from './stack.js';

/**
 * Opkody gry batch 1 (Zadanie 30): obiekty, kafle, czas, animacje, wiadomosci, timery, metarule.
 * Argumenty zdejmowane od ostatniego do pierwszego (arg1 lezy najglebiej). Hooki: GameHooks (hooks.ts);
 * kontekst wywolania zawiera zwykle Hooks interpretera, rzutowany tu na GameHooks (host: engine-core, Z32).
 * Kazdy opkod gry spoza zestawu (z pops znanym w tabeli) trafia do `hooks.unsupported(nazwa, args)`:
 * zdejmuje `pops` argumentow, wynik `unsupported` jest wkladany gdy tabela mowi `pushes = 1`.
 * Opkody dialogu (Z31) i kontekstu (self/source/target/fixed_param/action_being_used, patrz
 * GAME_CONTEXT_OPCODES + contextOpHandlers) host dokleja PO `gameHandlers`, by nadpisaly zastepniki.
 */

/** Numery opkodow kontekstu dla `contextOpHandlers` (fixed_param/action_being_used: hipoteza Z, patrz raport z30). */
export const GAME_CONTEXT_OPCODES = {
  selfObj: 0x80bc,
  sourceObj: 0x80bd,
  targetObj: 0x80be,
  fixedParam: 0x80f7,
  actionBeingUsed: 0x80fa,
} as const;

/** Odleglosc zwracana gdy ktorykolwiek obiekt nie istnieje / nie lezy na mapie. */
export const TILE_DISTANCE_NONE = 9999;

const g = (c: ExecContext): GameHooks => c.hooks as GameHooks;

/** Id obiektu z wartosci stosu: obj/int -> id, null -> -1. */
function objId(v: Value): number {
  return v.t === 'null' ? -1 : toInt(v);
}
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();

function strOfValue(v: Value): string {
  return v.t === 'str' ? v.v : String(v.t === 'null' ? 0 : (v as { v: number }).v);
}

const h = new Map<number, OpHandler>();

// --- obiekty
h.set(0x80bf, (c) => c.stack.push({ t: 'obj', v: g(c).dudeObj() }));
h.set(0x80a4, (c) => c.stack.push(str(g(c).objName(popObj(c)))));
h.set(0x80c8, (c) => c.stack.push(int(g(c).objType(popObj(c)))));
h.set(0x8100, (c) => c.stack.push(int(g(c).objPid(popObj(c)))));
h.set(0x80ec, (c) => c.stack.push(int(g(c).objElevation(popObj(c)))));
h.set(0x80b7, (c) => {
  const sid = popInt(c);
  const elev = popInt(c);
  const hex = popInt(c);
  const pid = popInt(c);
  const id = g(c).createObject(pid, hex, elev, sid);
  c.stack.push(id === -1 ? { t: 'null' } : { t: 'obj', v: id });
});
h.set(0x80f4, (c) => g(c).destroyObject(popObj(c)));
h.set(0x80b6, (c) => {
  const elev = popInt(c);
  const hex = popInt(c);
  g(c).moveTo(popObj(c), hex, elev);
  c.stack.push(int(0));
});
h.set(0x8104, (c) => {
  const member = popInt(c);
  const pid = popInt(c);
  c.stack.push(int(g(c).protoData(pid, member)));
});

// --- statystyki i cechy
h.set(0x80ca, (c) => {
  const stat = popInt(c);
  c.stack.push(int(g(c).getCritterStat(popObj(c), stat)));
});
h.set(0x80cb, (c) => {
  const v = popInt(c);
  const stat = popInt(c);
  c.stack.push(int(g(c).setCritterStat(popObj(c), stat, v)));
});
h.set(0x8102, (c) => {
  const amount = popInt(c);
  const trait = popInt(c);
  const kind = popInt(c);
  c.stack.push(int(g(c).critterAddTrait(popObj(c), kind, trait, amount)));
});

// --- kafle
h.set(0x80d2, (c) => {
  const b = popInt(c);
  c.stack.push(int(g(c).tileDistance(popInt(c), b)));
});
h.set(0x80d3, (c) => {
  const hooks = g(c);
  const ob = popObj(c);
  const oa = popObj(c);
  if (oa === -1 || ob === -1) return void c.stack.push(int(TILE_DISTANCE_NONE));
  const ha = hooks.objHex(oa);
  const hb = hooks.objHex(ob);
  c.stack.push(int(ha < 0 || hb < 0 ? TILE_DISTANCE_NONE : hooks.tileDistance(ha, hb)));
});
h.set(0x80d4, (c) => c.stack.push(int(g(c).objHex(popObj(c)))));
h.set(0x80d5, (c) => {
  const n = popInt(c);
  const dir = popInt(c);
  const hex = popInt(c);
  if (dir < 0 || dir > 5) {
    // ADR-0004: oryginal tolerancyjny wobec zlego kierunku; logujemy i zwracamy -1 zamiast rzucac
    g(c).unsupported('tile_num_in_direction:invalid_dir', [int(hex), int(dir), int(n)]);
    c.stack.push(int(-1));
    return;
  }
  if (hex === -1 || n === 0) return void c.stack.push(int(-1));
  const r = g(c).tileInDirection(hex, dir, n);
  c.stack.push(int(r < 0 ? -1 : r));
});
const tileContains = (c: ExecContext): void => {
  const pid = popInt(c);
  const elev = popInt(c);
  const hex = popInt(c);
  c.stack.push(int(g(c).tileContainsObjPid(hex, elev, pid)));
};
// 0x80a7 zwraca obiekt (null gdy brak), 0x80bb tylko 1/0 (0x45a0a4 vs 0x45a1c4)
h.set(0x80a7, (c) => {
  const pid = popInt(c);
  const elev = popInt(c);
  const hex = popInt(c);
  const id = g(c).tileObjByPid(hex, elev, pid);
  c.stack.push(id === -1 ? { t: 'null' } : { t: 'obj', v: id });
});
h.set(0x80bb, tileContains);

// --- czas
h.set(0x80ea, (c) => c.stack.push(int(g(c).gameTime())));
h.set(0x80f6, (c) => c.stack.push(int(g(c).gameTimeHour())));
h.set(0x8118, (c) => c.stack.push(int(g(c).gameMonth())));
h.set(0x8119, (c) => c.stack.push(int(g(c).gameDay())));
h.set(0x80f3, (c) => {
  const trait = popInt(c);
  const id = popObj(c);
  c.stack.push(int(g(c).hasTrait(popInt(c), id, trait)));
});
h.set(0x8149, (c) => c.stack.push(int(g(c).objArtFid(popObj(c)))));
h.set(0x80f2, (c) => c.stack.push(int(Math.max(0, popInt(c)) * TICKS_PER_SECOND)));
h.set(0x80b4, (c) => {
  const max = popInt(c);
  c.stack.push(int(g(c).random(popInt(c), max)));
});

// --- timery: bez Schedulera pierwszy argument (id obiektu) idzie do hooka w roli "sid" (host mapuje
// obiekt -> skrypt); z `createGameHandlers(sched)` timer dotyczy skryptu wywolujacego (entryOf(instance).sid).
h.set(0x80f0, (c) => {
  const fixed = popInt(c);
  const ticks = popInt(c);
  g(c).addTimerEvent(popObj(c), ticks, fixed);
});
h.set(0x80f1, (c) => g(c).rmTimerEvent(popObj(c)));

// --- animacje
h.set(0x80cc, (c) => g(c).animateStand(popObj(c)));
h.set(0x80ce, (c) => {
  const flags = popInt(c);
  const hex = popInt(c);
  g(c).animateMoveToHex(popObj(c), hex, (flags & 0x10) !== 0);
});

// --- wiadomosci i interfejs
h.set(0x80b8, (c) => g(c).displayMsg(strOfValue(c.stack.pop())));
h.set(0x8154, (c) => void c.stack.pop());
h.set(0x8105, (c) => {
  const msgId = popInt(c);
  c.stack.push(str(g(c).messageStr(popInt(c), msgId)));
});
h.set(0x810a, (c) => {
  const color = popInt(c);
  const text = strOfValue(c.stack.pop());
  g(c).floatMsg(popObj(c), text, color);
});
h.set(0x80a3, (c) => g(c).playSfx(strOfValue(c.stack.pop())));
h.set(0x80e9, (c) => g(c).setLightLevel(popInt(c)));
h.set(0x8136, (c) => g(c).gfade('out', popInt(c)));
h.set(0x8137, (c) => g(c).gfade('in', popInt(c)));
h.set(0x80a9, (c) => {
  const rot = popInt(c);
  const elev = popInt(c);
  const y = popInt(c);
  g(c).overrideMapStart(popInt(c), y, elev, rot);
});

// --- metarule
h.set(0x810b, (c) => {
  const arg = c.stack.pop();
  c.stack.push(g(c).metarule(popInt(c), arg, c.instance));
});
h.set(0x80e1, (c) => {
  const b3 = c.stack.pop();
  const b2 = c.stack.pop();
  const b1 = c.stack.pop();
  c.stack.push(g(c).metarule3(popInt(c), b1, b2, b3));
});

// sfall/patch 0x815a-0x815d (wzorzec uzycia w ecpariah.int): statystyki gracza. Baza = stat_set_base/f2_stat_level
// gracza, extra = premia skryptowa (przez hooks.unsupported, model w silniku).
h.set(0x815a, (c) => {
  const v = popInt(c);
  const stat = popInt(c);
  g(c).setCritterStat(g(c).dudeObj(), stat, v);
});
h.set(0x815b, (c) => {
  const v = popInt(c);
  const stat = popInt(c);
  g(c).unsupported('set_pc_extra_stat', [int(stat), int(v)]);
});
h.set(0x815c, (c) => {
  const stat = popInt(c);
  c.stack.push(int(g(c).getCritterStat(g(c).dudeObj(), stat)));
});
h.set(0x815d, (c) => {
  const stat = popInt(c);
  c.stack.push(g(c).unsupported('get_pc_extra_stat', [int(stat)]));
});

/** Zastepnik dla opkodu bez implementacji: zdejmuje `pops` argumentow, deleguje do hooks.unsupported. */
function unsupportedHandler(name: string, pops: number, pushes: 0 | 1): OpHandler {
  return (c) => {
    const args: Value[] = [];
    for (let i = 0; i < pops; i++) args.unshift(c.stack.pop());
    const r = g(c).unsupported(name, args);
    if (pushes === 1) c.stack.push(r);
  };
}

/** Opkody zaimplementowane jawnie w batchu 1. */
export const implementedGameOpcodes: ReadonlySet<number> = new Set(h.keys());

/** Opkody gry (0x804c-0x8155) o znanym `pops` bez implementacji: tylko log przez hooks.unsupported. */
function buildAll(): ReadonlyMap<number, OpHandler> {
  const m = new Map<number, OpHandler>();
  for (const def of OPCODES.values()) {
    if (def.kind !== 'game' || def.pops < 0 || h.has(def.op)) continue;
    m.set(def.op, unsupportedHandler(def.name, def.pops, def.pushes));
  }
  for (const [op, fn] of h) m.set(op, fn);
  return m;
}

export const gameHandlers: ReadonlyMap<number, OpHandler> = buildAll();

/** Wersja z timerami powiazanymi ze skryptem wywolujacym (sid z wpisu Schedulera). */
export function createGameHandlers(
  sched: Pick<Scheduler, 'entryOf'>,
): ReadonlyMap<number, OpHandler> {
  const sidOf = (c: ExecContext): number => {
    const e = sched.entryOf(c.instance);
    if (!e) c.fail('instancja nie jest zarejestrowana w Schedulerze (timer)');
    return (e as { sid: number }).sid;
  };
  const m = new Map(gameHandlers);
  m.set(0x80f0, (c) => {
    const fixed = popInt(c);
    const ticks = popInt(c);
    popObj(c);
    g(c).addTimerEvent(sidOf(c), ticks, fixed);
  });
  m.set(0x80f1, (c) => {
    popObj(c);
    g(c).rmTimerEvent(sidOf(c));
  });
  return m;
}
