export type HookEvent =
  | 'tohit'
  | 'afterhit'
  | 'deathanim'
  | 'combatdamage'
  | 'findtarget'
  | 'itemdamage'
  | 'ammocost'
  | 'useobjon'
  | 'useobj'
  | 'removeinvenobj'
  | 'barterprice'
  | 'combatturn'
  | 'ondeath'
  | 'onexplosion'
  | 'subcombatdmg'
  | 'setlighting'
  | 'sneak'
  | 'stdprocedure'
  | 'targetobject'
  | 'encounter'
  | 'adjustpoison'
  | 'adjustfid'
  | 'hexmoveblocking'
  | 'hexaiblocking'
  | 'hexshootblocking'
  | 'hexsightblocking'
  | 'gamemodechange'
  | 'useskill'
  | 'steal'
  | 'withinperception'
  | 'cartravel'
  | 'setglobalvar'
  | 'restTimer'
  | 'explosivetimer'
  | 'item_pickup'
  | 'canuseweapon';

export interface HookCall {
  args: number[];
  returns: number[];
}

/** Host uruchamia skrypt hooka (.int); czyta call.args, wynik wpisuje przez setReturn. */
export type HookHandler = (call: HookCall) => void;

export interface HookResult {
  handled: boolean;
  returns: number[];
}

export const MAX_HOOK_HANDLERS = 20;

export class HookScriptRunner {
  private handlers = new Map<
    HookEvent,
    { priority: number; seq: number; handler: HookHandler }[]
  >();
  private seq = 0;
  readonly errors: { event: HookEvent; error: unknown }[] = [];

  /** Wyzszy priorytet pierwszy, przy rownym kolejnosc rejestracji; max 20 na zdarzenie. */
  register(event: HookEvent, handler: HookHandler, priority = 0): void {
    let list = this.handlers.get(event);
    if (!list) this.handlers.set(event, (list = []));
    if (list.length >= MAX_HOOK_HANDLERS) return;
    list.push({ priority, seq: this.seq++, handler });
    list.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  unregisterAll(): void {
    this.handlers.clear();
  }

  has(event: HookEvent): boolean {
    return this.count(event) > 0;
  }

  count(event: HookEvent): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** returns z ostatniego handlera, ktory cos zwrocil; wyjatek handlera nie przerywa kolejnych. */
  on(event: HookEvent, ...args: number[]): HookResult {
    const result: HookResult = { handled: false, returns: [] };
    for (const item of this.handlers.get(event) ?? []) {
      const call: HookCall = { args: [...args], returns: [] };
      try {
        item.handler(call);
      } catch (error) {
        this.errors.push({ event, error });
        continue;
      }
      if (call.returns.length > 0) {
        result.handled = true;
        result.returns = call.returns;
      }
    }
    return result;
  }

  static getArg(call: HookCall, i: number): number {
    return call.args[i] ?? 0;
  }

  static setArg(call: HookCall, i: number, v: number): void {
    if (i < 0) return;
    while (call.args.length <= i) call.args.push(0);
    call.args[i] = v;
  }

  static setReturn(call: HookCall, i: number, v: number): void {
    if (i < 0) return;
    while (call.returns.length <= i) call.returns.push(0);
    call.returns[i] = v;
  }
}
