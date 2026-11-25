import { AnimDirector, Anim } from '@f2/engine-core';
import { describe, expect, it } from 'vitest';
import { animatedFid, clipInfoOf, mapAmbient, moveAnimOf } from './critter-sprite';
import { parseFid } from './fid-path';

describe('critter-sprite', () => {
  it('animatedFid zachowuje indeks, ustawia anim i bron', () => {
    const fid = animatedFid(0x01000000 | 77, { anim: Anim.FireSingle, weapon: 5 });
    expect(parseFid(fid)).toMatchObject({
      type: 1,
      index: 77,
      anim: 45,
      weapon: 5,
      orientation: 0,
    });
  });
  it('moveAnimOf mapuje kody ruchu', () => {
    expect(moveAnimOf('AB')).toBe(Anim.Walk);
    expect(moveAnimOf('AT')).toBe(Anim.Running);
    expect(moveAnimOf('AA')).toBe(Anim.Stand);
  });
  it('clipInfoOf czyta naglowek FRM', () => {
    expect(clipInfoOf({ framesPerDirection: 6, fps: 12, actionFrame: 3 })).toEqual({
      frames: 6,
      fps: 12,
      actionFrame: 3,
    });
  });
  it('chod z AnimDirector: klatka zalezy od czasu, petla', () => {
    const d = new AnimDirector(() => ({ frames: 6, fps: 10, actionFrame: 0 }));
    d.play(1, { anim: Anim.Walk });
    d.update(250);
    expect(d.view(1)).toMatchObject({ anim: Anim.Walk, frame: 2 });
    d.update(500);
    expect(d.view(1)?.frame).toBe(1); // 750 ms = klatka 7 % 6
  });
  it('smierc zostaje na ostatniej klatce', () => {
    const d = new AnimDirector(() => ({ frames: 5, fps: 10, actionFrame: 0 }));
    d.play(2, { anim: Anim.FallBack });
    d.update(1000);
    expect(d.view(2)).toMatchObject({ anim: Anim.FallBack, frame: 4 });
  });
  it('mapAmbient: skrypt wygrywa, noc na zewnatrz ciemna, wnetrze jasne', () => {
    const outdoor = new Uint8Array(100).fill(1);
    const indoor = new Uint8Array(100).fill(5);
    expect(mapAmbient(0.5, 12, 0, outdoor)).toBe(0.5);
    expect(mapAmbient(undefined, 12, 0, outdoor)).toBe(1);
    expect(mapAmbient(undefined, 2, 0, outdoor)).toBe(0.25);
    expect(mapAmbient(undefined, 2, 0, indoor)).toBe(1);
  });
});
