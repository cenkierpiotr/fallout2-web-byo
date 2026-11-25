import { describe, expect, it } from 'vitest';
import { TimerQueue } from '../scheduler.js';

describe('TimerQueue: snapshot/restore', () => {
  it('snapshot zwraca bezwzgledne czasy, wg sid, bez usuwania', () => {
    const q = new TimerQueue();
    q.add(1, 50, 7);
    q.add(2, 80, 8);
    q.add(1, 30, 9);
    expect(q.snapshot((s) => s === 1)).toEqual([
      { sid: 1, atTick: 30, fixedParam: 9 },
      { sid: 1, atTick: 50, fixedParam: 7 },
    ]);
    expect(q.size).toBe(3);
  });
  it('extract usuwa i zwraca timery pasujace do filtra', () => {
    const q = new TimerQueue();
    q.add(1, 50, 7);
    q.add(2, 80, 8);
    expect(q.extract((s) => s === 1)).toEqual([{ sid: 1, atTick: 50, fixedParam: 7 }]);
    expect(q.size).toBe(1);
  });
  it('restore dodaje timery z zachowaniem czasu i kolejnosci FIFO', () => {
    const q = new TimerQueue();
    q.restore([
      { sid: 3, atTick: 10, fixedParam: 1 },
      { sid: 3, atTick: 10, fixedParam: 2 },
    ]);
    expect(q.due(10)).toEqual([
      { sid: 3, fixedParam: 1 },
      { sid: 3, fixedParam: 2 },
    ]);
  });
});
