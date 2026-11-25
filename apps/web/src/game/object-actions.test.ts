import { describe, expect, it, vi } from 'vitest';
import type { GameObject, ScriptRuntime } from '@f2/engine-core';
import { actionFlags, runLook, runObjectAction, runUseItemOn, usableItems } from './object-actions';

const obj = (o: Partial<GameObject>): GameObject =>
  ({
    id: 1,
    type: 1,
    hex: 100,
    elevation: 0,
    flags: 0,
    inventory: [],
    proto: { kind: 'critter' },
    ...o,
  }) as unknown as GameObject;

function rt(procs: string[], over: { overridden?: boolean; error?: boolean } = {}) {
  return {
    hasObjectProc: (_id: number, p: string) => procs.includes(p),
    runObjectProc: vi.fn((p: string) =>
      procs.includes(p)
        ? { ran: true, overridden: over.overridden ?? false, error: over.error ?? false }
        : { ran: false, overridden: false, error: false },
    ),
    useItemOn: vi.fn(() => ({
      ran: procs.includes('use_obj_on_p_proc'),
      overridden: false,
      error: false,
    })),
  } as unknown as ScriptRuntime & {
    runObjectProc: ReturnType<typeof vi.fn>;
    useItemOn: ReturnType<typeof vi.fn>;
  };
}

const stim = obj({ id: 50, type: 0, hex: -1, proto: { kind: 'item', subtype: 2 } as never });
const worn = obj({
  id: 51,
  type: 0,
  hex: -1,
  flags: 0x02000000,
  proto: { kind: 'item', subtype: 0 } as never,
});
const player = obj({ id: 9, hex: 100, inventory: [stim, worn] });

describe('actionFlags', () => {
  it('zalezne od procedur skryptu i inwentarza', () => {
    const d = {
      player: () => player,
      scripts: () => rt(['use_p_proc', 'push_p_proc', 'use_obj_on_p_proc']),
    };
    expect(actionFlags(obj({ id: 2 }), d)).toEqual({ use: true, push: true, useItem: true });
    expect(actionFlags(obj({ id: 2 }), { player: () => player, scripts: () => rt([]) })).toEqual(
      {},
    );
    expect(actionFlags(undefined, d)).toEqual({});
  });
  it('przedmiot na ziemi: pickup; push tylko dla krytykow', () => {
    const item = obj({ id: 3, type: 0, hex: 105, proto: { kind: 'item', subtype: 2 } as never });
    const f = actionFlags(item, { player: () => player, scripts: () => rt(['push_p_proc']) });
    expect(f.pickup).toBe(true);
    expect(f.push).toBeUndefined();
  });
  it('Podnies: tylko przedmioty na ziemi, nie pojemniki ani przedmioty z ekwipunku (hex<0)', () => {
    const sp = { player: () => player, scripts: () => rt([]) };
    expect(
      actionFlags(
        obj({ id: 6, type: 0, hex: 105, proto: { kind: 'item', subtype: 1 } as never }),
        sp,
      ).pickup,
    ).toBeUndefined();
    expect(
      actionFlags(
        obj({ id: 7, type: 0, hex: -1, proto: { kind: 'item', subtype: 2 } as never }),
        sp,
      ).pickup,
    ).toBeUndefined();
    expect(actionFlags(obj({ id: 8, type: 2, hex: 105 }), sp).pickup).toBeUndefined();
  });
  it('usableItems pomija zalozone', () => {
    expect(usableItems(player).map((i) => i.id)).toEqual([50]);
  });
});

describe('akcje', () => {
  const mk = (r: ReturnType<typeof rt>, pickup = vi.fn(() => ({ ok: true }))) => ({
    player: () => player,
    scripts: () => r,
    pickup,
  });
  const near = obj({ id: 4, hex: 101 });

  it('look: zwraca czy skrypt nadpisal opis', () => {
    expect(runLook(near, mk(rt(['look_at_p_proc'], { overridden: true })))).toBe(true);
    expect(runLook(near, mk(rt([])))).toBe(false);
  });
  it('use: wola use_p_proc; brak procedury = Nic sie nie dzieje', () => {
    const r = rt(['use_p_proc']);
    expect(runObjectAction('use', near, mk(r))).toBeNull();
    expect(r.runObjectProc).toHaveBeenCalledWith('use_p_proc', 4, 9);
    expect(runObjectAction('use', near, mk(rt([])))).toEqual({ key: 'menu.noEffect' });
  });
  it('za daleko i inny poziom', () => {
    expect(runObjectAction('use', obj({ hex: 2100 }), mk(rt(['use_p_proc'])))).toEqual({
      key: 'menu.tooFar',
    });
    expect(runObjectAction('use', obj({ hex: 101, elevation: 1 }), mk(rt(['use_p_proc'])))).toEqual(
      { key: 'menu.tooFar' },
    );
  });
  it('pickup: skrypt nadpisuje = brak domyslnego podniesienia', () => {
    const pk = vi.fn(() => ({ ok: true }));
    expect(
      runObjectAction('pickup', near, mk(rt(['pickup_p_proc'], { overridden: true }), pk)),
    ).toBeNull();
    expect(pk).not.toHaveBeenCalled();
    expect(runObjectAction('pickup', near, mk(rt(['pickup_p_proc']), pk))).toBeNull();
    expect(pk).toHaveBeenCalledOnce();
  });
  it('pickup: bez skryptu podnosi, porazka daje komunikat', () => {
    expect(
      runObjectAction(
        'pickup',
        near,
        mk(
          rt([]),
          vi.fn(() => ({ ok: false, reason: 'too-heavy' })),
        ),
      ),
    ).toEqual({ key: 'menu.tooHeavy' });
    expect(
      runObjectAction(
        'pickup',
        near,
        mk(
          rt([]),
          vi.fn(() => ({ ok: false })),
        ),
      ),
    ).toEqual({ key: 'menu.pickupFailed' });
  });
  it('blad skryptu', () => {
    expect(runObjectAction('push', near, mk(rt(['push_p_proc'], { error: true })))).toEqual({
      key: 'menu.scriptError',
    });
  });
  it('use item on: wola useItemOn tylko dla przedmiotu gracza', () => {
    const r = rt(['use_obj_on_p_proc']);
    expect(runUseItemOn(50, near, mk(r))).toBeNull();
    expect(r.useItemOn).toHaveBeenCalledWith(9, 50, 4);
    expect(runUseItemOn(999, near, mk(r))).toEqual({ key: 'menu.noEffect' });
  });
});
