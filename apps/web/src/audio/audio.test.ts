import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { PHONEME_TO_FRAME } from '@f2/audio';
import { FakeAudioContext } from '../../../../packages/audio/test/fakes';
import { buildLip } from '../../../../packages/audio/test/lip-helpers';
import { AudioSystem, type AudioSystemDeps } from './audio-system';
import { DialogAudio, bindDialogAudio, type DialogCue } from './dialog-audio';
import { MusicDirector } from './music-director';
import { lipPath, musicPath, speechPath } from './paths';

const RATE = 1000;
const lip = buildLip({
  phonemes: [1, 9],
  markers: [
    [1, 0],
    [1, 1000],
    [1, 2000],
  ],
});

function setup(files: Record<string, Uint8Array> = {}) {
  const ctx = new FakeAudioContext();
  const baseGain = ctx.createGain.bind(ctx);
  ctx.createGain = () => {
    const g = baseGain();
    Object.assign(g.gain, { setValueAtTime: () => g.gain, linearRampToValueAtTime: () => g.gain });
    return g;
  };
  const opened: string[] = [];
  const vfs = {
    resolve: (p: string) => (p in files ? {} : undefined),
    open: async (p: string) => {
      opened.push(p);
      const f = files[p];
      if (!f) throw new Error('brak');
      return f;
    },
  };
  const decode = vi.fn(async () => ({
    header: { channels: 1 as const, sampleRate: RATE },
    samples: new Int16Array(1000),
  }));
  const handle = {
    header: { channels: 1 as const, sampleRate: RATE },
    read: vi.fn(async () => ({ samples: new Int16Array(10), done: false })),
    seek: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  const openStream = vi.fn(async () => handle);
  const nodes: { posted: unknown[] }[] = [];
  let rafCb: (() => void) | null = null;
  const deps: AudioSystemDeps = {
    ctx: ctx as unknown as AudioContext,
    vfs,
    acm: { decode, openStream } as never,
    createNode: () => {
      const n = {
        posted: [] as unknown[],
        port: {
          postMessage(m: unknown) {
            n.posted.push(m);
          },
          onmessage: null,
        },
        connect() {},
        disconnect() {},
      };
      nodes.push(n);
      return n as never;
    },
    raf: (cb) => {
      rafCb = cb;
      return 1;
    },
    caf: () => {
      rafCb = null;
    },
    schedule: () => 0,
  };
  const tick = () => {
    const f = rafCb;
    rafCb = null;
    f?.();
  };
  return { ctx, deps, decode, openStream, handle, nodes, opened, tick, sys: new AudioSystem(deps) };
}

describe('sciezki audio', () => {
  it('buduje sciezki mowy, ust i muzyki malymi literami', () => {
    expect(speechPath('BOSSS', 'SSA2')).toBe('sound/speech/bosss/ssa2.acm');
    expect(lipPath('BOSSS', 'SSA2')).toBe('sound/speech/bosss/ssa2.lip');
    expect(musicPath('07Desert')).toBe('sound/music/07desert.acm');
  });
});

describe('AudioSystem', () => {
  it('laczy mikser: mowa -> kanal speech, muzyka -> kanal music, master -> destination', async () => {
    const { sys, ctx } = setup({ 'sound/speech/a/b.acm': new Uint8Array(4) });
    await sys.speech.say('sound/speech/a/b.acm');
    const speechGain = sys.mixer.channel('speech');
    expect(ctx.sources[0]!.connected).toContain(speechGain);
    expect(sys.mixer.getVolume('master')).toBe(1);
  });

  it('adapter dekodera zamienia {header,samples} na {pcm,channels,sampleRate}', async () => {
    const { sys, decode } = setup({ 'sound/speech/a/b.acm': new Uint8Array(4) });
    const h = await sys.speech.say('sound/speech/a/b.acm');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(h.durationMs).toBe(1000);
  });

  it('resume() wznawia kontekst i jest idempotentne', async () => {
    const { sys, ctx } = setup();
    await sys.resume();
    await sys.resume();
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1);
  });

  it('woluminy z ustawien trafiaja do miksera', () => {
    const { sys } = setup();
    sys.applyVolumes({ master: 0.5, music: 0.25, sfx: 1, speech: 0.75 });
    expect(sys.mixer.getVolume('master')).toBe(0.5);
    expect(sys.mixer.getVolume('music')).toBe(0.25);
    expect(sys.mixer.getVolume('speech')).toBe(0.75);
  });

  it('dispose zatrzymuje mowe i muzyke', async () => {
    const { sys, ctx } = setup({ 'sound/speech/a/b.acm': new Uint8Array(4) });
    await sys.speech.say('sound/speech/a/b.acm');
    sys.dispose();
    expect(ctx.sources[0]!.stopCalls).toBe(1);
  });
});

describe('DialogAudio', () => {
  const files = {
    'sound/speech/a/b.acm': new Uint8Array(4),
    'sound/speech/a/b.lip': lip,
  };
  const cue: DialogCue = {
    speechPath: 'sound/speech/a/b.acm',
    lipPath: 'sound/speech/a/b.lip',
    subtitle: 'Czesc',
  };

  it('show(): gra mowe, publikuje napis i klatki ust, na koncu zeruje usta', async () => {
    const { sys, ctx, tick } = setup(files);
    const da = new DialogAudio(sys.speech);
    await da.show(cue);
    expect(da.subtitle.value).toBe('Czesc');
    expect(da.speaking.value).toBe(true);
    tick();
    expect(da.mouth.value).toBe(PHONEME_TO_FRAME[1]);
    ctx.sources[0]!.finish();
    expect(da.speaking.value).toBe(false);
    expect(da.mouth.value).toBe(0);
  });

  it('brak pliku mowy: napis zostaje, brak wyjatku, blad w sygnale', async () => {
    const { sys } = setup({});
    const da = new DialogAudio(sys.speech);
    await expect(da.show(cue)).resolves.toBeUndefined();
    expect(da.subtitle.value).toBe('Czesc');
    expect(da.speaking.value).toBe(false);
    expect(da.error.value).toMatch(/brak pliku mowy/);
  });

  it('show(undefined) i close() zatrzymuja mowe i czyszcza napis', async () => {
    const { sys, ctx } = setup(files);
    const da = new DialogAudio(sys.speech);
    await da.show(cue);
    da.close();
    expect(ctx.sources[0]!.stopCalls).toBe(1);
    expect(da.subtitle.value).toBeNull();
    await da.show(cue);
    await da.show(undefined);
    expect(ctx.sources[1]!.stopCalls).toBe(1);
    expect(da.speaking.value).toBe(false);
  });

  it('nowsze show() uniewaznia starsze (wyscig dwoch wezlow)', async () => {
    const { sys, ctx } = setup(files);
    const da = new DialogAudio(sys.speech);
    const p1 = da.show(cue);
    const p2 = da.show({ ...cue, subtitle: 'Drugie' });
    await Promise.all([p1, p2]);
    expect(da.subtitle.value).toBe('Drugie');
    // zywe jest co najwyzej jedno zrodlo
    expect(ctx.sources.filter((s) => s.stopCalls === 0).length).toBeLessThanOrEqual(1);
  });

  it('bindDialogAudio: zmiana wezla gra nowa kwestie, null zatrzymuje', async () => {
    const { sys, ctx } = setup(files);
    const da = new DialogAudio(sys.speech);
    const dialog = signal<{ npcText: string } | null>(null);
    const stop = bindDialogAudio(da, dialog, (v) => ({ ...cue, subtitle: v.npcText }));
    dialog.value = { npcText: 'Jeden' };
    await vi.waitFor(() => expect(da.speaking.value).toBe(true));
    expect(da.subtitle.value).toBe('Jeden');
    dialog.value = null;
    expect(da.speaking.value).toBe(false);
    expect(ctx.sources[0]!.stopCalls).toBe(1);
    stop();
    dialog.value = { npcText: 'Dwa' };
    await Promise.resolve();
    expect(ctx.sources).toHaveLength(1);
  });
});

describe('MusicDirector', () => {
  it('gra muzyke mapy z crossfadem, nie powtarza tego samego utworu', async () => {
    const { sys, nodes, opened } = setup({ 'sound/music/07desert.acm': new Uint8Array(4) });
    const md = new MusicDirector(sys.music, (p) => p === 'sound/music/07desert.acm');
    await md.onMap('07desert');
    await md.onMap('07desert');
    expect(nodes).toHaveLength(1);
    expect(opened).toEqual(['sound/music/07desert.acm']);
    expect(md.current.value).toBe('07desert');
  });

  it('brak pliku muzyki (np. pusty sound/music): cisza, bez wyjatku, blad zapisany', async () => {
    const { sys, nodes } = setup({});
    const md = new MusicDirector(sys.music, () => false);
    await expect(md.onMap('07desert')).resolves.toBeUndefined();
    expect(nodes).toHaveLength(0);
    expect(md.current.value).toBeNull();
    expect(md.error.value).toMatch(/07desert/);
  });

  it('mapa bez muzyki zatrzymuje poprzednia', async () => {
    const { sys } = setup({ 'sound/music/a.acm': new Uint8Array(4) });
    const md = new MusicDirector(sys.music, () => true);
    await md.onMap('a');
    await md.onMap(undefined);
    expect(md.current.value).toBeNull();
    expect(sys.music.current).toBeNull();
  });
});

describe('AudioSystem sfx', () => {
  it('gra efekt przez kanal sfx miksera', async () => {
    const { sys, ctx } = setup({ 'sound/sfx/hmxxxxaa.acm': new Uint8Array(4) });
    const h = await sys.sfx.play(['HFXXXXAA', 'HMXXXXAA']);
    expect(h?.name).toBe('HMXXXXAA');
    expect(ctx.sources).toHaveLength(1);
  });
});
