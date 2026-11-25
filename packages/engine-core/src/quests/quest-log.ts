import type { HolodiskDef, KarmaVarDef, QuestDef } from '@f2/formats';
import { questStatus, holodiskVisible, karmaTitles, type QuestStatus } from '@f2/rules';
import type { GlobalVars } from './global-vars.js';

export interface QuestLogView {
  locations: {
    locationMsg: number;
    quests: { descriptionMsg: number; gvar: number; status: Exclude<QuestStatus, 'hidden'> }[];
  }[];
  holodisks: { gvar: number; titleMsg: number; textMsg: number }[];
  karma: number;
  titles: { pic: number; nameMsg: number; descriptionMsg: number }[];
}

/** Dziennik questow, holodyski i tytuly karmy: pochodna GlobalVars (nie jest zapisywana). */
export class QuestLog {
  private view: QuestLogView;
  private readonly listeners = new Set<(v: QuestLogView) => void>();
  private readonly unsub: () => void;

  constructor(
    private readonly gv: GlobalVars,
    private readonly quests: readonly QuestDef[],
    private readonly holodisks: readonly HolodiskDef[],
    private readonly karmavar: readonly KarmaVarDef[] = [],
  ) {
    this.view = this.compute();
    this.unsub = gv.subscribe(() => {
      this.view = this.compute();
      for (const l of this.listeners) l(this.view);
    });
  }

  get current(): QuestLogView {
    return this.view;
  }

  subscribe(l: (v: QuestLogView) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  dispose(): void {
    this.unsub();
    this.listeners.clear();
  }

  private compute(): QuestLogView {
    const byLoc = new Map<number, QuestLogView['locations'][number]>();
    for (const q of this.quests) {
      // gvar poza zakresem VAULT13.GAM -> get()=0 -> hidden (jesli display > 0), bez wyjatku
      const st = questStatus(q, this.gv.get(q.gvar));
      if (st === 'hidden') continue;
      let loc = byLoc.get(q.locationMsg);
      if (!loc) byLoc.set(q.locationMsg, (loc = { locationMsg: q.locationMsg, quests: [] }));
      loc.quests.push({ descriptionMsg: q.descriptionMsg, gvar: q.gvar, status: st });
    }
    return {
      locations: [...byLoc.values()],
      // Z: widocznosc holodysku (gvar != 0) wg planu
      holodisks: this.holodisks
        .filter((h) => holodiskVisible(h, this.gv.get(h.gvar)))
        .map((h) => ({ gvar: h.gvar, titleMsg: h.titleMsg, textMsg: h.textMsg })),
      karma: this.gv.get(0),
      titles: karmaTitles((i) => this.gv.get(i), this.karmavar),
    };
  }
}
