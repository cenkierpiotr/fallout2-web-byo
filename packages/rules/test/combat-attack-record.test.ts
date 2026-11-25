import { describe, expect, it } from 'vitest';
import {
  ATTACK_RECORD_DEFAULT,
  applyRecordDamage,
  determineToHit,
  finishToHit,
} from '../src/index.js';

describe('rekord walki 0x51094c (D, asm 0x422fdb, 0x4243a8 krok 12)', () => {
  it('domyslny rekord (AI 0x426a29): max INT_MAX, reszta 0', () => {
    expect(ATTACK_RECORD_DEFAULT).toEqual({
      apBonus: 0,
      toHitBonus: 0,
      damageBonus: 0,
      minDamage: 0,
      maxDamage: 0x7fffffff,
    });
  });
  it('obrazenia: +0x10, potem dolne ograniczenie +0x14, potem gorne +0x18', () => {
    const r = { ...ATTACK_RECORD_DEFAULT, damageBonus: 5, minDamage: 10, maxDamage: 20 };
    expect(applyRecordDamage(3, r)).toBe(10); // 8 < 10
    expect(applyRecordDamage(12, r)).toBe(17);
    expect(applyRecordDamage(30, r)).toBe(20);
  });
  it('gdy min > max wygrywa max (max stosowane jako ostatnie)', () => {
    expect(applyRecordDamage(0, { ...ATTACK_RECORD_DEFAULT, minDamage: 30, maxDamage: 20 })).toBe(
      20,
    );
  });
  it('brak rekordu = brak zmiany', () => {
    expect(applyRecordDamage(42, null)).toBe(42);
  });
  it('szansa trafienia: +0xc po swietle, przed oczami/lezacym/trudnoscia, przed przycieciem 95', () => {
    expect(finishToHit({ skillAfterDistance: 40, part: 3, recordBonus: 25 })).toBe(65);
    expect(finishToHit({ skillAfterDistance: 80, part: 3, recordBonus: 30 })).toBe(95);
    expect(finishToHit({ skillAfterDistance: 40, part: 3, recordBonus: -50 })).toBe(-10);
    expect(determineToHit({ skill: 50, part: 3, ranged: false, recordBonus: 10 })).toBe(60);
  });
});

describe('dolna granica szansy trafienia (0x424791, D)', () => {
  it('brak przyciecia do 0: wynik ujemny, floor -100', async () => {
    const { finishToHit: f, displayToHit, TO_HIT_MIN } = await import('../src/index.js');
    expect(f({ skillAfterDistance: 10, part: 6 })).toBe(-50);
    expect(f({ skillAfterDistance: -200, part: 6 })).toBe(TO_HIT_MIN);
    expect(displayToHit(-50)).toBe(0);
  });
});
