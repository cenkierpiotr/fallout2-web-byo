import { describe, expect, it } from 'vitest';
import { Mixer } from '../src/mixer/Mixer.js';
import { FakeAudioContext } from './fakes.js';

const make = (initial?: Record<string, number>) => {
  const ctx = new FakeAudioContext();
  const mixer = new Mixer(ctx as unknown as AudioContext, initial);
  return { ctx, mixer };
};

describe('Mixer', () => {
  it('clampuje glosnosc do 0..1', () => {
    const { mixer } = make();
    mixer.setVolume('music', 2);
    expect(mixer.getVolume('music')).toBe(1);
    mixer.setVolume('sfx', -1);
    expect(mixer.getVolume('sfx')).toBe(0);
    mixer.setVolume('sfx', Number.NaN);
    expect(mixer.getVolume('sfx')).toBe(0);
  });

  it('stosuje krzywa v*v przez setTargetAtTime', () => {
    const { mixer } = make();
    mixer.setVolume('speech', 0.5);
    const g = mixer.channel('speech');
    expect(g.gain.value).toBeCloseTo(0.25, 5);
  });

  it('wartosci poczatkowe i domyslne', () => {
    const { mixer } = make({ music: 0.4 });
    expect(mixer.getVolume('music')).toBe(0.4);
    expect(mixer.getVolume('master')).toBe(1);
    expect(mixer.getVolume('sfx')).toBe(1);
  });

  it('kanaly sa polaczone: kanal -> master -> destination', () => {
    const { ctx, mixer } = make();
    const sfx = mixer.channel('sfx');
    expect(sfx).toBe(mixer.channel('sfx'));
    const master = (sfx as unknown as { connected: unknown[] }).connected[0];
    expect(master).toBeDefined();
    expect((master as { connected: unknown[] }).connected[0]).toBe(ctx.destination);
  });

  it('fromCfg(22281) ~ 0.68', () => {
    expect(Mixer.fromCfg(22281)).toBeGreaterThan(0.67);
    expect(Mixer.fromCfg(22281)).toBeLessThan(0.69);
    expect(Mixer.fromCfg(0)).toBe(0);
    expect(Mixer.fromCfg(99999)).toBe(1);
    expect(Mixer.fromCfg(-5)).toBe(0);
  });

  it('resumeOnGesture: pointerdown wola resume dokladnie raz i zdejmuje listener', async () => {
    const { ctx, mixer } = make();
    const target = new EventTarget();
    mixer.resumeOnGesture(target);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    expect(ctx.resumeCalls).toBe(1);
  });

  it('resumeOnGesture: keydown tez dziala, a juz dzialajacy kontekst nie jest wznawiany', () => {
    const { ctx, mixer } = make();
    const t1 = new EventTarget();
    mixer.resumeOnGesture(t1);
    t1.dispatchEvent(new Event('keydown'));
    expect(ctx.resumeCalls).toBe(1);
    const t2 = new EventTarget();
    mixer.resumeOnGesture(t2);
    t2.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumeCalls).toBe(1);
  });

  it('bindFocusMute: blur wycisza master w 50 ms, focus przywraca', () => {
    const { ctx, mixer } = make();
    mixer.setVolume('master', 0.8);
    const win = new EventTarget();
    mixer.bindFocusMute(win as unknown as Window);
    ctx.currentTime = 10;
    win.dispatchEvent(new Event('blur'));
    const master = (
      mixer.channel('sfx') as unknown as {
        connected: { gain: { targets: { value: number; time: number; tc: number }[] } }[];
      }
    ).connected[0]!;
    const last = master.gain.targets.at(-1)!;
    expect(last.value).toBe(0);
    expect(last.tc * 5).toBeLessThanOrEqual(0.05);
    win.dispatchEvent(new Event('focus'));
    expect(master.gain.targets.at(-1)!.value).toBeCloseTo(0.64, 5);
  });

  it('setVolume(master) w czasie blur nie odmutowuje, ale focus uzywa nowej wartosci', () => {
    const { mixer } = make();
    const win = new EventTarget();
    mixer.bindFocusMute(win as unknown as Window);
    win.dispatchEvent(new Event('blur'));
    mixer.setVolume('master', 0.5);
    const master = (mixer.channel('sfx') as unknown as { connected: { gain: { value: number } }[] })
      .connected[0]!;
    expect(master.gain.value).toBe(0);
    expect(mixer.getVolume('master')).toBe(0.5);
    win.dispatchEvent(new Event('focus'));
    expect(master.gain.value).toBeCloseTo(0.25, 5);
  });
});
