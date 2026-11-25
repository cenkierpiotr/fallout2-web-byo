import {
  BarterSession,
  type BarterItem,
  type BarterParams,
  type BarterRules,
} from '@f2/engine-core';
import { barterAccept, barterPrice, splitCaps, CAPS_PID } from '@f2/rules';
import {
  createBarterBinding,
  type BarterBinding,
  type BarterCategory,
  type BarterItemMeta,
} from '@f2/app/src/barter-binding';
import type { GameObject } from '@f2/engine-core';
import { FLAG_LEFT_HAND, FLAG_RIGHT_HAND, FLAG_WORN } from './save-world';

/** Reguly handlu z @f2/rules wstrzykiwane do `BarterSession` (engine-core nie zalezy od rules). */
export const BARTER_RULES: BarterRules = { barterPrice, splitCaps, barterAccept };

const EQUIP = FLAG_LEFT_HAND | FLAG_RIGHT_HAND | FLAG_WORN;
const SUBTYPE_CATEGORY: Record<number, BarterCategory> = {
  0: 'armor',
  1: 'misc',
  2: 'drug',
  3: 'weapon',
  4: 'ammo',
  5: 'misc',
  6: 'misc',
};

export function categoryOf(o: GameObject): BarterCategory {
  if (o.proto.kind !== 'item') return 'misc';
  return SUBTYPE_CATEGORY[o.proto.subtype] ?? 'misc';
}

export function itemValue(o: GameObject): number {
  return o.proto.kind === 'item' ? o.proto.cost : 0;
}
export function itemWeight(o: GameObject): number {
  return o.proto.kind === 'item' ? o.proto.weight : 0;
}
export function inventoryWeight(inv: readonly GameObject[]): number {
  return inv.reduce((w, o) => w + itemWeight(o) * (o.quantity ?? 1), 0);
}

export interface BarterSetup {
  session: BarterSession;
  binding: BarterBinding;
  /** Obiekty zrodlowe wg id tekstowego sesji (p<i> / m<i>). */
  sources: Map<string, GameObject>;
}

export interface BarterOpenOptions {
  merchantName: string;
  params: Omit<BarterParams, 'playerFreeCarry'> & { playerFreeCarry: number };
  nameOf?(o: GameObject): string;
  containerMode?: boolean;
  onChange?(): void;
}

/** Sklada sesje handlu (z regulami) i binding do UI z ekwipunkow dwoch obiektow. */
export function createBarter(
  player: GameObject,
  merchant: GameObject,
  opts: BarterOpenOptions,
): BarterSetup {
  const sources = new Map<string, GameObject>();
  const meta: Record<string, BarterItemMeta> = {};
  let uiId = 1;
  const build = (owner: GameObject, prefix: 'p' | 'm'): BarterItem[] =>
    owner.inventory.map((o, i) => {
      const id = `${prefix}${i}`;
      sources.set(id, o);
      meta[id] = {
        id: uiId++,
        name: opts.nameOf?.(o) ?? `0x${o.pid.toString(16)}`,
        fid: o.fid,
        category: categoryOf(o),
      };
      return {
        id,
        pid: o.pid,
        count: o.quantity ?? 1,
        value: o.pid === CAPS_PID ? 1 : itemValue(o),
        weight: itemWeight(o),
        ...((o.flags & EQUIP) !== 0 ? { blocked: true } : {}),
      };
    });
  const params: BarterParams = {
    ...opts.params,
    ...(opts.containerMode ? { containerMode: true } : {}),
  };
  const session = new BarterSession(build(player, 'p'), build(merchant, 'm'), params, BARTER_RULES);
  const binding = createBarterBinding(session, {
    merchantName: opts.merchantName,
    meta,
    params: {
      merchantBarter: params.merchantBarter,
      partyBestBarter: params.partyBestBarter,
      barterMod: params.barterMod,
      masterTrader: params.masterTrader,
    },
    containerMode: opts.containerMode === true,
    ...(opts.onChange ? { onChange: opts.onChange } : {}),
  });
  return { session, binding, sources };
}

/** Po udanym `accept` przepisuje wynik sesji do ekwipunkow obiektow (scala stosy tego samego pid). */
export function commitBarter(setup: BarterSetup, player: GameObject, merchant: GameObject): void {
  const rebuild = (items: readonly BarterItem[]): GameObject[] => {
    const out: GameObject[] = [];
    for (const it of items) {
      const src = setup.sources.get(it.id);
      if (!src) continue;
      const same = out.find(
        (o) => o.pid === it.pid && (o.flags & EQUIP) === 0 && (src.flags & EQUIP) === 0,
      );
      if (same) {
        same.quantity = (same.quantity ?? 1) + it.count;
        continue;
      }
      out.push({ ...src, quantity: it.count });
    }
    return out;
  };
  player.inventory = rebuild(setup.session.playerInv);
  merchant.inventory = rebuild(setup.session.merchantInv);
}
