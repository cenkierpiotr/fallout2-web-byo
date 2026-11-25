import { describe, expect, it } from 'vitest';
import { FormatError } from './errors.js';
import { parseMovieCfg } from './movie-cfg.js';

const ELDER =
  ';\r\n; movie.cfg\r\n;\r\n\r\n[info]\r\ntotal_effects=2                 ; Total.\r\neffect_frames=0,1118           ; frames\r\n\r\n[0]                             ; Frame\r\nfade_type=in                    ; x\r\nfade_color=0,0,0                ; r,g,b\r\nfade_steps=60                   ; steps\r\n\r\n[1118]                            ; x\r\nfade_type=out                   ; x\r\nfade_color=0,0,0               ; x\r\nfade_steps=30                   ; x\r\n';

describe('parseMovieCfg', () => {
  it('elder.cfg', () => {
    expect(parseMovieCfg(ELDER).effects).toEqual([
      { startFrame: 0, kind: 'in', color: [0, 0, 0], steps: 60 },
      { startFrame: 1118, kind: 'out', color: [0, 0, 0], steps: 30 },
    ]);
  });
  it('kolor, wielkosc liter, zacisk 0..63, steps min 1', () => {
    const t = '[info]\neffect_frames=30\n[30]\nFade_Type=Out\nfade_color=63,0,99\nfade_steps=0\n';
    expect(parseMovieCfg(t).effects).toEqual([
      { startFrame: 30, kind: 'out', color: [63, 0, 63], steps: 1 },
    ]);
  });
  it('total_effects niezgodne jest tolerowane', () => {
    const t =
      '[info]\ntotal_effects=5\neffect_frames=0\n[0]\nfade_type=in\nfade_color=0,0,0\nfade_steps=2\n';
    expect(parseMovieCfg(t).effects).toHaveLength(1);
  });
  it('sortuje po startFrame', () => {
    const t =
      '[info]\neffect_frames=9,3\n[9]\nfade_type=in\nfade_color=0,0,0\nfade_steps=2\n[3]\nfade_type=out\nfade_color=0,0,0\nfade_steps=2\n';
    expect(parseMovieCfg(t).effects.map((e) => e.startFrame)).toEqual([3, 9]);
  });
  it('bledy: brak info, brak sekcji, zly typ, zle liczby', () => {
    expect(() => parseMovieCfg('[0]\nfade_type=in\n')).toThrow(FormatError);
    expect(() => parseMovieCfg('[info]\neffect_frames=4\n')).toThrow(FormatError);
    expect(() =>
      parseMovieCfg(
        '[info]\neffect_frames=0\n[0]\nfade_type=zoom\nfade_color=0,0,0\nfade_steps=1\n',
      ),
    ).toThrow(FormatError);
    expect(() =>
      parseMovieCfg('[info]\neffect_frames=0\n[0]\nfade_type=in\nfade_color=a,0,0\nfade_steps=1\n'),
    ).toThrow(FormatError);
    expect(() => parseMovieCfg('[info]\neffect_frames=x\n')).toThrow(FormatError);
  });
});
