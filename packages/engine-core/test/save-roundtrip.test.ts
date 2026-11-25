import { describe, expect, it } from 'vitest';
import { EventQueue, GameClock } from '../src/index.js';
import { deserializeWorld, serializeWorld } from '../src/save/serialize.js';
import type { SaveMeta } from '../src/save/schema.js';
import { arbitraryWorld } from './save-fixtures.js';

const meta = (): SaveMeta => ({
  slot: 'manual-0',
  name: 'test',
  characterName: 'Chosen',
  level: 3,
  location: 'Arroyo',
  gameDate: '25 Jul 2241 08:24',
  realTime: 1_700_000_000_000,
  thumbnail: null,
  engineVersion: '0.0.0',
});

describe('save round-trip', () => {
  it('deserialize(serialize(w)) equals w for 100 seeded worlds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const w = arbitraryWorld(seed);
      const save = serializeWorld(w, meta());
      const back = deserializeWorld(JSON.parse(JSON.stringify(save)));
      expect(back, `seed ${seed}`).toEqual(w);
      expect(back.clock).toBeInstanceOf(GameClock);
      expect(back.queue).toBeInstanceOf(EventQueue);
    }
  });

  it('keeps player hp/radiation/poison and ammoPid', () => {
    const w = arbitraryWorld(21);
    w.player.hp = 17;
    w.player.radiation = 450;
    w.player.poison = 9;
    w.player.inventory = [
      { pid: 7, count: 1, equippedSlot: 'right', ammo: 3, ammoPid: 29, contents: [] },
    ];
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w, meta()))));
    expect(back.player.hp).toBe(17);
    expect(back.player.radiation).toBe(450);
    expect(back.player.poison).toBe(9);
    expect(back.player.inventory[0]!.ammoPid).toBe(29);
  });

  it('never serializes random-encounter maps', () => {
    const w = arbitraryWorld(22);
    w.maps.push({ ...structuredClone(w.maps[0]!), name: 'rnd', encounter: true });
    const save = serializeWorld(w, meta());
    expect(save.maps.some((m) => m.name === 'rnd')).toBe(false);
    expect(save.maps.length).toBe(w.maps.length - 1);
  });

  it('serialization does not alias the live world', () => {
    const w = arbitraryWorld(7);
    const save = serializeWorld(w, meta());
    w.player.hex += 1;
    w.globals['zz'] = 5;
    w.queue.add({ atTick: 1, kind: 'poison', objId: 1, payload: null });
    expect(save.world.player.hex).not.toBe(w.player.hex);
    expect(save.globals['zz']).toBeUndefined();
    expect(save.queue.length).toBe(w.queue.size - 1);
  });

  it('contains only ids, no pixel/PRO data', () => {
    const json = JSON.stringify(serializeWorld(arbitraryWorld(3), meta()));
    expect(json).not.toMatch(/frm|pixels|palette/i);
  });

  it('timed drug effect survives roundtrip and fires at same tick', () => {
    const w = arbitraryWorld(11);
    w.queue = new EventQueue();
    w.clock = new GameClock(1000);
    w.queue.add({
      atTick: 1000 + 6000,
      kind: 'drug-revert',
      objId: 1,
      payload: { stat: 1, amount: -2 },
    });
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w, meta()))));
    const fired: number[] = [];
    back.clock.advance(5999);
    back.queue.processUntil(back.clock.ticks, (e) => (fired.push(e.atTick), 0));
    expect(fired).toEqual([]);
    back.clock.advance(1);
    back.queue.processUntil(back.clock.ticks, (e) => (fired.push(e.atTick), 0));
    expect(fired).toEqual([7000]);
  });
});

describe('effect port rebind after load', () => {
  it('rebindEffectPort works on the restored queue', async () => {
    const { EventQueueEffectPort, rebindEffectPort } = await import('../src/index.js');
    const fx = (atTick: number) => ({
      targetId: 1,
      atTick,
      kind: 'drug-stage' as const,
      deltas: [],
      drugPid: 1,
      useId: 4,
      addictionIndex: 0,
      withdrawalEffect: 0,
    });
    const w = arbitraryWorld(31);
    w.queue = new EventQueue();
    const eff = new EventQueueEffectPort(w.queue).schedule(fx(500));
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w, meta()))));
    const port = rebindEffectPort(back.queue);
    expect(port.pending().length).toBe(1);
    expect(port.schedule(fx(600)).seq).toBeGreaterThan(eff.seq);
    expect(port.newUseId()).toBeGreaterThan(4);
    expect(back.queue.size).toBe(2);
  });
});
