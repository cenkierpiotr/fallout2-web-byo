/** Minimalny sygnal zgodny strukturalnie z @preact/signals (value + subscribe). */
export interface Store<T> {
  readonly value: T;
  subscribe(fn: (v: T) => void): () => void;
}

export interface WritableStore<T> extends Store<T> {
  value: T;
}

export function createStore<T>(initial: T): WritableStore<T> {
  let v = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get value() {
      return v;
    },
    set value(n: T) {
      v = n;
      for (const f of [...subs]) f(v);
    },
    subscribe(fn) {
      subs.add(fn);
      fn(v);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
