import { describe, expect, it } from 'vitest';
import { parseSve } from './sve.js';

describe('parseSve', () => {
  const elder =
    '25:Come in, Chosen One. There are things you must know.\r\n120:The village is dying. The signs are everywhere.\r\n670:\r\n765:This will be your quest if you prove yourself worthy.\r\n';
  it('pierwszy cue elder', () => {
    const c = parseSve(elder);
    expect(c[0]).toEqual({
      frame: 25,
      text: 'Come in, Chosen One. There are things you must know.',
    });
    expect(c).toHaveLength(4);
  });
  it('pusty cue (wyczyszczenie) zachowany', () => {
    expect(parseSve(elder)[2]).toEqual({ frame: 670, text: '' });
  });
  it('ignoruje puste linie i smieci', () => {
    expect(parseSve('\r\n\r\nbez dwukropka\r\nx:zle\r\n:tekst\r\n5:ok\r\n')).toEqual([
      { frame: 5, text: 'ok' },
    ]);
  });
  it('dzieli po pierwszym dwukropku', () => {
    expect(parseSve('10:a: b')).toEqual([{ frame: 10, text: 'a: b' }]);
  });
  it('sortuje stabilnie', () => {
    expect(parseSve('50:b\n10:a\n50:c').map((c) => c.text)).toEqual(['a', 'b', 'c']);
  });
  it('BOM na poczatku', () => {
    expect(parseSve('﻿1:x')).toEqual([{ frame: 1, text: 'x' }]);
  });
});
