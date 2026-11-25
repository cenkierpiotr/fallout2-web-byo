import {
  GlobalVars,
  PartyState,
  QuestLog,
  type GlobalVarsJSON,
  type PartyStateJSON,
} from '@f2/engine-core';
import type { HolodiskDef, KarmaVarDef, PartyMemberDef, QuestDef } from '@f2/formats';

/** Minimalny kontrakt zmiennych skryptowych (GameVars z engine-core). */
export interface VarsLike {
  readonly size: number;
  get(i: number): number;
  set(i: number, v: number): void;
  readonly lastChanged: number;
  readonly changed: { subscribe(fn: (v: number) => void): () => void };
}

export interface ExtrasSnapshot {
  party: PartyStateJSON | null;
  gvars: GlobalVarsJSON | null;
}

export interface SessionExtrasDeps {
  vars: VarsLike;
  partyDefs: readonly PartyMemberDef[];
  player: { objId: number; pid: number };
  /** Wiazanie wpisow druzyny z krytera swiata po wczytaniu (`inventory.rebindParty`). */
  rebindParty?: (entries: readonly { objId: number; pid: number }[]) => number;
  quests: readonly QuestDef[];
  holodisks: readonly HolodiskDef[];
  karmavar: readonly KarmaVarDef[];
}

/**
 * Adaptery party / quest / pipboy / endgame dla GameSession: odbija zmienne skryptowe do
 * GlobalVars (dziennik zadan, napisy), trzyma PartyState podpiety do ScriptRuntime i niesie
 * oba stany w zapisie.
 */
export class SessionExtras {
  readonly gvars: GlobalVars;
  /** Ta sama instancja trafia do ScriptRuntime (opts.party); wczytanie podmienia stan w miejscu. */
  readonly party: PartyState;
  readonly quests: QuestLog;
  private restoring = false;
  private readonly unsub: () => void;

  constructor(private readonly d: SessionExtrasDeps) {
    this.gvars = new GlobalVars(
      d.vars.size,
      Array.from({ length: d.vars.size }, (_, i) => d.vars.get(i)),
    );
    this.party = new PartyState(d.partyDefs, d.player);
    this.quests = new QuestLog(this.gvars, d.quests, d.holodisks, d.karmavar);
    let first = true;
    this.unsub = d.vars.changed.subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      if (this.restoring) return;
      const i = d.vars.lastChanged;
      if (i >= 0) this.gvars.set(i, d.vars.get(i));
    });
  }

  /**
   * Po wczytaniu zapisu i odtworzeniu obiektow mapy: wiaze wpisy PartyState z krytera na mapie
   * (zbior druzyny skryptow). Poza tym druzyna zyje w PartyState sama: opkody party_add/party_remove
   * ScriptRuntime pisza wprost do `party`.
   */
  rebindParty(): number {
    return this.d.rebindParty?.(this.party.entries) ?? 0;
  }

  /** Dostep do GVAR-ow skryptow (np. flagi uzaleznienia): zapis idzie do zmiennych skryptow i do GlobalVars. */
  globalAccess(): { get(i: number): number; set(i: number, v: number): void } {
    return {
      get: (i) => this.d.vars.get(i),
      set: (i, v) => {
        this.d.vars.set(i, v);
        this.gvars.set(i, v);
      },
    };
  }

  snapshot(): ExtrasSnapshot {
    return { party: this.party.toJSON(), gvars: this.gvars.toJSON() };
  }

  restore(s: Partial<ExtrasSnapshot>): void {
    this.restoring = true;
    try {
      if (s.gvars) {
        s.gvars.values.forEach((v, i) => {
          this.d.vars.set(i, v);
          this.gvars.set(i, v);
        });
      }
      if (s.party) {
        this.party.restoreFrom(s.party);
      }
    } finally {
      this.restoring = false;
    }
  }

  dispose(): void {
    this.unsub();
  }
}
