import { openGameFile } from './proto-cache.js';
import { createSignal, type Signal } from './game-view.js';
import type { VirtualFs } from '@f2/vfs';

/**
 * Parser VAULT13.GAM (tekst latin1): sekcja `GAME_GLOBAL_VARS:` zawiera linie
 * `NAZWA := wartosc;  // (indeks)`. Zwraca wartosci poczatkowe w kolejnosci deklaracji
 * (indeks = pozycja). Komentarze `//` i bloki po innych etykietach sekcji (`MAP_GLOBAL_VARS:` bywa
 * zakomentowane) sa pomijane; zmienne przed `GAME_GLOBAL_VARS:` nie sa liczone.
 */
export function parseGam(buf: Uint8Array | ArrayBuffer): Int32Array {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const out: number[] = [];
  let inGame = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const slash = raw.indexOf('//');
    const line = (slash === -1 ? raw : raw.slice(0, slash)).trim();
    if (line === '') continue;
    if (/^GAME_GLOBAL_VARS\s*:/i.test(line)) {
      inGame = true;
      continue;
    }
    if (/^[A-Za-z_]+_GLOBAL_VARS\s*:/i.test(line)) {
      inGame = false;
      continue;
    }
    if (!inGame) continue;
    const m = /^[A-Za-z_][\w]*\s*:=\s*(-?\d+)\s*;/.exec(line);
    if (m) out.push(Number(m[1]) | 0);
  }
  return Int32Array.from(out);
}

/** Zmienne globalne gry (GVAR_*). `changed` to licznik zmian (rosnie przy kazdym set), `lastChanged` = indeks. */
export class GameVars {
  private vars: Int32Array;
  readonly changed: Signal<number> = createSignal(0);
  lastChanged = -1;

  constructor(globals: Int32Array) {
    this.vars = Int32Array.from(globals);
  }

  /** Wczytuje data/vault13.gam (warstwy: overlay > PATCH000 > MASTER). */
  static async load(vfs: VirtualFs): Promise<GameVars> {
    return new GameVars(parseGam(await openGameFile(vfs, 'data/vault13.gam')));
  }

  get size(): number {
    return this.vars.length;
  }

  /** Poza zakresem: 0. */
  get(i: number): number {
    return this.vars[i] ?? 0;
  }

  /** Indeks poza zakresem rozszerza tablice (skrypty z patchy moga uzywac wiekszych indeksow). */
  set(i: number, v: number): void {
    if (!Number.isInteger(i) || i < 0) return;
    if (i >= this.vars.length) {
      const next = new Int32Array(i + 1);
      next.set(this.vars);
      this.vars = next;
    }
    this.vars[i] = v | 0;
    this.lastChanged = i;
    this.changed.value = this.changed.value + 1;
  }

  snapshot(): Int32Array {
    return Int32Array.from(this.vars);
  }
}
