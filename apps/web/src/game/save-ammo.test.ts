import { describe, expect, it } from 'vitest';
import type { GameObject } from '@f2/engine-core';
import type { Proto } from '@f2/formats';
import { ammoModsOf } from '@f2/rules';
import { toSaveItem } from './save-world';
import { itemFromSave } from './restore-world';
import { weaponFromObject } from './combat-controller';

const PID_WEAPON = 0x0000_0010;
const PID_AMMO = 0x0000_0020;

function protoOf(subtype: number, data: number[]): Proto {
  return { kind: 'item', pid: 0, subtype, flags: 0, extFlags: 0, data, fid: 0 } as unknown as Proto;
}

function weapon(raw: number[]): GameObject {
  return {
    id: 1,
    pid: PID_WEAPON,
    fid: 0,
    type: 0,
    hex: -1,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0x2000000,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    quantity: 1,
    // data: [?, min, max, dtype, range, ?, ?, minSt, ap]
    proto: protoOf(3, [0, 5, 10, 0, 20, 0, 0, 1, 4]),
    extra: { kind: 'item', subtype: 3, flags: 0, raw: Int32Array.from(raw) },
    hidden: false,
  };
}

const protos = {
  get: async (pid: number): Promise<Proto> =>
    pid === PID_AMMO ? protoOf(4, [0, 0, -20, 2, 3, 2]) : protoOf(3, [0, 5, 10, 0, 20, 0, 0, 1, 4]),
};

describe('zapis amunicji broni gracza', () => {
  it('toSaveItem zapisuje ammo i ammoPid z extra.raw broni', () => {
    const s = toSaveItem(weapon([7, PID_AMMO]));
    expect(s.ammo).toBe(7);
    expect(s.ammoPid).toBe(PID_AMMO);
  });

  it('bron bez amunicji (-1) i przedmioty niebronowe daja null', () => {
    expect(toSaveItem(weapon([0, -1])).ammoPid).toBeNull();
    expect(toSaveItem(weapon([])).ammoPid).toBeNull();
  });

  it('po wczytaniu raw[0..1] wraca i ammoModsOf/weaponFromObject daje modyfikatory', async () => {
    const back = await itemFromSave(toSaveItem(weapon([7, PID_AMMO])), protos as never);
    expect(Array.from((back.extra as { raw: Int32Array }).raw)).toEqual([7, PID_AMMO]);
    const ammoData = (pid: number) => (pid === PID_AMMO ? [0, 0, -20, 2, 3, 2] : undefined);
    expect(ammoModsOf(PID_AMMO, ammoData).acMod).toBe(-20);
    const spec = weaponFromObject(back, () => 5, [], [], ammoData);
    expect(spec?.ammoAcMod).toBe(-20);
    expect(spec?.ammoDrMod).toBe(2);
    expect(spec?.ammoMult).toBe(3);
    expect(spec?.ammoDiv).toBe(2);
  });

  it('stary zapis bez ammoPid (null) nie daje modyfikatorow', async () => {
    const back = await itemFromSave(
      { pid: PID_WEAPON, count: 1, equippedSlot: 'right', ammo: null, ammoPid: null, contents: [] },
      protos as never,
    );
    expect((back.extra as { raw: Int32Array }).raw.length).toBe(0);
    expect(
      weaponFromObject(
        back,
        () => 5,
        [],
        [],
        () => [0, 0, -20, 2, 3, 2],
      )?.ammoAcMod,
    ).toBeUndefined();
  });
});
