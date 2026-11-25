import type { PartyMemberDef } from '@f2/formats';
import {
  NEW_PARTY_COUNTERS,
  partyLevelUpCheck,
  partyMemberAdd,
  validateOrders,
  type OrdersValidation,
  type PartyOrders,
  type PartyAddCode,
  type PartyEntry,
  type Rng,
} from '@f2/rules';

export interface PartyStateJSON {
  version: 1;
  denied: boolean;
  entries: PartyEntry[];
  /** Rozkazy per objId (opcjonalne; zapisy bez pola = brak rozkazow). */
  orders?: Record<string, PartyOrders>;
}

const copy = (e: PartyEntry): PartyEntry => ({ ...e, counters: { ...e.counters } });

/** Lista druzyny (indeks 0 = gracz) nad regulami `@f2/rules`. Z: limit Charyzmy, rekrutacja dialogowa. */
export class PartyState {
  entries: PartyEntry[];
  /** `DAT_00519db4`: blokada rekrutacji ("partyMemberAdd DENIED") */
  denied = false;
  /** Rozkazy per objId czlonka (tylko zwalidowane wg party.txt). */
  private orders = new Map<number, PartyOrders>();

  constructor(
    private readonly defs: readonly PartyMemberDef[],
    player: { objId: number; pid: number },
  ) {
    this.entries = [{ objId: player.objId, pid: player.pid, counters: { ...NEW_PARTY_COUNTERS } }];
  }

  add(obj: { objId: number; pid: number; flags: number }): {
    code: PartyAddCode;
    flags?: number;
    objId?: number;
  } {
    const r = partyMemberAdd(this.entries, obj, {
      defCount: this.defs.length,
      denied: this.denied,
    });
    this.entries = r.entries;
    return r.code === 1
      ? { code: 1, flags: r.flags as number, objId: r.newObjId as number }
      : { code: r.code };
  }

  /** Usuwa czlonka (nie gracza, indeks 0). D 0x4944dc: ostatni wpis trafia na miejsce usuwanego (kolejnosc listy sie zmienia), flagi &= 0xfbfb. */
  remove(objId: number): boolean {
    const i = this.entries.findIndex((e, idx) => idx > 0 && e.objId === objId);
    if (i < 0) return false;
    const last = this.entries.pop()!;
    if (i < this.entries.length) this.entries[i] = last;
    this.orders.delete(objId);
    return true;
  }

  /** Ustawia rozkazy czlonka; do stanu wchodza tylko dozwolone przez party.txt. Zwraca wynik walidacji. */
  setOrders(objId: number, orders: PartyOrders): OrdersValidation | undefined {
    const i = this.entries.findIndex((e, idx) => idx > 0 && e.objId === objId);
    if (i < 0) return undefined;
    const def =
      this.def(this.entries[i]!.pid) ??
      this.defs.find((d) => d.levelPids.includes(this.entries[i]!.pid));
    if (!def) return undefined;
    const v = validateOrders(def, orders);
    this.orders.set(objId, { ...(this.orders.get(objId) ?? {}), ...v.accepted });
    return v;
  }

  ordersOf(objId: number): PartyOrders {
    return { ...(this.orders.get(objId) ?? {}) };
  }

  has(objId: number): boolean {
    return this.entries.some((e) => e.objId === objId);
  }

  /** Liczba czlonkow bez gracza. */
  get memberCount(): number {
    return this.entries.length - 1;
  }

  def(pid: number): PartyMemberDef | undefined {
    return this.defs.find((d) => d.pid === pid);
  }

  /** Po awansie gracza: sprawdza towarzyszy (indeks >= 1, tylko krytterzy). Zwraca zmiany pidow. */
  incLevels(playerLevel: number, rng: Rng): { objId: number; oldPid: number; newPid: number }[] {
    const out: { objId: number; oldPid: number; newPid: number }[] = [];
    this.entries.forEach((e, i) => {
      if (i === 0 || e.pid >>> 24 !== 1) return;
      const def = this.def(e.pid) ?? this.defs.find((d) => d.levelPids.includes(e.pid));
      if (!def) return;
      const r = partyLevelUpCheck(def, e.counters, playerLevel, rng);
      e.counters = r.counters;
      if (r.levelUp && r.newPid !== null) {
        out.push({ objId: e.objId, oldPid: e.pid, newPid: r.newPid });
        e.pid = r.newPid;
      }
    });
    return out;
  }

  toJSON(): PartyStateJSON {
    const j: PartyStateJSON = { version: 1, denied: this.denied, entries: this.entries.map(copy) };
    if (this.orders.size > 0) {
      j.orders = Object.fromEntries([...this.orders].map(([k, v]) => [String(k), { ...v }]));
    }
    return j;
  }

  /** Podmienia stan zapisem w miejscu (instancja zostaje ta sama, wiec trzymaja ja adaptery skryptow). */
  restoreFrom(j: PartyStateJSON): void {
    if (!j || j.version !== 1 || !Array.isArray(j.entries) || j.entries.length === 0) {
      throw new Error('PartyState: nieprawidlowy zapis');
    }
    this.entries = j.entries.map(copy);
    this.denied = !!j.denied;
    this.orders = new Map(Object.entries(j.orders ?? {}).map(([k, v]) => [Number(k), { ...v }]));
  }

  static fromJSON(j: PartyStateJSON, defs: readonly PartyMemberDef[]): PartyState {
    if (!j || j.version !== 1 || !Array.isArray(j.entries) || j.entries.length === 0) {
      throw new Error('PartyState: nieprawidlowy zapis');
    }
    const s = new PartyState(defs, j.entries[0] as PartyEntry);
    s.restoreFrom(j);
    return s;
  }
}
