import { VmError } from './errors.js';
import { OPCODES, hasInlineArg } from './opcode-table.js';
import { coreHandlers } from './opcodes-core.js';
import { ValueStack, int, toInt, type Value } from './stack.js';
import { DEFAULT_MAX_STEPS, type ExecOptions } from './trace.js';

/** Minimalny ksztalt skryptu wymagany przez VM (IntScript z @f2/formats go spelnia strukturalnie). */
export interface IntScriptLike {
  name: string;
  procs: readonly { name: string; bodyOffset: number; argc: number; index: number }[];
  strings: readonly string[];
  /** Caly plik; pc i bodyOffset sa offsetami w tym widoku. */
  code: DataView;
  codeOffset: number;
}

export type InstanceState = 'idle' | 'running' | 'suspended' | 'halted';

/** Bity flag kontekstu (+0x80/+0x81 w oryginale; int-opcodes.md). */
export const FLAG_EXIT = 0x01;
export const FLAG_WAIT_CALLBACK = 0x10;
export const FLAG_WAIT_CHILD = 0x20;
export const FLAG_RESULT = 0x40;
export const FLAG_CRITICAL = 0x80;
export const FLAG_SPAWNED = 0x100;
/** Flagi, przy ktorych rodzic czeka na potomka (maska kroku 0x16d bez flag zatrzymania). */
const CHILD_WAIT_MASK = FLAG_WAIT_CHILD | FLAG_SPAWNED;

/** Flagi wpisu procedury ustawiane w runtime (int-format.md). */
export const PROC_TIMED = 0x01;
export const PROC_CONDITIONAL = 0x02;

/** Stan runtime wpisu tabeli procedur (flagi +4, czas +8, warunek +0xc). */
export interface ProcRuntime {
  flags: number;
  time: number;
  cond: number;
}

/**
 * Stan wykonania jednego skryptu. Przezywa wywolania run/resume.
 * Model pamieci jak w oryginale (R9 z28b): jeden stos danych; argumenty procedury zostaja na nim,
 * `base14` = indeks pierwszego argumentu biezacej ramki, `base18` = indeks pierwszej zmiennej skryptu
 * (zmienne skryptu leza na dnie stosu, tworzone przez preambule).
 */
export class ScriptInstance {
  readonly stack = new ValueStack();
  /** Stos powrotow (adresy powrotu, poprzednie base14, wartosci odlozone przez 0x800d). */
  readonly retStack: Value[] = [];
  /** Baza ramki (indeks w stosie danych, 0x802b/0x8029). */
  base14 = 0;
  /** Baza zmiennych skryptu (0x802c). */
  base18 = 0;
  pc = 0;
  /** Czy preambula (inicjalizacja zmiennych skryptu) zostala wykonana. */
  initialized = false;
  flags = 0;
  /** Kontekst odtwarzany przez 0x801f (userdata +0x84, callback +0x7c). */
  userdata: Value | undefined;
  callback: Value | undefined;
  parent: ScriptInstance | undefined;
  child: ScriptInstance | undefined;
  /** Eksportowane procedury (0x8017): nazwa -> indeks i argc. */
  readonly exports = new Map<string, { index: number; argc: number }>();
  /** Stan zaplanowanych/warunkowych procedur (0x8006/0x8007/0x8047/0x8048/0x8049). */
  readonly procRuntime: ProcRuntime[];
  /** Koniec oczekiwania 0x8047 (ms wg Hooks.nowMs), undefined gdy nie czeka. */
  waitUntil: number | undefined;
  /** Callbacki wyjscia wywolane (+0x88 w oryginale). */
  exitNotified = false;
  state: InstanceState = 'idle';
  /** Powod zawieszenia przez host (np. 'dialog'): resume() i Scheduler.flush nie wznawiaja, dopoki host go nie wyczysci. */
  suspendReason: string | undefined;
  entryDepth = 0;

  constructor(
    readonly script: IntScriptLike,
    /** Id obiektu, do ktorego skrypt jest przypiety (self_obj); interpretacja po stronie Hooks. */
    readonly selfId = 0,
  ) {
    this.procRuntime = script.procs.map(() => ({ flags: 0, time: 0, cond: 0 }));
  }

  /** Sekcja krytyczna (flaga 0x80; 0x8002 ustawia, 0x8003 zeruje). */
  get critical(): boolean {
    return (this.flags & FLAG_CRITICAL) !== 0;
  }

  set critical(on: boolean) {
    this.flags = on ? this.flags | FLAG_CRITICAL : this.flags & ~FLAG_CRITICAL;
  }

  /** Procedura zawierajaca biezacy pc (najwiekszy bodyOffset <= pc). */
  get currentProc(): string {
    let best = '';
    let at = -1;
    for (const p of this.script.procs) {
      if (p.bodyOffset > 0 && p.bodyOffset <= this.pc && p.bodyOffset > at) {
        at = p.bodyOffset;
        best = p.name;
      }
    }
    return best;
  }
}

/** Mosty do swiata gry. Zmienne gry to liczby calkowite. Opkody gry (Zadanie 29) dochodza przez opcodeHandlers. */
export interface Hooks {
  getLocalVar(instance: ScriptInstance, index: number): number;
  setLocalVar(instance: ScriptInstance, index: number, value: number): void;
  getMapVar(instance: ScriptInstance, index: number): number;
  setMapVar(instance: ScriptInstance, index: number, value: number): void;
  getGlobalVar(index: number): number;
  setGlobalVar(index: number, value: number): void;
  /** Zmienne eksportowane miedzy skryptami (0x8016/0x8031/0x8032). */
  exportVar?(name: string): void;
  getExternal?(name: string): Value | undefined;
  setExternal?(name: string, value: Value): void;
  /** Zegar w ms (0x8006/0x8047); domyslnie Date.now. */
  nowMs?(): number;
  /** Ladowanie i uruchomienie innego skryptu (0x8008 call_start, 0x8009 exec, 0x800a spawn, 0x800b fork). Zwraca instancje potomka. */
  execScript?(req: {
    mode: 'call_start' | 'exec' | 'spawn' | 'fork';
    name: string;
    parent: ScriptInstance;
  }): ScriptInstance | undefined;
  /** Callbacki wyjscia skryptu (0x800e), raz na instancje. */
  onExit?(instance: ScriptInstance): void;
  /** Rejestr eksportu procedur (0x8017), poza lokalnym instance.exports. */
  exportProcedure?(instance: ScriptInstance, name: string, index: number, argc: number): void;
  /** Dodatkowe handlery opkodow (gry/sfall); rdzen ma pierwszenstwo. */
  opcodeHandlers?: ReadonlyMap<number, OpHandler>;
}

export type OpHandler = (ctx: ExecContext) => void;

export interface ExecContext {
  readonly interp: Interpreter;
  readonly instance: ScriptInstance;
  readonly hooks: Hooks;
  readonly stack: ValueStack;
  /** Opkod (po normalizacji aliasow) i jego offset. */
  readonly op: number;
  readonly pc: number;
  /** Argument inline (push_const), 0 gdy brak. */
  readonly arg: number;
  /** Rozwiazuje string statyczny po wartosci z push_const 0x9001. */
  resolveString(offset: number): string;
  /** Rozwiazuje nazwe identyfikatora (zmienna zewnetrzna) po offsecie z 0x9001/0xc001. */
  resolveIdent(offset: number): string;
  jump(addr: number): void;
  /** Przerywa petle; run zwroci undefined, resume kontynuuje od nastepnej instrukcji. */
  suspend(): void;
  /** Konczy skrypt na stale (halt_exit). */
  halt(): void;
  /** Skok do ciala procedury; argumenty i argc (na szczycie) musza juz lezec na stosie danych, adres powrotu na stosie powrotow. */
  callProc(index: number): void;
  returnFromProc(): void;
  /** Biezacy zegar w ms. */
  nowMs(): number;
  fail(msg: string): never;
}

interface ScriptTables {
  ids: Map<number, string>;
  strs: Map<number, string>;
  procNameOffs: Set<number>;
}

const tableIndexCache = new WeakMap<object, ScriptTables>();

function readTableEntries(v: DataView, start: number, end: number): Map<number, string> {
  const out = new Map<number, string>();
  for (let p = start; p + 2 <= end && p + 2 <= v.byteLength;) {
    const len = v.getUint16(p);
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = v.getUint8(p + 2 + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    out.set(p - start + 6, s);
    p += 2 + len;
  }
  return out;
}

/** Offset w push_const 0x9001 = offset wpisu wzgledem pola rozmiaru tablicy + 6 (zweryfikowane na danych). */
function tableIndex(script: IntScriptLike): ScriptTables {
  const cached = tableIndexCache.get(script);
  if (cached) return cached;
  const v = script.code;
  const procNameOffs = new Set<number>();
  for (let i = 0; i < script.procs.length; i++) procNameOffs.add(v.getUint32(0x2e + 24 * i));
  const idOff = 0x2e + 24 * script.procs.length;
  const idEnd = idOff + 4 + v.getUint32(idOff);
  const ids = readTableEntries(v, idOff + 4, idEnd);
  const strAt = idEnd + 4;
  const strs =
    strAt + 4 <= v.byteLength && v.getUint32(strAt) !== 0xffffffff
      ? readTableEntries(v, strAt + 4, strAt + 4 + v.getUint32(strAt))
      : new Map<number, string>();
  const res: ScriptTables = { ids, strs, procNameOffs };
  tableIndexCache.set(script, res);
  return res;
}

const HALT_ADDR = -1;

export class Interpreter {
  private readonly maxSteps: number;
  private readonly opts: ExecOptions;

  constructor(
    readonly hooks: Hooks,
    opts: ExecOptions = {},
  ) {
    this.opts = opts;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  }

  /**
   * Wykonuje preambule skryptu (pc=0): tworzy zmienne skryptu na dnie stosu i konczy sie halt_exit (0x8010).
   * Wywolywane automatycznie przez run() przy pierwszym uzyciu instancji.
   */
  initialize(instance: ScriptInstance): void {
    if (instance.initialized) return;
    if (instance.state !== 'idle') {
      throw new VmError(
        `instancja w stanie ${instance.state}, nie mozna inicjalizowac`,
        instance.script.name,
        '',
        instance.pc,
      );
    }
    instance.entryDepth = instance.stack.depth();
    instance.state = 'running';
    instance.pc = 0;
    this.loop(instance);
    if ((instance.state as InstanceState) !== 'halted') {
      const err = new VmError(
        'preambula nie zakonczyla sie opkodem halt_exit (0x8010)',
        instance.script.name,
        '',
        instance.pc,
      );
      throw this.abort(instance, err, instance.pc, undefined);
    }
    instance.state = 'idle';
    instance.initialized = true;
    instance.retStack.length = 0;
  }

  /** Synchronicznie wykonuje procedure; zwraca wartosc zwrocona lub undefined (brak wyniku albo zawieszenie). */
  run(instance: ScriptInstance, procName: string, args: Value[] = []): Value | undefined {
    if (instance.state !== 'idle') {
      throw new VmError(
        `instancja w stanie ${instance.state}, nie mozna uruchomic ${procName}`,
        instance.script.name,
        procName,
        instance.pc,
      );
    }
    const proc = instance.script.procs.find((p) => p.name === procName);
    if (!proc) throw new VmError(`brak procedury ${procName}`, instance.script.name, procName, 0);
    this.initialize(instance);
    instance.entryDepth = instance.stack.depth();
    instance.state = 'running';
    try {
      instance.retStack.push(int(HALT_ADDR));
      for (const a of args) instance.stack.push(a);
      instance.stack.push(int(args.length));
      this.makeContext(instance, 0, 0, 0).callProc(proc.index);
    } catch (e) {
      throw this.abort(instance, e, 0, undefined);
    }
    return this.loop(instance);
  }

  resume(instance: ScriptInstance): Value | undefined {
    if (instance.state !== 'suspended') {
      throw new VmError(
        `resume na instancji w stanie ${instance.state}`,
        instance.script.name,
        instance.currentProc,
        instance.pc,
      );
    }
    if (instance.waitUntil !== undefined) {
      if (this.now() < instance.waitUntil) return undefined;
      instance.waitUntil = undefined;
      instance.flags &= ~FLAG_WAIT_CALLBACK;
    }
    if (instance.flags & CHILD_WAIT_MASK) return undefined;
    if (instance.suspendReason !== undefined) return undefined;
    instance.state = 'running';
    return this.loop(instance);
  }

  now(): number {
    return this.hooks.nowMs ? this.hooks.nowMs() : Date.now();
  }

  /** Dla Zadania 29: rejestruje wywolanie hooka w trace. */
  traceHook(name: string, args: Value[], result?: Value): void {
    const sink = this.opts.trace;
    if (!sink?.hook) return;
    sink.hook(result === undefined ? { name, args } : { name, args, result });
  }

  private abort(instance: ScriptInstance, e: unknown, pc: number, op: number | undefined): VmError {
    const err =
      e instanceof VmError
        ? e
        : new VmError(
            e instanceof Error ? e.message : String(e),
            instance.script.name,
            instance.currentProc,
            pc,
            op,
          );
    instance.state = 'idle';
    instance.retStack.length = 0;
    instance.stack.truncate(instance.entryDepth);
    instance.base14 = Math.min(instance.base14, instance.entryDepth);
    return err;
  }

  private finish(instance: ScriptInstance): Value | undefined {
    instance.state = 'idle';
    return instance.stack.depth() > instance.entryDepth ? instance.stack.pop() : undefined;
  }

  private loop(instance: ScriptInstance): Value | undefined {
    const { script } = instance;
    const code = script.code;
    const sink = this.opts.trace;
    let steps = 0;
    while (instance.state === 'running') {
      const pc = instance.pc;
      let op = 0;
      try {
        if (++steps > this.maxSteps) {
          throw new VmError(
            `przekroczono maxSteps=${this.maxSteps}`,
            script.name,
            instance.currentProc,
            pc,
          );
        }
        if (pc < 0 || pc + 2 > code.byteLength) throw new Error('pc poza kodem');
        op = code.getUint16(pc, false);
        if ((op & 0x8000) === 0) throw new Error('opkod bez bitu 0x8000');
        if (op === 0x804a) op = 0x8002;
        else if (op === 0x804b) op = 0x8003;
        let next = pc + 2;
        let arg = 0;
        if (hasInlineArg(op)) {
          if (next + 4 > code.byteLength) throw new Error('ucięty argument inline');
          arg = code.getUint32(next, false);
          next += 4;
        }
        const handler = coreHandlers.get(op) ?? this.hooks.opcodeHandlers?.get(op);
        if (sink?.step) {
          const name = OPCODES.get(op)?.name;
          sink.step(
            name === undefined
              ? {
                  script: script.name,
                  proc: instance.currentProc,
                  pc,
                  op,
                  stackDepth: instance.stack.depth(),
                }
              : {
                  script: script.name,
                  proc: instance.currentProc,
                  pc,
                  op,
                  name,
                  stackDepth: instance.stack.depth(),
                },
          );
        }
        if (!handler) throw new Error(`nieobslugiwany opkod 0x${op.toString(16)}`);
        instance.pc = next;
        handler(this.makeContext(instance, op, pc, arg));
      } catch (e) {
        throw this.abort(instance, e, pc, op || undefined);
      }
      if (instance.pc === HALT_ADDR && instance.state === 'running') return this.finish(instance);
    }
    return undefined;
  }

  private makeContext(instance: ScriptInstance, op: number, pc: number, arg: number): ExecContext {
    const trace = this.opts.trace;
    const nowMs = (): number => this.now();
    const script = instance.script;
    const fail = (msg: string): never => {
      throw new VmError(msg, script.name, instance.currentProc, pc, op || undefined);
    };
    return {
      interp: this,
      instance,
      hooks: this.hooks,
      stack: instance.stack,
      op,
      pc,
      arg,
      resolveString(offset) {
        const t = tableIndex(script);
        const s = t.strs.get(offset) ?? t.ids.get(offset);
        if (s === undefined) fail(`brak stringu statycznego pod offsetem ${offset}`);
        return s as string;
      },
      resolveIdent(offset) {
        const t = tableIndex(script);
        const id = t.ids.get(offset);
        // Nazwy procedur nie sa zmiennymi zewnetrznymi; zachowuje zgodnosc z fixture buildInt (gdzie off=6 to 1. procedura i 1. string).
        const s = id !== undefined && !t.procNameOffs.has(offset) ? id : (t.strs.get(offset) ?? id);
        if (s === undefined) return fail(`brak identyfikatora pod offsetem ${offset}`);
        return s;
      },
      jump(addr) {
        instance.pc = addr;
      },
      suspend() {
        instance.state = 'suspended';
      },
      halt() {
        instance.state = 'halted';
      },
      callProc(index) {
        const proc = script.procs[index];
        if (!proc) fail(`wywolanie nieistniejacej procedury #${index}`);
        if (proc!.bodyOffset === 0 || proc!.bodyOffset >= script.code.byteLength) {
          fail(`procedura ${proc!.name} bez ciala`);
        }
        const st = instance.stack;
        const argc = st.depth() > 0 ? toInt(st.peek()) : -1;
        if (argc < 0 || argc > st.depth() - 1) fail(`zla liczba argumentow ${argc}`);
        instance.pc = proc!.bodyOffset;
        if (trace?.call) {
          const all = st.toArray();
          trace.call({
            script: script.name,
            proc: proc!.name,
            args: all.slice(all.length - 1 - argc, all.length - 1),
          });
        }
      },
      returnFromProc() {
        const ra = instance.retStack.pop();
        if (ra === undefined) fail('pusty stos powrotow');
        const addr =
          (ra as Value).t === 'int' ? (ra as { v: number }).v : fail('adres powrotu nie jest int');
        instance.pc = addr;
      },
      nowMs,
      fail,
    };
  }
}
