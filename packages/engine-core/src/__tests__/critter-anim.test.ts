import { describe, expect, it, vi } from 'vitest';
import {
  Anim,
  AnimDirector,
  ClipPlayer,
  animFileChars,
  isDeathAnim,
  isLoopingAnim,
} from '../index.js';

describe('animFileChars (R2, 0x419314)', () => {
  it('stoi/chod/bieg bez broni i z bronia', () => {
    expect(animFileChars(Anim.Stand, 0)).toBe('aa');
    expect(animFileChars(Anim.Walk, 0)).toBe('ab');
    expect(animFileChars(Anim.Running, 0)).toBe('at');
    expect(animFileChars(Anim.Stand, 1)).toBe('da');
    expect(animFileChars(Anim.Walk, 4)).toBe('gb');
    // poza stoi/chod bron nie zmienia nazwy
    expect(animFileChars(Anim.HitFromFront, 3)).toBe('ao');
  });
  it('uniki, rzut, wyjatki broni', () => {
    expect(animFileChars(Anim.Dodge, 0)).toBe('an');
    expect(animFileChars(Anim.Dodge, 2)).toBe('ee');
    expect(animFileChars(Anim.Throw, 0)).toBe('as');
    expect(animFileChars(Anim.Throw, 1)).toBe('dm');
    expect(animFileChars(Anim.Throw, 4)).toBe('gm');
  });
  it('smierci i wstawanie', () => {
    expect(animFileChars(Anim.FallBack, 0)).toBe('ba');
    expect(animFileChars(Anim.FallFront, 0)).toBe('bb');
    expect(animFileChars(Anim.FallFrontBlood, 0)).toBe('bp');
    expect(animFileChars(Anim.ProneToStanding, 0)).toBe('ch');
    expect(animFileChars(Anim.BackToStanding, 0)).toBe('cj');
    expect(animFileChars(Anim.SfDeathFirst, 0)).toBe('ra');
    expect(animFileChars(Anim.CalledShotPic, 0)).toBe('na');
  });
  it('akcje z bronia: wyjmij, strzel; bez broni niepoprawne', () => {
    expect(animFileChars(Anim.TakeOut, 1)).toBe('dc');
    expect(animFileChars(Anim.FireSingle, 5)).toBe('hj');
    expect(animFileChars(Anim.FireBurst, 6)).toBe('ik');
    expect(animFileChars(Anim.TakeOut, 0)).toBeUndefined();
    expect(animFileChars(Anim.Stand, 11)).toBeUndefined();
    expect(animFileChars(Anim.Stand, -1)).toBeUndefined();
  });
  it('klasyfikacja', () => {
    expect(isDeathAnim(Anim.FallBack)).toBe(true);
    expect(isDeathAnim(Anim.BadLanding)).toBe(false);
    expect(isDeathAnim(Anim.ExplodedToNothing)).toBe(true);
    expect(isDeathAnim(Anim.Walk)).toBe(false);
    expect(isLoopingAnim(Anim.Running)).toBe(true);
    expect(isLoopingAnim(Anim.ThrowPunch)).toBe(false);
  });
});

describe('ClipPlayer', () => {
  it('klatki wg fps i zatrzymanie na ostatniej', () => {
    const p = new ClipPlayer({ frames: 4, fps: 10, actionFrame: 2 }, false);
    expect(p.frame).toBe(0);
    p.advance(99);
    expect(p.frame).toBe(0);
    p.advance(2);
    expect(p.frame).toBe(1);
    expect(p.done).toBe(false);
    p.advance(1000);
    expect(p.frame).toBe(3);
    expect(p.done).toBe(true);
  });
  it('petla zawija sie i nigdy nie konczy', () => {
    const p = new ClipPlayer({ frames: 3, fps: 10, actionFrame: 0 }, true);
    p.advance(350);
    expect(p.frame).toBe(0);
    p.advance(100);
    expect(p.frame).toBe(1);
    expect(p.done).toBe(false);
  });
  it('akcja odpala sie raz', () => {
    const p = new ClipPlayer({ frames: 5, fps: 10, actionFrame: 2 }, false);
    expect(p.advance(150)).toBe(false);
    expect(p.advance(100)).toBe(true);
    expect(p.advance(100)).toBe(false);
  });
  it('fps 0 uzywa domyslnych 10', () => {
    const p = new ClipPlayer({ frames: 3, fps: 0, actionFrame: 0 }, false);
    p.advance(100);
    expect(p.frame).toBe(1);
  });
});

describe('AnimDirector', () => {
  const info = () => ({ frames: 3, fps: 10, actionFrame: 1 });

  it('gra klip, odpala akcje i koniec, potem wraca do stania', () => {
    const d = new AnimDirector(info);
    const onAction = vi.fn();
    const onEnd = vi.fn();
    d.play(7, { anim: Anim.ThrowPunch, onAction, onEnd });
    expect(d.view(7)).toEqual({ anim: Anim.ThrowPunch, weapon: 0, frame: 0 });
    d.update(100);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(d.view(7)?.frame).toBe(1);
    d.update(300);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(d.view(7)).toBeUndefined();
    expect(d.isBusy(7)).toBe(false);
  });
  it('kolejka gra po kolei, play zastepuje', () => {
    const d = new AnimDirector(info);
    d.play(1, { anim: Anim.TakeOut, weapon: 1 });
    d.queue(1, { anim: Anim.FireSingle, weapon: 1 });
    d.update(300);
    expect(d.view(1)).toEqual({ anim: Anim.FireSingle, weapon: 1, frame: 0 });
    d.play(1, { anim: Anim.Dodge });
    expect(d.view(1)?.anim).toBe(Anim.Dodge);
  });
  it('smierc zostaje na ostatniej klatce', () => {
    const d = new AnimDirector(info);
    d.play(2, { anim: Anim.FallBack });
    d.update(1000);
    expect(d.view(2)).toEqual({ anim: Anim.FallBack, weapon: 0, frame: 2 });
    expect(d.isBusy(2)).toBe(false);
    d.clear(2);
    expect(d.view(2)).toBeUndefined();
  });
  it('brak pliku: klip pomijany, ale zdarzenia odpalone', () => {
    const d = new AnimDirector(() => undefined);
    const onAction = vi.fn();
    const onEnd = vi.fn();
    d.play(3, { anim: Anim.ThrowPunch, onAction, onEnd });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(d.view(3)).toBeUndefined();
  });
  it('petla chodu nie konczy sie', () => {
    const d = new AnimDirector(info);
    d.play(4, { anim: Anim.Walk });
    d.update(5000);
    expect(d.isBusy(4)).toBe(true);
  });
});
