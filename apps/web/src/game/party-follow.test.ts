import { describe, expect, it } from 'vitest';
import { hexDistance } from '@f2/engine-core';
import { FOLLOW_DISTANCE, FOLLOW_REPLAN_TICKS, PartyFollower, followTarget } from './party-follow';

function obj(id: number, hex: number, over: Record<string, unknown> = {}): never {
  return {
    id,
    pid: 0x1000000 + id,
    type: 1,
    hex,
    elevation: 0,
    rotation: 0,
    flags: 0,
    hidden: false,
    inventory: [],
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    ...over,
  } as never;
}

function setup(memberHexes: number[], playerHex = 10000) {
  const player = obj(1, playerHex) as { hex: number; elevation: number };
  const members = memberHexes.map((h, i) => obj(10 + i, h)) as {
    hex: number;
    elevation: number;
    hidden: boolean;
  }[];
  const started: { id: number; path: number[]; run: boolean }[] = [];
  const states = new Set<unknown>();
  const map = { objects: [player, ...members], byHex: new Map() };
  const host = {
    world: {
      map,
      player,
      scripts: { inventory: { partyObjects: () => members } },
      movement: {
        stateOf: (o: unknown) => (states.has(o) ? {} : undefined),
        start: (o: { id: number }, path: number[], run: boolean) => {
          started.push({ id: o.id, path, run });
          states.add(o);
          return { ok: true };
        },
        tick: () => ({ arrived: false }),
      },
    },
    enemiesNearby: () => false,
  };
  const follower = new PartyFollower(
    host as never,
    ((_m: unknown, _e: number, from: number, to: number) => [from + 1, to]) as never,
  );
  return { follower, members, player, started, host, map };
}

describe('PartyFollower', () => {
  it('towarzysz daleko od gracza dostaje trase do heksa przy graczu', () => {
    const s = setup([10000 + 20]);
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.started.length).toBe(1);
    const goal = s.started[0]!.path.at(-1)!;
    expect(hexDistance(goal, s.player.hex)).toBeLessThanOrEqual(FOLLOW_DISTANCE);
    expect(s.started[0]!.run).toBe(true);
  });
  it('towarzysz blisko gracza stoi', () => {
    const s = setup([10001]);
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.started.length).toBe(0);
  });
  it('podczas walki nie planuje ruchu', () => {
    const s = setup([10020]);
    s.host.enemiesNearby = () => true;
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.started.length).toBe(0);
  });
  it('martwy towarzysz nie podaza', () => {
    const s = setup([10020]);
    (s.members[0] as unknown as { extra: { raw: Int32Array } }).extra.raw[3] = 0x80;
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.started.length).toBe(0);
  });
  it('dwoch towarzyszy dostaje rozne cele', () => {
    const s = setup([10020, 10021]);
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.started.length).toBe(2);
    expect(s.started[0]!.path.at(-1)).not.toBe(s.started[1]!.path.at(-1));
  });
  it('inny poziom mapy: towarzysz jest przenoszony przy gracza', () => {
    const s = setup([10020]);
    s.members[0]!.elevation = 1;
    s.follower.update(FOLLOW_REPLAN_TICKS);
    expect(s.members[0]!.elevation).toBe(0);
    expect(hexDistance(s.members[0]!.hex, s.player.hex)).toBeLessThanOrEqual(FOLLOW_DISTANCE);
  });
  it('followTarget omija zajete heksy', () => {
    const s = setup([10020]);
    const a = followTarget(s.map as never, s.player as never, s.members[0] as never, new Set());
    const b = followTarget(
      s.map as never,
      s.player as never,
      s.members[0] as never,
      new Set([a as number]),
    );
    expect(b).not.toBe(a);
  });
});
