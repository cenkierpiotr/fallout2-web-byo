import type { ExecContext, OpHandler } from '../interpreter.js';
import type { Value } from '../stack.js';
import { int, float, str } from '../stack.js';
import { SfallArrays, type ArrayVal } from './arrays.js';
import { GlobalScriptRunner } from './global-scripts.js';
import { HookScriptRunner } from './hooks.js';
import { SFALL_OPCODES, type SfallOpDef } from './opcode-table.js';
import { SfallGvars } from './sfall-gvars.js';

export interface SfallImpl {
  globals: SfallGvars;
  arrays: SfallArrays;
  globalScripts: GlobalScriptRunner;
  hooks: HookScriptRunner;
}

export function createSfallImpl(): SfallImpl {
  return {
    globals: new SfallGvars(),
    arrays: new SfallArrays(),
    globalScripts: new GlobalScriptRunner(),
    hooks: new HookScriptRunner(),
  };
}

export interface SfallOptions {
  /** Flaga podzbioru sfall; domyslnie false (nic nie jest rejestrowane). */
  enabled?: boolean;
  /** Nadpisanie numerow opkodow (po nazwie). */
  opcodes?: Readonly<Record<string, number>>;
  /** Log opkodow no-op; domyslnie hooks.unsupported gry, jesli jest. */
  log?: (opName: string, args: Value[]) => void;
}

const toArrayVal = (v: Value): ArrayVal => (v.t === 'str' ? v.v : v.t === 'null' ? 0 : v.v);
const fromArrayVal = (v: ArrayVal): Value => (typeof v === 'string' ? str(v) : int(v));
const key = (v: Value): string | number => (v.t === 'str' ? v.v : v.t === 'null' ? 0 : v.v);

function implHandler(def: SfallOpDef, s: SfallImpl): OpHandler {
  const A = s.arrays;
  switch (def.name) {
    case 'set_global_script_repeat':
      return (c) => s.globalScripts.setRepeat(c.instance, c.stack.popInt());
    case 'set_sfall_global':
      return (c) => {
        const v = c.stack.pop();
        const k = c.stack.pop();
        s.globals.set(key(k), v.t === 'null' ? 0 : (v.v as number));
      };
    case 'get_sfall_global_int':
      return (c) => c.stack.push(int(s.globals.getInt(key(c.stack.pop()))));
    case 'get_sfall_global_float':
      return (c) => c.stack.push(float(s.globals.getFloat(key(c.stack.pop()))));
    case 'get_ini_setting':
      return (c) => {
        c.stack.pop();
        c.stack.push(int(-1));
      };
    case 'abs':
      return (c) => {
        const v = c.stack.pop();
        c.stack.push(
          v.t === 'float' ? float(Math.abs(v.v)) : int(Math.abs(v.t === 'int' ? v.v : 0)),
        );
      };
    case 'create_array':
    case 'temp_array':
      return (c) => {
        const flags = c.stack.popInt();
        const size = c.stack.popInt();
        const assoc = size < 0 || (flags & 1) !== 0;
        c.stack.push(
          int(def.name === 'temp_array' ? A.createTemp(size, assoc) : A.create(size, assoc)),
        );
      };
    case 'set_array':
      return (c) => {
        const v = c.stack.pop();
        const k = c.stack.pop();
        A.set(c.stack.popInt(), key(k), toArrayVal(v));
      };
    case 'get_array':
      return (c) => {
        const k = c.stack.pop();
        c.stack.push(fromArrayVal(A.get(c.stack.popInt(), key(k))));
      };
    case 'free_array':
      return (c) => A.free(c.stack.popInt());
    case 'len_array':
      return (c) => c.stack.push(int(A.len(c.stack.popInt())));
    case 'resize_array':
      return (c) => {
        const n = c.stack.popInt();
        A.resize(c.stack.popInt(), n);
      };
    case 'fix_array':
      return (c) => A.fix(c.stack.popInt());
    case 'list_as_array':
    case 'party_member_list':
      return (c) => {
        c.stack.pop();
        c.stack.push(int(A.createTemp(0, false)));
      };
    case 'scan_array':
      return (c) => {
        const v = c.stack.pop();
        c.stack.push(fromArrayVal(A.scan(c.stack.popInt(), toArrayVal(v))));
      };
    case 'sprintf':
      return (c) => {
        const val = c.stack.pop();
        const fmt = c.stack.pop();
        const f = fmt.t === 'str' ? fmt.v : String(fmt.t === 'null' ? '' : fmt.v);
        const sVal = val.t === 'null' ? '0' : String(val.v);
        c.stack.push(str(f.replace(/%[-+0 #]*\d*(?:\.\d+)?[diuoxXfFeEgGcs]/, sVal)));
      };
    case 'array_key':
      return (c) => {
        const idx = c.stack.popInt();
        const id = c.stack.popInt();
        c.stack.push(fromArrayVal(A.keyAt(id, idx)));
      };
    case 'arrayexpr':
      return (c) => {
        const v = c.stack.pop();
        const k = c.stack.pop();
        A.setExpr(key(k), toArrayVal(v));
        c.stack.push(int(0));
      };
    default:
      throw new Error(`sfall: brak implementacji ${def.name}`);
  }
}

function noopHandler(def: SfallOpDef, log: SfallOptions['log']): OpHandler {
  return (c: ExecContext) => {
    const args: Value[] = [];
    for (let i = 0; i < def.pops; i++) args.unshift(c.stack.pop());
    const hooks = c.hooks as { unsupported?: (n: string, a: Value[]) => Value };
    if (log) log(def.name, args);
    else hooks.unsupported?.(`sfall:${def.name}`, args);
    if (def.pushes === 1)
      c.stack.push(
        def.name === 'read_string' || def.name === 'message_str_game' ? str('') : int(0),
      );
  };
}

/**
 * Dokleja handlery sfall do `target` (mapa dla Hooks.opcodeHandlers). Gdy `enabled` nie jest true,
 * nic nie robi i zwraca 0. Zwraca liczbe zarejestrowanych opkodow.
 */
export function registerSfallOpcodes(
  target: Map<number, OpHandler>,
  impl: SfallImpl,
  opts: SfallOptions = {},
): number {
  if (opts.enabled !== true) return 0;
  let n = 0;
  for (const def of SFALL_OPCODES) {
    const op = opts.opcodes?.[def.name] ?? def.op;
    target.set(op, def.plan === 'impl' ? implHandler(def, impl) : noopHandler(def, opts.log));
    n++;
  }
  return n;
}
