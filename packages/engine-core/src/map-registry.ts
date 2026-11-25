import type { MapStateJSON } from './save/schema.js';

/**
 * Rejestr stanu odwiedzonych map (dokumentacja techniczna World.maps).
 * Przechowuje kopie MapStateJSON, wspolne ze schematem zapisu (SaveWorld.maps).
 */
export class MapRegistry {
  private states = new Map<string, MapStateJSON>();

  /** persist: false => mapa nie jest zapisywana (np. losowe spotkania, spec savegame-state). */
  constructor(private readonly persist: (name: string) => boolean = () => true) {}

  snapshot(state: MapStateJSON): void {
    if (!this.persist(state.name)) return;
    this.states.set(state.name, structuredClone(state));
  }

  /** Kopia zapisanego stanu albo null, gdy mapa nie byla odwiedzona. */
  get(name: string): MapStateJSON | null {
    const s = this.states.get(name);
    return s ? structuredClone(s) : null;
  }

  has(name: string): boolean {
    return this.states.has(name);
  }

  names(): string[] {
    return [...this.states.keys()];
  }

  serialize(): MapStateJSON[] {
    return [...this.states.values()].map((s) => structuredClone(s));
  }

  /** Zastepuje caly rejestr stanem z zapisu. */
  load(maps: readonly MapStateJSON[]): void {
    this.states.clear();
    for (const m of maps) this.states.set(m.name, structuredClone(m));
  }
}
