import { describe, expect, it } from 'vitest';
import type { GameObject } from '@f2/engine-core';
import { makeWorldDoorPolicy } from './door-policy';

const TYPE_CRITTER = 1;
const TYPE_SCENERY = 2;

const critter = (id: number, proto: object): GameObject =>
  ({
    id,
    type: TYPE_CRITTER,
    proto: { kind: 'critter', ...proto },
    extra: { kind: 'critter' },
  }) as never;
const door: GameObject = {
  id: 99,
  type: TYPE_SCENERY,
  proto: { kind: 'scenery', subtype: 0 },
  extra: { kind: 'door', raw: [0] },
  flags: 0,
} as never;

const lockedDoor: GameObject = {
  ...(door as object),
  id: 98,
  extra: { kind: 'door', raw: [2] },
} as never;

describe('makeWorldDoorPolicy: gracz i zamki', () => {
  const player = critter(1, { bodyType: 0, killType: 0 });
  it('zamkniete na klucz: blokada bez klucza', () => {
    const p = makeWorldDoorPolicy((o) => o.id === 1);
    expect(p(player, lockedDoor)).toBe(false);
  });
  it('zamkniete na klucz: przechodnie z pasujacym kluczem', () => {
    const p = makeWorldDoorPolicy(
      (o) => o.id === 1,
      (_pl, d) => d === lockedDoor,
    );
    expect(p(player, lockedDoor)).toBe(true);
  });
  it('NPC nie korzysta z klucza gracza', () => {
    const p = makeWorldDoorPolicy(
      (o) => o.id === 1,
      () => true,
    );
    expect(p(critter(2, { bodyType: 0, killType: 0 }), lockedDoor)).toBe(false);
  });
  it('pies towarzysz (typ ciala 1) i robot 0xf nie wchodza, robot typ 2 tak', () => {
    const p = makeWorldDoorPolicy((o) => o.id === 1);
    expect(p(critter(5, { bodyType: 1, killType: 1 }), door)).toBe(false);
    expect(p(critter(6, { bodyType: 2, killType: 0xe }), door)).toBe(true);
    expect(p(critter(7, { bodyType: 2, killType: 0xf }), door)).toBe(false);
  });
});

describe('makeWorldDoorPolicy', () => {
  const player = critter(1, { bodyType: 0, killType: 0 });
  const policy = makeWorldDoorPolicy((o) => o.id === 1);

  it('gracz przechodzi przez drzwi (domyslna regula, ruch otwiera drzwi)', () => {
    expect(policy(player, door)).toBe(true);
  });
  it('humanoid NPC przechodzi', () => {
    expect(policy(critter(2, { bodyType: 0, killType: 0 }), door)).toBe(true);
  });
  it('czworonog (typ ciala 1) nie przechodzi', () => {
    expect(policy(critter(3, { bodyType: 1, killType: 1 }), door)).toBe(false);
  });
  it('typ zabicia 0xf nie przechodzi', () => {
    expect(policy(critter(4, { bodyType: 0, killType: 0xf }), door)).toBe(false);
  });
});
