import { writeFileSync } from 'node:fs';
import { parseInt as parseIntScript, type IntScript } from '@f2/formats';
import { Rng } from '@f2/engine-core';
import { openGameFolderNode } from '@f2/vfs/node';
import {
  Interpreter,
  Scheduler,
  contextOpHandlers,
  createGameHandlers,
  dialogHandlers,
  GAME_CONTEXT_OPCODES,
  type DialogSession,
  type DialogState,
  type GameHooks,
  type OpHandler,
  type StepEvent,
  type SystemProcName,
  type TraceSink,
  type Value,
} from '@f2/vm';

/** Rekord sladu wykonania skryptu. Teksty MSG nie wchodza do sladu (tylko id); stringi skryptu - jak sa. */
export interface TraceRecord {
  kind: 'step' | 'call' | 'hook';
  script: string;
  proc: string;
  pc?: number;
  op?: number;
  name?: string;
  args?: (number | string)[];
  result?: number | string;
}

export interface TraceDiff {
  equal: boolean;
  firstDiffIndex: number;
  diff?: { actual: TraceRecord; expected: TraceRecord };
}

function prim(v: Value): number | string {
  return v.t === 'null' ? 0 : v.v;
}

/** Zbiera slad z TraceSink interpretera; kroki (`step`) zapisuje tylko gdy `includeSteps`. */
export class TraceRecorder implements TraceSink {
  readonly records: TraceRecord[] = [];
  private script = '';
  private proc = '';

  constructor(private readonly includeSteps = false) {}

  step(e: StepEvent): void {
    this.script = e.script;
    this.proc = e.proc;
    if (!this.includeSteps) return;
    const r: TraceRecord = {
      kind: 'step',
      script: e.script,
      proc: e.proc,
      pc: e.pc,
      op: e.op,
    };
    if (e.name !== undefined) r.name = e.name;
    this.records.push(r);
  }

  call(e: { script: string; proc: string; args: Value[] }): void {
    this.script = e.script;
    this.proc = e.proc;
    this.records.push({
      kind: 'call',
      script: e.script,
      proc: e.proc,
      args: e.args.map(prim),
    });
  }

  hook(e: { name: string; args: Value[]; result?: Value }): void {
    this.hookRaw(e.name, e.args.map(prim), e.result === undefined ? undefined : prim(e.result));
  }

  hookRaw(name: string, args: (number | string)[], result?: number | string): void {
    const r: TraceRecord = { kind: 'hook', script: this.script, proc: this.proc, name, args };
    if (result !== undefined) r.result = result;
    this.records.push(r);
  }
}

/** Interpreter z podpietym rejestratorem sladu (sink trzeba podac przy tworzeniu, stad fabryka). */
export function createTracingInterpreter(hooks: GameHooks, recorder: TraceRecorder): Interpreter {
  return new Interpreter(hooks, { trace: recorder });
}

/**
 * Wykonuje `run` i zwraca zebrany slad. Odchylenie od briefu: Interpreter przyjmuje sink tylko w
 * konstruktorze, wiec zamiast `interp` funkcja dostaje rejestrator utworzony przez
 * `createTracingInterpreter`; blad VM z `run` jest propagowany, a zebrany dotad slad nie ginie
 * (dostepny w `recorder.records`).
 */
export function recordTrace(run: () => void, recorder: TraceRecorder): TraceRecord[] {
  const start = recorder.records.length;
  run();
  return recorder.records.slice(start);
}

function same(a: TraceRecord, b: TraceRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function compareTraces(actual: TraceRecord[], expected: TraceRecord[]): TraceDiff {
  const n = Math.min(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (!same(actual[i]!, expected[i]!)) {
      return {
        equal: false,
        firstDiffIndex: i,
        diff: { actual: actual[i]!, expected: expected[i]! },
      };
    }
  }
  if (actual.length !== expected.length) {
    const i = n;
    const missing: TraceRecord = { kind: 'hook', script: '', proc: '', name: '<brak rekordu>' };
    return {
      equal: false,
      firstDiffIndex: i,
      diff: { actual: actual[i] ?? missing, expected: expected[i] ?? missing },
    };
  }
  return { equal: true, firstDiffIndex: -1 };
}

// ---------------------------------------------------------------------------------------------

export interface TraceOptions {
  script: IntScript;
  /** Procedury uruchamiane po kolei na tej samej instancji (np. ['start','map_enter_p_proc']). */
  procs: string[];
  seed?: number;
  /** Kolejne wybory opcji dialogu (indeksy w DialogState.options) po zawieszeniu na gsay_end. */
  choices?: number[];
  includeSteps?: boolean;
  /** IQ gracza dla progow opcji (domyslnie 5). */
  playerIq?: number;
  /** Etykieta mapy: w trybie mock tylko opis (swiat nie jest ladowany). */
  map?: string;
}

export interface TraceResult {
  records: TraceRecord[];
  /** Bledy VM (komunikaty), puste = czysty przebieg. */
  errors: string[];
  /** Nazwy opkodow obsluzonych przez zastepnik `unsupported`. */
  unsupported: string[];
  /** Widoczne opcje dialogu, na ktore skrypt czeka po przebiegu (indeksy do `choose`); [] = brak/koniec. */
  pendingOptions: number[];
  /** Wybory z `choices` faktycznie wykonane. */
  chosen: number[];
}

const SID = 1;
const DUDE = 1;
const NPC = 2;

const OPTIONAL_HOOKS = new Set([
  'exportVar',
  'getExternal',
  'setExternal',
  'execScript',
  'onExit',
  'exportProcedure',
]);

/** Mock hookow gry: stan w pamieci, losowosc seedowana; kazde wywolanie hooka trafia do sladu. */
function createMockHooks(
  rec: TraceRecorder,
  rng: Rng,
  iq: number,
  unsupported: string[],
  onDialog: { session?: DialogSession },
  handlers: ReadonlyMap<number, OpHandler>,
): GameHooks {
  const locals = new Map<string, number>();
  const maps = new Map<number, number>();
  const globals = new Map<number, number>();
  let ms = 0;
  const base: Record<string, unknown> = {
    getLocalVar: (_i: unknown, index: number) => locals.get(`l${index}`) ?? 0,
    setLocalVar: (_i: unknown, index: number, v: number) => void locals.set(`l${index}`, v),
    getMapVar: (_i: unknown, index: number) => maps.get(index) ?? 0,
    setMapVar: (_i: unknown, index: number, v: number) => void maps.set(index, v),
    getGlobalVar: (index: number) => globals.get(index) ?? 0,
    setGlobalVar: (index: number, v: number) => void globals.set(index, v),
    nowMs: () => (ms += 100),
    opcodeHandlers: handlers,
    dudeObj: () => DUDE,
    messageStr: (list: number, id: number) => `<msg ${list}:${id}>`,
    objName: (id: number) => `<obj ${id}>`,
    random: (min: number, max: number) => rng.int(min, max),
    metarule: (): Value => ({ t: 'int', v: 0 }),
    metarule3: (): Value => ({ t: 'int', v: 0 }),
    unsupported: (name: string): Value => {
      unsupported.push(name);
      return { t: 'int', v: 0 };
    },
  };
  const dialog = {
    start: (_s: DialogState, session: DialogSession) => {
      onDialog.session = session;
      rec.hookRaw('dialog.start', [_s.npcObjId, _s.headFid, _s.background]);
    },
    update: (s: DialogState) =>
      rec.hookRaw('dialog.update', [
        s.npcText,
        ...s.options.map(
          (o) => `${o.index}|${o.text}|${o.targetProc ?? ''}|${o.visible ? 1 : 0}|${o.reaction}`,
        ),
      ]),
    waitForChoice: () => rec.hookRaw('dialog.wait', []),
    end: () => rec.hookRaw('dialog.end', []),
    playerIq: () => iq,
    hasEmpathy: () => false,
  };
  // Pomijamy w sladzie hooki czysto "ksiegowe" (zmienne i zegar sa widoczne przez wlasne opkody).
  const noTrace = new Set(['nowMs', 'unsupported']);
  return new Proxy(base, {
    get(t, k) {
      if (k === 'dialog') return dialog;
      if (typeof k !== 'string') return undefined;
      const v = t[k];
      // wartosci niefunkcyjne (opcodeHandlers) oraz opcjonalne hooki interpretera bez implementacji
      if (typeof v !== 'function' && v !== undefined) return v;
      if (OPTIONAL_HOOKS.has(k)) return v;
      const f = (v ?? (() => 0)) as (...a: unknown[]) => unknown;
      return (...args: unknown[]) => {
        const r = f(...args);
        if (!noTrace.has(k)) {
          const pargs = args
            .filter((a) => typeof a === 'number' || typeof a === 'string')
            .map((a) => a as number | string);
          const res = typeof r === 'number' || typeof r === 'string' ? r : undefined;
          rec.hookRaw(k, pargs, res);
        }
        return r;
      };
    },
  }) as unknown as GameHooks;
}

/** Przebieg jednego skryptu na mocku hookow (tryb `--hooks=mock`). */
export function traceScript(opts: TraceOptions): TraceResult {
  const rec = new TraceRecorder(opts.includeSteps ?? false);
  const rng = new Rng(opts.seed ?? 42);
  const unsupported: string[] = [];
  const dlg: { session?: DialogSession } = {};
  const handlers = new Map<number, OpHandler>();
  const hooks = createMockHooks(rec, rng, opts.playerIq ?? 5, unsupported, dlg, handlers);
  const interp = createTracingInterpreter(hooks, rec);
  const sched = new Scheduler(interp, hooks as never);
  for (const [k, v] of createGameHandlers(sched)) handlers.set(k, v);
  for (const [k, v] of contextOpHandlers(sched, GAME_CONTEXT_OPCODES)) handlers.set(k, v);
  for (const [k, v] of dialogHandlers) handlers.set(k, v);
  sched.create({ sid: SID, script: opts.script, ownerObjectId: NPC });

  const errors: string[] = [];
  const chosen: number[] = [];
  const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  for (const proc of opts.procs) {
    const before = sched.errors.length;
    sched.runProc(SID, proc as SystemProcName, { source: DUDE, target: NPC });
    for (const e of sched.errors.slice(before)) errors.push(msg(e.error));
    if (dlg.session?.isWaiting) break;
  }
  for (const idx of opts.choices ?? []) {
    const s = dlg.session;
    if (!s?.isWaiting) break;
    try {
      s.choose(idx);
      chosen.push(idx);
    } catch (e) {
      errors.push(msg(e));
      break;
    }
  }
  const s = dlg.session;
  const pending =
    s?.isWaiting === true ? s.state.options.filter((o) => o.visible).map((o) => o.index) : [];
  for (const e of sched.errors) {
    const m = msg(e.error);
    if (!errors.includes(m)) errors.push(m);
  }
  return { records: rec.records, errors, unsupported, pendingOptions: pending, chosen };
}

export interface DialogExploration {
  nodes: number;
  maxDepth: number;
  errors: string[];
  unsupported: string[];
  /** Sciezki wyborow (kazda = jeden odwiedzony wezel). */
  paths: number[][];
  truncated: boolean;
}

/** DFS po wszystkich opcjach dialogu (kazdy wezel = swiezy przebieg z lista wyborow). */
export function exploreDialog(
  base: Omit<TraceOptions, 'choices'>,
  maxDepth = 6,
  maxNodes = 200,
): DialogExploration {
  const out: DialogExploration = {
    nodes: 0,
    maxDepth: 0,
    errors: [],
    unsupported: [],
    paths: [],
    truncated: false,
  };
  const uns = new Set<string>();
  const visit = (path: number[]): void => {
    if (out.nodes >= maxNodes) {
      out.truncated = true;
      return;
    }
    out.nodes++;
    out.paths.push(path);
    out.maxDepth = Math.max(out.maxDepth, path.length);
    const r = traceScript({ ...base, choices: path });
    for (const e of r.errors) out.errors.push(`[${path.join(',')}] ${e}`);
    for (const u of r.unsupported) uns.add(u);
    if (r.chosen.length !== path.length) return; // wybor sie nie powiodl
    if (path.length >= maxDepth) {
      if (r.pendingOptions.length > 0) out.truncated = true;
      return;
    }
    for (const o of r.pendingOptions) visit([...path, o]);
  };
  visit([]);
  out.unsupported = [...uns];
  return out;
}

// ---------------------------------------------------------------------------------------------
// CLI: pnpm tools vm-trace <script.int> <proc[,proc2]> [--map X] [--seed 42] [--choices 1,0,2]
//                          [--out plik.json] [--hooks=mock|world] [--steps]

export async function loadScript(
  name: string,
  gameDir: string,
  patchDir?: string,
): Promise<IntScript> {
  const vfs = await openGameFolderNode(gameDir, patchDir);
  try {
    const file = name.toLowerCase().endsWith('.int') ? name : `${name}.int`;
    const u = await vfs.open(`scripts/${file}`);
    return parseIntScript(
      u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer,
      file,
    );
  } finally {
    await vfs.close?.();
  }
}

export function parseArgs(argv: string[]): {
  positional: string[];
  flags: Map<string, string>;
} {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else if (a === '--steps') flags.set('steps', '1');
      else flags.set(a.slice(2), argv[++i] ?? '');
    } else positional.push(a);
  }
  return { positional, flags };
}

export async function runVmTrace(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const [scriptName, procArg] = positional;
  if (!scriptName || !procArg) {
    process.stderr.write(
      'uzycie: tools vm-trace <script.int> <proc[,proc2]> [--map X] [--seed 42] [--choices 1,0] ' +
        '[--out plik.json] [--hooks=mock|world] [--steps]\n',
    );
    process.exit(2);
  }
  const hooksMode = flags.get('hooks') ?? 'mock';
  if (hooksMode !== 'mock') {
    process.stderr.write(
      `tryb hookow '${hooksMode}' niedostepny: swiat (ScriptRuntime) w CLI nie jest jeszcze podpiety, uzyj --hooks=mock\n`,
    );
    process.exit(2);
  }
  const gameDir = process.env.F2_GAME_DIR;
  if (!gameDir) {
    process.stderr.write('brak F2_GAME_DIR\n');
    process.exit(2);
  }
  const script = await loadScript(scriptName, gameDir, process.env.F2_PATCH_DIR);
  const choices = (flags.get('choices') ?? '')
    .split(',')
    .filter((s) => s !== '')
    .map(Number);
  const opts: TraceOptions = {
    script,
    procs: procArg.split(','),
    seed: Number(flags.get('seed') ?? 42),
    choices,
    includeSteps: flags.has('steps'),
  };
  const map = flags.get('map');
  if (map !== undefined) opts.map = map;
  const r = traceScript(opts);
  const json = JSON.stringify(r.records, null, 1);
  const out = flags.get('out');
  if (out) writeFileSync(out, `${json}\n`);
  else process.stdout.write(`${json}\n`);
  process.stderr.write(
    `rekordow: ${r.records.length}, bledy VM: ${r.errors.length}, unsupported: ${[...new Set(r.unsupported)].join(', ') || '-'}, ` +
      `oczekujace opcje: [${r.pendingOptions.join(',')}]\n`,
  );
  for (const e of r.errors) process.stderr.write(`  blad: ${e}\n`);
  if (r.errors.length > 0) process.exitCode = 1;
}
