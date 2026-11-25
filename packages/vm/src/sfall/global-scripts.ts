/** Host (silnik) udostepnia liste plikow gl_*.int i uruchamianie ich procedur. */
export interface GlobalScriptHost {
  /** Nazwy plikow skryptow (np. z VirtualFs.list('scripts/')); filtrowane tu do `gl_*.int`. */
  list(): Iterable<string>;
  /** Laduje i uruchamia `start`; zwraca uchwyt (instance = ScriptInstance VM, run = jedna runda procedury). */
  start(
    name: string,
  ):
    | Promise<{ instance: unknown; run(): void } | undefined>
    | { instance: unknown; run(): void }
    | undefined;
}

interface Entry {
  name: string;
  instance: unknown;
  run(): void;
  repeat: number;
  acc: number;
}

const isGlobalScript = (n: string): boolean => /(^|[\\/])gl_[^\\/]*\.int$/i.test(n);

/** Global scripts sfall: dzialaja co `repeat` tickow (0 = co tick), niezaleznie od mapy. */
export class GlobalScriptRunner {
  private entries: Entry[] = [];

  async load(host: GlobalScriptHost): Promise<number> {
    this.entries = [];
    const seen = new Set<string>();
    for (const n of host.list()) {
      if (!isGlobalScript(n)) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const h = await host.start(n);
      if (h) this.entries.push({ name: n, instance: h.instance, run: h.run, repeat: 0, acc: 0 });
    }
    return this.entries.length;
  }

  get count(): number {
    return this.entries.length;
  }

  names(): string[] {
    return this.entries.map((e) => e.name);
  }

  /** set_global_script_repeat: wywolywane przez skrypt (instance z ExecContext). */
  setRepeat(instance: unknown, ticks: number): void {
    const e = this.entries.find((x) => x.instance === instance);
    if (e) e.repeat = Math.max(0, ticks | 0);
  }

  tick(ticks = 1): void {
    for (const e of this.entries) {
      if (e.repeat === 0) {
        e.run();
        continue;
      }
      e.acc += ticks;
      if (e.acc >= e.repeat) {
        e.acc = 0;
        e.run();
      }
    }
  }

  serialize(): { name: string; repeat: number; acc: number }[] {
    return this.entries.map((e) => ({ name: e.name, repeat: e.repeat, acc: e.acc }));
  }

  restore(state: readonly { name: string; repeat: number; acc: number }[]): void {
    for (const s of state) {
      const e = this.entries.find((x) => x.name === s.name);
      if (e) {
        e.repeat = s.repeat;
        e.acc = s.acc;
      }
    }
  }
}
