/**
 * Atrapa handlu na prawdziwej logice: `BarterSession` (@f2/engine-core) z regulami @f2/rules,
 * podpieta przez adapter `createBarterBinding` (@f2/app). Pakiet UI nie zalezy od tych pakietow
 * w runtime, dlatego sklejenie jest tylko tutaj (playground i testy).
 */
import { signal, type Signal } from '@preact/signals';
import { createBarterBinding, type BarterItemMeta } from '../../app/src/barter-binding';
import {
  BarterSession,
  type BarterItem as SessionItem,
  type BarterParams as SessionParams,
} from '../../engine-core/src/barter-session';
import { barterAccept, barterPrice, splitCaps } from '../../rules/src/barter';
import type { BarterCommands, BarterResult, BarterView } from '../src/screens/barter/types';

export interface MockBarter {
  session: BarterSession;
  view: Signal<BarterView>;
  commands: BarterCommands;
  /** Dziennik wywolan komend (do asercji w testach i e2e). */
  log: string[];
  /** Ustawiane po zamknieciu handlu (cancel). */
  closed: Signal<boolean>;
}

export interface MockBarterInit {
  merchantName?: string;
  items: { item: SessionItem; meta: Omit<BarterItemMeta, 'id'> }[];
  /** Id przedmiotow w ekwipunku gracza i kupca. */
  player: string[];
  merchant: string[];
  params?: Partial<SessionParams>;
}

export function createMockBarter(init: MockBarterInit): MockBarter {
  const params: SessionParams = {
    merchantBarter: 50,
    partyBestBarter: 50,
    barterMod: 0,
    masterTrader: false,
    playerFreeCarry: 200,
    ...init.params,
  };
  const find = (id: string) => {
    const e = init.items.find((x) => x.item.id === id);
    if (!e) throw new Error(`brak przedmiotu ${id}`);
    return e.item;
  };
  const session = new BarterSession(init.player.map(find), init.merchant.map(find), params, {
    barterPrice,
    splitCaps,
    barterAccept,
  });
  const meta: Record<string, BarterItemMeta> = {};
  init.items.forEach((e, i) => (meta[e.item.id] = { id: i + 1, ...e.meta }));
  const closed = signal(false);
  const log: string[] = [];
  const view = signal<BarterView | null>(null);
  const binding = createBarterBinding(session, {
    merchantName: init.merchantName ?? 'Kupiec',
    meta,
    params,
    containerMode: params.containerMode === true,
    onChange: () => {
      view.value = binding.snapshot() as BarterView;
      closed.value = session.isClosed;
    },
  });
  view.value = binding.snapshot() as BarterView;
  const b = binding.commands;
  const commands: BarterCommands = {
    move(side, itemId, count, to) {
      log.push(`move:${side}:${itemId}:${count}:${to}`);
      return b.move(side, itemId, count, to) as BarterResult;
    },
    accept() {
      log.push('accept');
      return b.accept() as BarterResult;
    },
    balance() {
      log.push('balance');
      return b.balance() as BarterResult;
    },
    cancel() {
      log.push('cancel');
      b.cancel();
    },
  };
  return { session, view: view as Signal<BarterView>, commands, log, closed };
}

/** Numeryczne id UI kolejnych przedmiotow z `sampleBarter` (1-based, kolejnosc `items`). */
export const SAMPLE_IDS = {
  caps: 1,
  pistol: 2,
  stimpak: 3,
  holodisk: 4,
  rifle: 5,
  jacket: 6,
  ammo: 7,
  gold: 8,
} as const;

/** Zestaw demonstracyjny: gracz z kapslami i towarami, kupiec z towarami i ciezka sztaba zlota. */
export function sampleBarter(over: { params?: Partial<SessionParams> } = {}): MockBarterInit {
  const it = (
    id: string,
    pid: number,
    name: string,
    category: BarterItemMeta['category'],
    value: number,
    weight: number,
    count = 1,
    blocked = false,
  ) => ({
    item: { id, pid, count, value, weight, ...(blocked ? { blocked } : {}) } as SessionItem,
    meta: { name, fid: 0x07000000 + (pid % 40), category },
  });
  return {
    merchantName: 'Maida',
    items: [
      it('caps', 0x29, 'Kapsle', 'misc', 1, 0, 500),
      it('pistol', 2, 'Pistolet 10mm', 'weapon', 250, 2),
      it('stimpak', 3, 'Stimpak', 'drug', 175, 1, 4),
      it('holodisk', 4, 'Holodysk', 'quest', 1, 2, 1, true),
      it('rifle', 10, 'Karabin mysliwski', 'weapon', 400, 8),
      it('jacket', 11, 'Skorzana kurtka', 'armor', 100, 5),
      it('ammo', 12, 'Naboje 10mm', 'ammo', 50, 1, 20),
      it('gold', 13, 'Sztaba zlota', 'misc', 9000, 300),
    ],
    player: ['caps', 'pistol', 'stimpak', 'holodisk'],
    merchant: ['rifle', 'jacket', 'ammo', 'gold'],
    ...over,
  };
}
