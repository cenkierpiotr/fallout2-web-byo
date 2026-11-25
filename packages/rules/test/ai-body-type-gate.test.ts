import { describe, expect, it } from 'vitest';
import { PID_DOGMEAT, aiMayPickInventoryWeapon } from '../src/combat/weapon-choice.js';

describe('bramka body_type 0x4299a0 (D)', () => {
  it('biped i robot moga wybierac bron z ekwipunku', () => {
    expect(aiMayPickInventoryWeapon(0, 0x1000001)).toBe(true);
    expect(aiMayPickInventoryWeapon(2, 0x1000001)).toBe(true);
  });
  it('czworonog (1) i inne typy nie, chyba ze to Dogmeat', () => {
    expect(aiMayPickInventoryWeapon(1, 0x1000001)).toBe(false);
    expect(aiMayPickInventoryWeapon(3, 0x1000001)).toBe(false);
    expect(aiMayPickInventoryWeapon(1, PID_DOGMEAT)).toBe(true);
  });
});
