import type { ExecContext, OpHandler, ScriptInstance } from './interpreter.js';
import { float, int, str, strOffsetOf, strStatic, toInt, truthy, type Value } from './stack.js';

/**
 * Opkody rdzenia (Core 0x8000-0x804B) plus zmienne gry 0x80c1-0x80c6 (przez Hooks).
 * Semantyka wg dokumentacja techniczna (R9 z28b). Model pamieci: jeden stos danych, argumenty procedury
 * zostaja na nim; base14 = baza ramki (0x802b/0x8029/0x802a), base18 = baza zmiennych skryptu (0x802c).
 * - call (0x8005): zdejmuje tylko indeks; argc zostaje na stosie (czyta je 0x802b); adres powrotu odklada 0x800d.
 * - 0x8012/0x8013 adresuja zmienne SKRYPTU (base18 + i), 0x8031/0x8032 zmienne ramki (base14 + i),
 *   0x8014/0x8015 zmienne zewnetrzne po nazwie. Store: wartosc pod spodem, indeks/nazwa na szczycie.
 * Opkody 0x8022-0x8024 i 0x8026 (ctx docelowy nieznany) zglaszaja VmError zamiast zgadywac.
 */

import {
  FLAG_EXIT,
  FLAG_RESULT,
  FLAG_SPAWNED,
  FLAG_WAIT_CALLBACK,
  FLAG_WAIT_CHILD,
  PROC_CONDITIONAL,
  PROC_TIMED,
} from './interpreter.js';
function isNum(v: Value): boolean {
  return v.t !== 'str';
}

function num(v: Value): number {
  return v.t === 'null' ? 0 : (v as { v: number }).v;
}

const mix = (a: Value, b: Value): 'float' | 'int' =>
  a.t === 'float' || b.t === 'float' ? 'float' : 'int';

function binary(ctx: ExecContext): [Value, Value] {
  const b = ctx.stack.pop();
  const a = ctx.stack.pop();
  return [a, b];
}

function bool(b: boolean): Value {
  return int(b ? 1 : 0);
}

/** Porownania: liczby numerycznie (int/float/obj/null), stringi leksykograficznie; mieszanie str z liczba: eq=false, ne=true, reszta blad. */
function compare(
  ctx: ExecContext,
  name: string,
  cmp: (c: number) => boolean,
  onMismatch?: boolean,
): void {
  const [a, b] = binary(ctx);
  if (a.t === 'str' && b.t === 'str') {
    ctx.stack.push(bool(cmp(a.v < b.v ? -1 : a.v > b.v ? 1 : 0)));
  } else if (isNum(a) && isNum(b)) {
    const x = num(a);
    const y = num(b);
    ctx.stack.push(bool(cmp(x < y ? -1 : x > y ? 1 : 0)));
  } else if (onMismatch !== undefined) {
    ctx.stack.push(bool(onMismatch));
  } else {
    ctx.fail(`${name}: nieporownywalne typy ${a.t} i ${b.t}`);
  }
}

function strOf(v: Value): string {
  return v.t === 'str' ? v.v : String(num(v));
}

function arith(
  ctx: ExecContext,
  name: string,
  fi: (x: number, y: number) => number,
  ff: (x: number, y: number) => number,
): void {
  const [a, b] = binary(ctx);
  if (!isNum(a) || !isNum(b)) ctx.fail(`${name}: operandy nie sa liczbami (${a.t}, ${b.t})`);
  ctx.stack.push(mix(a, b) === 'float' ? float(ff(num(a), num(b))) : int(fi(num(a), num(b))));
}

function intOnly(ctx: ExecContext, name: string, f: (x: number, y: number) => number): void {
  const [a, b] = binary(ctx);
  if (!isNum(a) || !isNum(b)) ctx.fail(`${name}: operandy nie sa liczbami`);
  ctx.stack.push(int(f(toInt(a), toInt(b))));
}

function varIndex(ctx: ExecContext): number {
  return ctx.stack.popInt();
}

const h = new Map<number, OpHandler>();

// --- stale
h.set(0x8001, (c) => c.stack.push(int(c.arg)));
h.set(0xc001, (c) => c.stack.push(int(c.arg)));
h.set(0xa001, (c) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, c.arg >>> 0, false);
  c.stack.push(float(dv.getFloat32(0, false)));
});
h.set(0x9001, (c) => c.stack.push(strStatic(c.resolveString(c.arg), c.arg)));

// --- sterowanie
h.set(0x8000, () => {});
h.set(0x8002, (c) => {
  c.instance.critical = true;
});
h.set(0x8003, (c) => {
  c.instance.critical = false;
});
h.set(0x8004, (c) => c.jump(c.stack.popInt()));
h.set(0x802f, (c) => {
  const cond = c.stack.pop();
  const addr = c.stack.popInt();
  if (!truthy(cond)) c.jump(addr);
});
h.set(0x8005, (c) => c.callProc(c.stack.popInt()));
h.set(0x800c, (c) => {
  const v = c.instance.retStack.pop();
  if (v === undefined) c.fail('pusty stos powrotow (ret_to_data)');
  c.stack.push(v as Value);
});
h.set(0x800d, (c) => c.instance.retStack.push(c.stack.pop()));
h.set(0x801c, (c) => c.returnFromProc());
h.set(0x8010, (c) => c.halt());
h.set(0x8011, (c) => c.suspend());
h.set(0x8019, (c) => {
  const r = c.instance.retStack;
  if (r.length < 2) c.fail('swap_ret: stos powrotow ma mniej niz 2 wpisy');
  const top = r[r.length - 1] as Value;
  r[r.length - 1] = r[r.length - 2] as Value;
  r[r.length - 2] = top;
});
h.set(0x802a, (c) => {
  const base = c.instance.base14;
  if (c.stack.depth() < base)
    c.fail(`pop_frame: stos (${c.stack.depth()}) plytszy niz base14 (${base})`);
  c.stack.truncate(base);
});
h.set(0x802b, (c) => {
  const n = c.stack.popInt();
  if (n < 0 || n > c.stack.depth())
    c.fail(`push_frame: zla liczba argumentow ${n} (stos ${c.stack.depth()})`);
  c.instance.retStack.push(int(c.instance.base14));
  c.instance.base14 = c.stack.depth() - n;
});
h.set(0x802c, (c) => {
  c.instance.base18 = c.stack.depth();
});
h.set(0x8029, (c) => {
  const v = c.instance.retStack.pop();
  if (v === undefined) c.fail('pop_base: pusty stos powrotow');
  if ((v as Value).t !== 'int')
    c.fail(`pop_base: wpis stosu powrotow nie jest int (${(v as Value).t})`);
  c.instance.base14 = (v as { v: number }).v;
});
h.set(0x802d, (c) => {
  const v = c.stack.pop();
  if (v.t !== 'int') c.fail(`proc_address: indeks nie jest int (${v.t})`);
  c.stack.push(int(procAt(c, (v as { v: number }).v).bodyOffset));
});
h.set(0x802e, (c) => {
  const n = c.stack.popInt();
  if (n < 0) c.fail(`pop_n: ujemne n (${n})`);
  for (let i = 0; i < n; i++) c.stack.pop();
});
h.set(0x8030, (c) => {
  const cond = c.stack.pop();
  if (!truthy(cond)) c.jump(c.stack.popInt());
});

// --- stos
h.set(0x801a, (c) => void c.stack.pop());
h.set(0x801b, (c) => c.stack.push(c.stack.peek()));
h.set(0x8018, (c) => {
  const [a, b] = binary(c);
  c.stack.push(b);
  c.stack.push(a);
});

// --- zmienne skryptu (base18) i ramki (base14)
function slotIndex(c: ExecContext, base: number, i: number, what: string): number {
  if (i < 0) c.fail(`${what}: ujemny indeks ${i}`);
  const at = base + i;
  if (at >= c.stack.depth())
    c.fail(`${what}: indeks ${i} poza stosem (baza ${base}, glebokosc ${c.stack.depth()})`);
  return at;
}
function fetchSlot(c: ExecContext, base: number, what: string): void {
  const i = c.stack.popInt();
  c.stack.push(c.stack.get(slotIndex(c, base, i, what)));
}
function storeSlot(c: ExecContext, base: number, what: string): void {
  // kompilator emituje: wartosc, potem indeks (szczyt = indeks); dowod: ciagi `<wyrazenie> push idx store` w skryptach
  const i = c.stack.popInt();
  const v = c.stack.pop();
  c.stack.set(slotIndex(c, base, i, what), v);
}
h.set(0x8012, (c) => fetchSlot(c, c.instance.base18, 'fetch_global'));
h.set(0x8013, (c) => storeSlot(c, c.instance.base18, 'store_global'));
// 0x8014/0x8015: zmienne ZEWNETRZNE po nazwie (R-M3c); 0x8031/0x8032: zmienne ramki (base14 + i)
// Oryginal (0x46bf90) nie sprawdza typu nazwy: wartosc int (c001) jest offsetem w tablicy stringow, jak 0x9001
// (scbrahmn, scslvgrd, scdthcla: `c001 <off>; 0x8014`).
function popExternalName(c: ExecContext): string {
  const v = c.stack.pop();
  if (v.t === 'str') {
    const off = strOffsetOf(v);
    return off !== undefined ? c.resolveIdent(off) : v.v;
  }
  if (v.t === 'int') return c.resolveIdent(v.v);
  return c.fail(`zmienna zewnetrzna: nazwa musi byc stringiem lub offsetem, jest ${v.t}`);
}
h.set(0x8014, (c) => {
  const name = popExternalName(c);
  const v = c.hooks.getExternal?.(name);
  if (v === undefined) c.fail(`fetch_external: zmienna zewnetrzna "${name}" nie istnieje`);
  c.stack.push(v as Value);
});
h.set(0x8015, (c) => {
  const name = popExternalName(c);
  const v = c.stack.pop();
  if (c.hooks.getExternal?.(name) === undefined)
    c.fail(`store_external: zmienna zewnetrzna "${name}" nie istnieje`);
  c.hooks.setExternal?.(name, v);
});

// --- procedury, czas, potomkowie, eksport (R9 z28b)
function procAt(c: ExecContext, index: number) {
  const p = c.instance.script.procs[index];
  if (index < 0 || !p) c.fail(`nieistniejaca procedura #${index}`);
  return p as { name: string; bodyOffset: number; argc: number; index: number };
}
function procIndexArg(c: ExecContext, v: Value, what: string): number {
  if (v.t === 'str') c.fail(`${what}: indeks procedury nie jest liczba`);
  return toInt(v);
}
h.set(0x8006, (c) => {
  const index = procIndexArg(c, c.stack.pop(), 'call_at_time');
  const delay = c.stack.popInt();
  procAt(c, index);
  const rt = c.instance.procRuntime[index] as { flags: number; time: number };
  rt.time = delay * 1000 + c.nowMs();
  rt.flags |= PROC_TIMED;
});
h.set(0x8007, (c) => {
  const index = procIndexArg(c, c.stack.pop(), 'call_if');
  const cond = c.stack.popInt();
  procAt(c, index);
  const rt = c.instance.procRuntime[index] as { flags: number; cond: number };
  rt.cond = cond;
  rt.flags |= PROC_CONDITIONAL;
});
h.set(0x8048, (c) => {
  const index = c.stack.popInt();
  procAt(c, index);
  c.instance.procRuntime[index] = { flags: 0, time: 0, cond: 0 };
});
h.set(0x8049, (c) => {
  const rt = c.instance.procRuntime;
  for (let i = 0; i < rt.length; i++) rt[i] = { flags: 0, time: 0, cond: 0 };
});
h.set(0x8047, (c) => {
  const ms = c.stack.popInt();
  c.instance.waitUntil = c.nowMs() + ms;
  c.instance.flags |= FLAG_WAIT_CALLBACK;
  c.suspend();
});

function launch(
  c: ExecContext,
  mode: 'call_start' | 'exec' | 'spawn' | 'fork',
  name: string,
): ScriptInstance {
  if (!c.hooks.execScript) c.fail(`${mode}: brak Hooks.execScript (ladowanie skryptu "${name}")`);
  const child = c.hooks.execScript!({ mode, name, parent: c.instance });
  if (!child) c.fail(`${mode}: nie mozna uruchomic skryptu "${name}"`);
  return child as ScriptInstance;
}
function startChild(c: ExecContext, mode: 'call_start' | 'spawn', flag: number): void {
  const name = c.stack.popStr();
  const me = c.instance;
  if (me.child) c.fail(`${mode}: skrypt ma juz potomka`);
  me.flags |= flag;
  const child = launch(c, mode, name);
  child.parent = me;
  me.child = child;
  if (mode === 'spawn' && me.critical) child.critical = true;
  c.suspend();
}
h.set(0x8008, (c) => startChild(c, 'call_start', FLAG_WAIT_CHILD));
h.set(0x800a, (c) => startChild(c, 'spawn', FLAG_SPAWNED));
h.set(0x800b, (c) => void launch(c, 'fork', c.stack.popStr()));
h.set(0x8009, (c) => {
  const name = c.stack.popStr();
  const me = c.instance;
  const child = launch(c, 'exec', name);
  child.parent = me.parent;
  if (me.parent) {
    me.parent.child = child;
    me.parent.flags &= ~FLAG_SPAWNED;
  }
  me.parent = undefined;
  me.flags |= FLAG_EXIT;
  c.halt();
});
h.set(0x800e, (c) => {
  const me = c.instance;
  me.flags |= FLAG_EXIT;
  if (me.parent) me.parent.flags &= ~FLAG_SPAWNED;
  if (!me.exitNotified) {
    me.exitNotified = true;
    c.hooks.onExit?.(me);
  }
  c.halt();
});
h.set(0x800f, (c) => {
  const me = c.instance;
  const p = me.parent;
  if (!p) return;
  p.flags &= ~(FLAG_WAIT_CHILD | FLAG_SPAWNED);
  if (p.child === me) p.child = undefined;
});
h.set(0x8017, (c) => {
  const index = c.stack.popInt();
  const argc = c.stack.popInt();
  const name = procAt(c, index).name;
  if (c.instance.exports.has(name))
    c.fail(`export_procedure: procedura "${name}" juz wyeksportowana`);
  c.instance.exports.set(name, { index, argc });
  c.hooks.exportProcedure?.(c.instance, name, index, argc);
});
h.set(0x8027, (c) => {
  const expected = c.stack.popInt();
  const index = c.stack.popInt();
  const p = procAt(c, index);
  if (p.argc !== expected)
    c.fail(`check_argc: procedura "${p.name}" ma argc=${p.argc}, oczekiwano ${expected}`);
});
h.set(0x8028, (c) => {
  const name = c.stack.popStr().toLowerCase();
  const procs = c.instance.script.procs;
  for (let i = 1; i < procs.length - 1; i++) {
    if ((procs[i] as { name: string }).name.toLowerCase() === name) {
      c.stack.push(int(i));
      return;
    }
  }
  c.fail(`lookup_proc_by_name: brak procedury "${name}"`);
});

// --- powroty i kontekst (0x801d-0x8026)
function restoreCtx(c: ExecContext): void {
  c.instance.userdata = c.stack.pop();
  c.instance.callback = c.stack.pop();
  c.instance.flags = c.stack.popInt() & 0xffff;
}
function targetUnknown(c: ExecContext, name: string): never {
  return c.fail(`${name}: ctx docelowy nieznany (R9 z28b niewiadome), opkod niezaimplementowany`);
}
h.set(0x801d, (c) => {
  c.returnFromProc();
  c.instance.flags |= FLAG_RESULT;
});
h.set(0x801e, (c) => {
  if (c.instance.retStack.pop() === undefined) c.fail('pop_ret: pusty stos powrotow');
});
h.set(0x801f, restoreCtx);
h.set(0x8020, (c) => {
  restoreCtx(c);
  c.returnFromProc();
});
h.set(0x8021, (c) => {
  restoreCtx(c);
  c.returnFromProc();
  c.instance.flags |= FLAG_RESULT;
});
h.set(0x8022, (c) => targetUnknown(c, 'exit_v3 (0x8022)'));
h.set(0x8023, (c) => targetUnknown(c, 'exit_v4 (0x8023)'));
h.set(0x8024, (c) => targetUnknown(c, 'exit_v5 (0x8024)'));
h.set(0x8025, (c) => {
  const v = c.stack.pop();
  restoreCtx(c);
  c.returnFromProc();
  c.instance.flags |= FLAG_RESULT;
  c.stack.push(v);
});
h.set(0x8026, (c) => targetUnknown(c, 'exit_v7 (0x8026)'));

// --- zmienne eksportowane
h.set(0x8016, (c) => c.hooks.exportVar?.(popExternalName(c)));
h.set(0x8031, (c) => storeSlot(c, c.instance.base14, 'store_dvar'));
h.set(0x8032, (c) => fetchSlot(c, c.instance.base14, 'fetch_dvar'));

// --- zmienne gry przez Hooks
h.set(0x80c1, (c) => c.stack.push(int(c.hooks.getLocalVar(c.instance, varIndex(c)))));
h.set(0x80c2, (c) => {
  const v = c.stack.popInt();
  c.hooks.setLocalVar(c.instance, varIndex(c), v);
});
h.set(0x80c3, (c) => c.stack.push(int(c.hooks.getMapVar(c.instance, varIndex(c)))));
h.set(0x80c4, (c) => {
  const v = c.stack.popInt();
  c.hooks.setMapVar(c.instance, varIndex(c), v);
});
h.set(0x80c5, (c) => c.stack.push(int(c.hooks.getGlobalVar(varIndex(c)))));
h.set(0x80c6, (c) => {
  const v = c.stack.popInt();
  c.hooks.setGlobalVar(varIndex(c), v);
});

// --- porownania
h.set(0x8033, (c) => compare(c, 'eq', (x) => x === 0, false));
h.set(0x8034, (c) => compare(c, 'ne', (x) => x !== 0, true));
h.set(0x8035, (c) => compare(c, 'le', (x) => x <= 0));
h.set(0x8036, (c) => compare(c, 'ge', (x) => x >= 0));
h.set(0x8037, (c) => compare(c, 'lt', (x) => x < 0));
h.set(0x8038, (c) => compare(c, 'gt', (x) => x > 0));

// --- arytmetyka (int 32-bit z zawinieciem; mieszanie int/float daje float; str + dowolny = konkatenacja)
h.set(0x8039, (c) => {
  const [a, b] = binary(c);
  if (a.t === 'str' || b.t === 'str') {
    c.stack.push(str(strOf(a) + strOf(b)));
    return;
  }
  c.stack.push(mix(a, b) === 'float' ? float(num(a) + num(b)) : int(num(a) + num(b)));
});
h.set(0x803a, (c) =>
  arith(
    c,
    'sub',
    (x, y) => x - y,
    (x, y) => x - y,
  ),
);
h.set(0x803b, (c) =>
  arith(
    c,
    'mul',
    (x, y) => Math.imul(x, y),
    (x, y) => x * y,
  ),
);
h.set(0x803c, (c) =>
  arith(
    c,
    'div',
    (x, y) => (y === 0 ? c.fail('dzielenie przez zero') : Math.trunc(x / y)),
    (x, y) => (y === 0 ? c.fail('dzielenie przez zero') : x / y),
  ),
);
h.set(0x803d, (c) =>
  arith(
    c,
    'mod',
    (x, y) => (y === 0 ? c.fail('modulo przez zero') : x % y),
    (x, y) => (y === 0 ? c.fail('modulo przez zero') : x % y),
  ),
);
h.set(0x803e, (c) => {
  const [a, b] = binary(c);
  c.stack.push(bool(truthy(a) && truthy(b)));
});
h.set(0x803f, (c) => {
  const [a, b] = binary(c);
  c.stack.push(bool(truthy(a) || truthy(b)));
});
h.set(0x8040, (c) => intOnly(c, 'bit_and', (x, y) => x & y));
h.set(0x8041, (c) => intOnly(c, 'bit_or', (x, y) => x | y));
h.set(0x8042, (c) => intOnly(c, 'bit_xor', (x, y) => x ^ y));
h.set(0x8043, (c) => c.stack.push(int(~c.stack.popInt())));
h.set(0x8044, (c) => {
  const v = c.stack.pop();
  if (!isNum(v)) c.fail('floor: operand nie jest liczba');
  c.stack.push(int(Math.floor(num(v))));
});
h.set(0x8045, (c) => c.stack.push(bool(!truthy(c.stack.pop()))));
h.set(0x8046, (c) => {
  const v = c.stack.pop();
  if (!isNum(v)) c.fail('neg: operand nie jest liczba');
  c.stack.push(v.t === 'float' ? float(-num(v)) : int(-num(v)));
});

export const coreHandlers: ReadonlyMap<number, OpHandler> = h;
