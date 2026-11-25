import { describe, expect, it } from 'vitest';
import { EncounterDslError, parseCondition } from './encounter-dsl.js';

describe('parseCondition', () => {
  it('porownanie Player(Level)', () => {
    expect(parseCondition('If (Player(Level) > 4)')).toEqual({
      op: '>',
      left: { kind: 'player', stat: 'Level' },
      right: { kind: 'const', value: 4 },
    });
  });
  it('Rand', () => {
    expect(parseCondition('If (Rand(30%))')).toEqual({ kind: 'rand', pct: 30 });
    expect(parseCondition('If(Rand(5%))')).toEqual({ kind: 'rand', pct: 5 });
  });
  it('and, Global, Time', () => {
    expect(parseCondition('If (Global(123) == 1) and If (Time > 600)')).toEqual({
      op: 'and',
      left: { op: '==', left: { kind: 'global', idx: 123 }, right: { kind: 'const', value: 1 } },
      right: { op: '>', left: { kind: 'time' }, right: { kind: 'const', value: 600 } },
    });
  });
  it('time_of_day, liczby ujemne, And wielokrotne (lewostronnie)', () => {
    const e = parseCondition(
      'If(Global(5) < -3)  And If(time_of_day > 19) And If(Player(Level) < 9)',
    );
    expect(e).toMatchObject({
      op: 'and',
      left: { op: 'and', left: { op: '<', right: { kind: 'const', value: -3 } } },
    });
  });
  it('Enctr(Num_Critters)', () => {
    expect(parseCondition('If (Enctr(Num_Critters) >= 2)')).toMatchObject({
      op: '>=',
      left: { kind: 'enctr', what: 'Num_Critters' },
    });
  });
  it('nieznana funkcja rzuca z kolumna', () => {
    try {
      parseCondition('If (Foo(1) > 2)');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EncounterDslError);
      expect((e as EncounterDslError).column).toBe(5);
    }
  });
  it('smieci na koncu rzucaja', () => {
    expect(() => parseCondition('If (Rand(5%)) xyz')).toThrow(EncounterDslError);
  });
});
