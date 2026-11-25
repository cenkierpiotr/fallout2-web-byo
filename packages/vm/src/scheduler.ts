import {
  FLAG_EXIT,
  FLAG_SPAWNED,
  FLAG_WAIT_CHILD,
  type ExecContext,
  type Hooks,
  type Interpreter,
  type OpHandler,
  type ScriptInstance,
} from './interpreter.js';
import { createEntry, type NewEntry, type ScriptEntry } from './script-instance.js';
import { int, obj, type Value } from './stack.js';

/** Nazwy procedur systemowych (int-format.md; lustro SYSTEM_PROCS z @f2/formats, vm go nie importuje). */
export type SystemProcName =
  | 'start'
  | 'spatial_p_proc'
  | 'description_p_proc'
  | 'pickup_p_proc'
  | 'drop_p_proc'
  | 'use_p_proc'
  | 'use_obj_on_p_proc'
  | 'use_skill_on_p_proc'
  | 'talk_p_proc'
  | 'critter_p_proc'
  | 'combat_p_proc'
  | 'damage_p_proc'
  | 'map_enter_p_proc'
  | 'map_exit_p_proc'
  | 'create_p_proc'
  | 'destroy_p_proc'
  | 'look_at_p_proc'
  | 'timed_event_p_proc'
  | 'map_update_p_proc'
  | 'push_p_proc'
  | 'is_dropping_p_proc'
  | 'combat_is_starting_p_proc'
  | 'combat_is_over_p_proc';

/** Ticki na sekunde gry (spec time: 10). */
export const TICKS_PER_SECOND = 10;
/**
 * Okres critter_p_proc w tickach. UWAGA: wartosc NIEPOTWIERDZONA w specyfikacji ani specyfikacja formatu
 * (brak wpisu w dokumentacja techniczna); zalozenie: raz na sekunde gry. Konfigurowalne w SchedulerOptions.
 */
export const DEFAULT_CRITTER_INTERVAL = TICKS_PER_SECOND;
const CRITTER_TYPE = 1;

export interface ProcCtx {
  source?: number;
  target?: number;
  fixedParam?: number;
  actionBeingUsed?: number;
}

export interface SchedulerOptions {
  critterInterval?: number;
  /** Wywolywane przy bledzie VM w skrypcie; domyslnie zbiera w Scheduler.errors. */
  onError?: (err: unknown, sid: number, proc: string) => void;
}

interface TimerRec {
  sid: number;
  at: number;
  fixedParam: number;
  seq: number;
}

export class TimerQueue {
  private items: TimerRec[] = [];
  private seq = 0;

  add(sid: number, atTick: number, fixedParam: number): void {
    this.items.push({ sid, at: atTick, fixedParam, seq: this.seq++ });
  }

  /** Kopie timerow (czas bezwzgledny) spelniajacych filtr sid, w kolejnosci wykonania; nie usuwa. */
  snapshot(
    pred: (sid: number) => boolean = () => true,
  ): { sid: number; atTick: number; fixedParam: number }[] {
    return this.items
      .filter((t) => pred(t.sid))
      .sort((a, b) => a.at - b.at || a.seq - b.seq)
      .map((t) => ({ sid: t.sid, atTick: t.at, fixedParam: t.fixedParam }));
  }

  /** Jak snapshot, ale usuwa zwrocone timery (zdejmowanie timerow opuszczanej mapy). */
  extract(pred: (sid: number) => boolean): { sid: number; atTick: number; fixedParam: number }[] {
    const out = this.snapshot(pred);
    this.items = this.items.filter((t) => !pred(t.sid));
    return out;
  }

  /** Dodaje timery z zapisu (czas bezwzgledny, kolejnosc listy = kolejnosc FIFO). */
  restore(list: readonly { sid: number; atTick: number; fixedParam: number }[]): void {
    for (const t of list) this.add(t.sid, t.atTick, t.fixedParam);
  }

  /** Usuwa wszystkie timery danego skryptu. */
  remove(sid: number): void {
    this.items = this.items.filter((t) => t.sid !== sid);
  }

  /** Zwraca i usuwa timery o at <= now, w kolejnosci czasu, potem dodania. */
  due(now: number): { sid: number; fixedParam: number }[] {
    const ready = this.items
      .filter((t) => t.at <= now)
      .sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (ready.length) this.items = this.items.filter((t) => t.at > now);
    return ready.map(({ sid, fixedParam }) => ({ sid, fixedParam }));
  }

  get size(): number {
    return this.items.length;
  }
}

export class Scheduler {
  readonly timers = new TimerQueue();
  readonly errors: { sid: number; proc: string; error: unknown }[] = [];
  /** Biezacy czas w tickach (suma tick()). */
  now = 0;
  private readonly entries = new Map<number, ScriptEntry>();
  private readonly byInstance = new WeakMap<ScriptInstance, ScriptEntry>();
  private readonly critterInterval: number;
  private critterAcc = 0;
  private readonly onError: (err: unknown, sid: number, proc: string) => void;

  constructor(
    readonly interp: Interpreter,
    readonly hooks: Hooks & { objType?(id: number): number },
    opts: SchedulerOptions = {},
  ) {
    this.critterInterval = opts.critterInterval ?? DEFAULT_CRITTER_INTERVAL;
    this.onError =
      opts.onError ?? ((error, sid, proc) => void this.errors.push({ sid, proc, error }));
  }

  /** Tworzy wpis z opisu i rejestruje go. */
  create(o: NewEntry): ScriptEntry {
    const e = createEntry(o);
    this.register(e);
    return e;
  }

  register(entry: ScriptEntry): void {
    this.entries.set(entry.sid, entry);
    this.byInstance.set(entry.instance, entry);
  }

  /** Rejestruje potomka utworzonego przez Hooks.execScript; jego `start` ruszy w najblizszym tick/flush. */
  adopt(o: NewEntry): ScriptEntry {
    const e = this.create(o);
    e.pendingStart = true;
    return e;
  }

  unregister(sid: number): void {
    this.entries.delete(sid);
    this.timers.remove(sid);
  }

  get(sid: number): ScriptEntry | undefined {
    return this.entries.get(sid);
  }

  entryOf(instance: ScriptInstance): ScriptEntry | undefined {
    return this.byInstance.get(instance);
  }

  all(): ScriptEntry[] {
    return [...this.entries.values()];
  }

  addTimerEvent(sid: number, delayTicks: number, fixedParam: number): void {
    this.timers.add(sid, this.now + delayTicks, fixedParam);
  }

  rmTimerEvent(sid: number): void {
    this.timers.remove(sid);
  }

  /** Synchronizuje zegar planisty z zegarem gry (skok czasu: odpoczynek, podroz); nie odpala timerow. */
  setNow(ticks: number): void {
    this.now = ticks;
  }

  /** Brak skryptu/procedury = no-op (undefined). Blad VM jest logowany, nie propagowany. */
  runProc(sid: number, proc: SystemProcName, ctx: ProcCtx = {}): Value | undefined {
    const e = this.entries.get(sid);
    if (!e) return undefined;
    return this.runEntry(e, proc, ctx);
  }

  runStartAll(): void {
    const entries = this.all();
    for (const e of entries) this.initEntry(e);
    for (const e of entries) if (e.instance.initialized) this.startEntry(e);
  }

  runMapEnterAll(): void {
    for (const e of this.all()) this.runEntry(e, 'map_enter_p_proc', {});
    this.flush();
  }

  runMapUpdateAll(): void {
    for (const e of this.all()) this.runEntry(e, 'map_update_p_proc', {});
    this.flush();
  }

  /** Skok zegara (odpoczynek, podroz): ustawia czas i odpala przeterminowane timery, bez petli critter_p_proc. */
  jumpTo(ticks: number): void {
    this.now = ticks;
    this.flush();
    for (const t of this.timers.due(this.now)) {
      const e = this.entries.get(t.sid);
      if (e) this.runEntry(e, 'timed_event_p_proc', { fixedParam: t.fixedParam });
    }
    this.flush();
  }

  /** Posuwa czas: timery (timed_event_p_proc), critter_p_proc co okres, wznowienia, potomkowie. */
  tick(ticksElapsed: number): void {
    this.now += ticksElapsed;
    this.flush();
    for (const t of this.timers.due(this.now)) {
      const e = this.entries.get(t.sid);
      if (e) this.runEntry(e, 'timed_event_p_proc', { fixedParam: t.fixedParam });
    }
    this.critterAcc += ticksElapsed;
    while (this.critterAcc >= this.critterInterval) {
      this.critterAcc -= this.critterInterval;
      for (const e of this.all()) {
        if (e.ownerObjectId === -1) continue;
        if (this.hooks.objType && this.hooks.objType(e.ownerObjectId) !== CRITTER_TYPE) continue;
        this.runEntry(e, 'critter_p_proc', {});
      }
    }
    this.flush();
  }

  /**
   * Obsluga potomkow i wznowien: uruchamia `start` oczekujacych potomkow, zamyka zakonczonych
   * (czysci flagi 0x20/0x100 rodzica, parent.child) i wznawia rodzicow, ktorzy juz nie czekaja.
   * Flagi rodzica po normalnym zakonczeniu potomka sa po stronie hosta (z28b pkt 5) - tu.
   */
  flush(): void {
    for (let guard = 0; guard < 1000; guard++) {
      let progress = false;
      for (const e of this.all()) {
        if (e.pendingStart) {
          e.pendingStart = false;
          this.startEntry(e);
          progress = true;
        }
        const inst = e.instance;
        if (this.childFinished(inst)) {
          const child = inst.child!;
          inst.child = undefined;
          if (child.parent === inst) child.parent = undefined;
          inst.flags &= ~(FLAG_WAIT_CHILD | FLAG_SPAWNED);
          progress = true;
        }
        if (
          inst.state === 'suspended' &&
          inst.suspendReason === undefined &&
          !(inst.flags & (FLAG_WAIT_CHILD | FLAG_SPAWNED))
        ) {
          const before = inst.state;
          this.safeResume(e);
          if (before !== inst.state || inst.state !== 'suspended') progress = true;
        }
      }
      if (!progress) break;
    }
  }

  private childFinished(inst: ScriptInstance): boolean {
    const c = inst.child;
    if (!c) return false;
    if (c.flags & FLAG_EXIT || c.state === 'halted') return true;
    const ce = this.byInstance.get(c);
    if (!ce) return true; // potomek niezarejestrowany: nie ma kto go uruchomic
    return ce.started && !ce.pendingStart && c.state === 'idle';
  }

  private initEntry(e: ScriptEntry): void {
    if (e.instance.initialized) return;
    try {
      this.interp.initialize(e.instance);
    } catch (err) {
      this.onError(err, e.sid, 'start');
    }
  }

  private startEntry(e: ScriptEntry): void {
    if (e.started) return;
    e.started = true;
    this.runEntry(e, 'start', {});
  }

  private safeResume(e: ScriptEntry): void {
    try {
      this.interp.resume(e.instance);
    } catch (err) {
      this.onError(err, e.sid, e.instance.currentProc);
    }
  }

  private runEntry(e: ScriptEntry, proc: SystemProcName, ctx: ProcCtx): Value | undefined {
    if (!e.script.procs.some((p) => p.name === proc && p.bodyOffset > 0)) return undefined;
    if (e.instance.state !== 'idle' || e.instance.flags & FLAG_EXIT) return undefined;
    const prev = {
      s: e.sourceObj,
      t: e.targetObj,
      f: e.fixedParam,
      a: e.actionBeingUsed,
    };
    if (ctx.source !== undefined) e.sourceObj = ctx.source;
    if (ctx.target !== undefined) e.targetObj = ctx.target;
    if (ctx.fixedParam !== undefined) e.fixedParam = ctx.fixedParam;
    if (ctx.actionBeingUsed !== undefined) e.actionBeingUsed = ctx.actionBeingUsed;
    try {
      return this.interp.run(e.instance, proc);
    } catch (err) {
      this.onError(err, e.sid, proc);
      return undefined;
    } finally {
      // kontekst obowiazuje podczas procedury; zawieszony skrypt zachowuje go do wznowienia
      if ((e.instance.state as string) !== 'suspended') {
        e.sourceObj = prev.s;
        e.targetObj = prev.t;
        e.fixedParam = prev.f;
        e.actionBeingUsed = prev.a;
      }
    }
  }
}

export interface ContextOpcodes {
  selfObj?: number;
  sourceObj?: number;
  targetObj?: number;
  fixedParam?: number;
  actionBeingUsed?: number;
}

/**
 * Handlery opkodow kontekstu (self_obj/source_obj/target_obj/fixed_param/...) czytajace z wpisu Schedulera.
 * Numery opkodow podaje wywolujacy (fixed_param jest nieidentyfikowany w tabeli: Zadanie 30).
 */
export function contextOpHandlers(
  sched: Scheduler,
  ops: ContextOpcodes,
): ReadonlyMap<number, OpHandler> {
  const m = new Map<number, OpHandler>();
  const entry = (c: ExecContext): ScriptEntry => {
    const e = sched.entryOf(c.instance);
    if (!e) c.fail('instancja nie jest zarejestrowana w Schedulerze');
    return e as ScriptEntry;
  };
  if (ops.selfObj !== undefined)
    m.set(ops.selfObj, (c) => {
      const id = entry(c).ownerObjectId;
      c.stack.push(id === -1 ? { t: 'null' } : obj(id));
    });
  if (ops.sourceObj !== undefined)
    m.set(ops.sourceObj, (c) => c.stack.push(obj(entry(c).sourceObj)));
  if (ops.targetObj !== undefined)
    m.set(ops.targetObj, (c) => c.stack.push(obj(entry(c).targetObj)));
  if (ops.fixedParam !== undefined)
    m.set(ops.fixedParam, (c) => c.stack.push(int(entry(c).fixedParam)));
  if (ops.actionBeingUsed !== undefined)
    m.set(ops.actionBeingUsed, (c) => c.stack.push(int(entry(c).actionBeingUsed)));
  return m;
}
