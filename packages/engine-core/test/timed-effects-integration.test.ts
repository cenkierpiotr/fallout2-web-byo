import { describe, expect, it } from 'vitest';
import {
  ItemType,
  Perk,
  Stat,
  applyTimedEffect,
  defaultRulesContext,
  endWithdrawal,
  withdrawalEndTick,
  newCritterData,
  newGameObject,
  recalcDerived,
  statLevel,
  takeDrug,
  type DrugProto,
  type GameObject,
  type ItemUseContext,
} from '../../rules/src/index.js';
import { EventQueue, EventQueueEffectPort, GameClock } from '../src/index.js';

const NONE3: [number, number, number] = [0, 0, 0];
const buffout: DrugProto = {
  size: 1,
  weight: 1,
  cost: 10,
  flags: 0,
  flagsExt: 0,
  pid: 87,
  type: ItemType.Drug,
  statId: [0, -1, -1],
  instantAmount: [2, 0, 0],
  duration1: 240,
  delayed1Amount: [-2, 0, 0],
  duration2: 0,
  delayed2Amount: NONE3,
  addictionChance: 25,
  withdrawalEffect: Perk.BuffoutAddiction,
  withdrawalOnset: 3,
};

function setup(rollLow = true) {
  const clock = new GameClock(0);
  const queue = new EventQueue();
  const port = new EventQueueEffectPort(queue);
  const base = defaultRulesContext();
  const ctx: ItemUseContext = {
    ...base,
    rng: { int: (lo, hi) => (rollLow ? lo : hi) },
    clock,
    protos: () => undefined,
    allocId: () => 1,
    effects: port,
  };
  const data = newCritterData(true);
  data.baseStats[0] = 5;
  recalcDerived(data, base);
  const player: GameObject = newGameObject(1, 0x1000000, data);
  /** Przesuwa zegar i przetwarza kolejke, stosujac efekty do gracza. */
  const advance = (ticks: number): number => {
    clock.advance(ticks);
    return queue.processUntil(clock.ticks, (e) => {
      const r = port.handle(e, (fx) => {
        applyTimedEffect(player, fx, ctx);
      });
      return r ?? 0;
    });
  };
  return { clock, queue, port, ctx, player, advance };
}

const ST = (p: GameObject, ctx: ItemUseContext): number =>
  statLevel(p.critter!, Stat.Strength, ctx);

describe('efekty czasowe na EventQueue + GameClock', () => {
  it('narkotyk: bonus od razu, cofniecie po 240 min, odstawienie po 3 min przez zegar', () => {
    const { clock, queue, ctx, player, advance } = setup(true);
    takeDrug(player, buffout, ctx);
    expect(ST(player, ctx)).toBe(7);
    // dwa zdarzenia w jednej wspolnej kolejce: odstawienie (3 min) i cofniecie (240 min)
    expect(queue.serialize().map((e) => e.kind)).toEqual(['withdrawal', 'drug-revert']);
    expect(queue.nextTime()).toBe(clock.ticks + 3 * 600);

    advance(3 * 600 - 1);
    expect(player.critter!.perkRanks[Perk.BuffoutAddiction] ?? 0).toBe(0);
    advance(1);
    expect(player.critter!.perkRanks[Perk.BuffoutAddiction]).toBe(1);

    advance(240 * 600 - 3 * 600 - 1);
    expect(queue.size).toBe(1);
    advance(1);
    expect(queue.size).toBe(0);
    // bonus +2 cofniety (-2 z drug-revert), -2 z odstawienia perkiem Buffout Addiction
    expect(ST(player, ctx)).toBe(3);
  });

  it('niezerowy wynik handlera przerywa przetwarzanie, reszta zostaje w kolejce', () => {
    const { queue, port, ctx, player } = setup(true);
    takeDrug(player, buffout, ctx);
    const r = queue.processUntil(1e9, (e) => port.handle(e, () => 1) ?? 0);
    expect(r).toBe(1);
    expect(queue.size).toBe(1);
  });

  it('antidotum anuluje odstawienie w kolejce zdarzen', () => {
    const { queue, ctx, player, advance } = setup(true);
    takeDrug(player, buffout, ctx);
    const antidote: DrugProto = {
      ...buffout,
      pid: 260,
      statId: [-1, -1, -1],
      delayed1Amount: NONE3,
    };
    takeDrug(player, antidote, ctx);
    expect(queue.serialize().map((e) => e.kind)).toEqual(['drug-revert']);
    advance(240 * 600);
    expect(ST(player, ctx)).toBe(5);
  });

  it('limit przedawkowania liczy uzycia z kolejki, zapis/odczyt zachowuje stan', () => {
    const { queue, port, ctx, player } = setup(false); // brak uzaleznienia
    for (let i = 0; i < 4; i++) takeDrug(player, buffout, ctx);
    expect(takeDrug(player, buffout, ctx)).toMatchObject({ reason: 'overdose' });

    const json = JSON.parse(JSON.stringify(queue.serialize())) as ReturnType<
      EventQueue['serialize']
    >;
    const q2 = EventQueue.restore(json);
    const port2 = new EventQueueEffectPort(q2);
    expect(port2.pending()).toEqual(port.pending());
    const ctx2: ItemUseContext = { ...ctx, effects: port2 };
    expect(takeDrug(player, buffout, ctx2)).toMatchObject({ reason: 'overdose' });
    expect(port2.newUseId()).toBeGreaterThan(Math.max(...port2.pending().map((e) => e.useId)));
  });

  it('inne zdarzenia (np. polnoc) sa przepuszczane i zachowuja kolejnosc FIFO', () => {
    const { queue, port } = setup(true);
    queue.add({ atTick: 5, kind: 'map-update', objId: 0, payload: null });
    const seen: string[] = [];
    queue.processUntil(10, (e) => {
      if (port.handle(e, () => 0) === undefined) seen.push(e.kind);
      return 0;
    });
    expect(seen).toEqual(['map-update']);
  });

  it('koniec odstawienia (typ 0): kolejkowany z withdrawalEndTick, zdejmuje perk, zapis 1:1', () => {
    const { clock, queue, port, ctx, player, advance } = setup(true);
    takeDrug(player, buffout, ctx);
    const start = clock.ticks + 3 * 600;
    const wd = port.pending().find((e) => e.kind === 'withdrawal')!;
    port.schedule({
      targetId: player.id,
      atTick: withdrawalEndTick(start, player.critter),
      kind: 'withdrawal-end',
      deltas: [],
      drugPid: 87,
      useId: 1,
      addictionIndex: wd.addictionIndex,
      withdrawalEffect: Perk.BuffoutAddiction,
    });
    expect(queue.serialize().map((e) => e.kind)).toContain('withdrawal-end');
    const json = JSON.parse(JSON.stringify(queue.serialize())) as ReturnType<
      EventQueue['serialize']
    >;
    expect(EventQueue.restore(json).serialize()).toEqual(queue.serialize());

    advance(3 * 600);
    expect(player.critter!.perkRanks[Perk.BuffoutAddiction]).toBe(1);
    const endAt = withdrawalEndTick(start, player.critter);
    queue.processUntil(
      endAt,
      (e) =>
        port.handle(e, (fx) => {
          if (fx.kind === 'withdrawal-end') endWithdrawal(player, fx.addictionIndex);
        }) ?? 0,
    );
    expect(player.critter!.perkRanks[Perk.BuffoutAddiction] ?? 0).toBe(0);
    expect(port.pending().some((e) => e.kind === 'withdrawal-end')).toBe(false);
  });
});
