import { describe, expect, it } from 'vitest';
import { EventQueue, type GameEvent } from '../src/index.js';

const ev = (
  atTick: number,
  kind: GameEvent['kind'],
  objId = 1,
  payload: unknown = null,
): GameEvent => ({
  atTick,
  kind,
  objId,
  payload,
});

describe('EventQueue', () => {
  it('processes events in order (time, then FIFO) and removes them', () => {
    const q = new EventQueue();
    const seen: string[] = [];
    q.add(ev(20, 'poison', 1));
    q.add(ev(10, 'knockout', 2));
    q.add(ev(10, 'drug-revert', 3));
    q.processUntil(15, (e) => {
      seen.push(`${e.kind}:${e.objId}`);
      return 0;
    });
    expect(seen).toEqual(['knockout:2', 'drug-revert:3']);
    expect(q.size).toBe(1);
    expect(q.nextTime()).toBe(20);
    q.processUntil(100, (e) => {
      seen.push(e.kind);
      return 0;
    });
    expect(seen).toEqual(['knockout:2', 'drug-revert:3', 'poison']);
    expect(q.size).toBe(0);
    expect(q.nextTime()).toBeNull();
  });
  it('non-zero handler result aborts processing (event already removed)', () => {
    const q = new EventQueue();
    q.add(ev(1, 'poison'));
    q.add(ev(2, 'radiation'));
    const r = q.processUntil(10, () => 1);
    expect(r).toBe(1);
    expect(q.size).toBe(1);
  });
  it('handler may add events within window', () => {
    const q = new EventQueue();
    q.add(ev(1, 'script-timer'));
    let n = 0;
    q.processUntil(5, () => {
      n++;
      if (n === 1) q.add(ev(3, 'poison'));
      return 0;
    });
    expect(n).toBe(2);
  });
  it('restore equals serialize (deep equal), keeps FIFO', () => {
    const q = new EventQueue();
    q.add(ev(5, 'poison', 1, { a: 1 }));
    q.add(ev(5, 'knockout', 2));
    q.add(ev(1, 'skill-daily-reset', 0));
    const json = JSON.parse(JSON.stringify(q.serialize()));
    const r = EventQueue.restore(json);
    expect(r.serialize()).toEqual(q.serialize());
    r.add(ev(5, 'radiation', 9));
    expect(r.serialize().map((e) => e.kind)).toEqual([
      'skill-daily-reset',
      'poison',
      'knockout',
      'radiation',
    ]);
  });
  it('removeByKind', () => {
    const q = new EventQueue();
    q.add(ev(1, 'poison'));
    q.add(ev(2, 'knockout'));
    q.removeByKind('poison');
    expect(q.serialize().map((e) => e.kind)).toEqual(['knockout']);
  });

  describe('review M5 fixes', () => {
    it('deep-copies payload on add, peek and serialize', () => {
      const q = new EventQueue();
      const payload = { a: { b: 1 } };
      q.add(ev(5, 'poison', 1, payload));
      payload.a.b = 99;
      expect((q.peek()[0]!.payload as typeof payload).a.b).toBe(1);
      (q.peek()[0]!.payload as typeof payload).a.b = 50;
      (q.serialize()[0]!.payload as typeof payload).a.b = 60;
      expect((q.peek()[0]!.payload as typeof payload).a.b).toBe(1);
    });
    it('handler exception keeps the event in the queue', () => {
      const q = new EventQueue();
      q.add(ev(1, 'poison', 1));
      q.add(ev(2, 'radiation', 2));
      expect(() =>
        q.processUntil(10, () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(q.size).toBe(2);
      expect(q.peek().map((e) => e.objId)).toEqual([1, 2]);
    });
    it('rejects non-finite atTick', () => {
      const q = new EventQueue();
      for (const t of [NaN, Infinity, -Infinity])
        expect(() => q.add(ev(t, 'poison'))).toThrow(RangeError);
      expect(q.size).toBe(0);
    });
    it('has kinds for time.md types 4 and 7-11', () => {
      const q = new EventQueue();
      for (const k of [
        'midnight',
        'flare',
        'explosion',
        'item-trickle',
        'sneak',
        'misfire',
      ] as const) {
        q.add(ev(1, k));
      }
      expect(q.size).toBe(6);
    });
  });
});
