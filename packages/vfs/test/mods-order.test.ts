import { describe, expect, it } from 'vitest';
import { parseModsOrder } from '../src/mods/mods-order.js';

describe('parseModsOrder', () => {
  it('test_mods_order_ignores_comments_and_missing', () => {
    expect(parseModsOrder('\n  ModA\n# c\n; c\n// c\nModB\n\n  ModC  \n')).toEqual([
      'ModA',
      'ModB',
      'ModC',
    ]);
  });

  it('test_mods_order_bom_crlf', () => {
    expect(parseModsOrder('﻿A\r\nB\rC\nD')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('test_mods_order_duplicates_keep_last', () => {
    expect(parseModsOrder('A\nB\na')).toEqual(['B', 'a']);
  });

  it('test_mods_order_backslash_dup', () => {
    expect(parseModsOrder('My\\Mod\nMy/mod\nOther')).toEqual(['My/mod', 'Other']);
  });

  it('test_mods_order_inline_comment', () => {
    expect(parseModsOrder('A # c\nB ; c\nC#nie-komentarz')).toEqual(['A', 'B', 'C#nie-komentarz']);
  });

  it('test_mods_order_empty_text', () => {
    expect(parseModsOrder('')).toEqual([]);
    expect(parseModsOrder('\n# tylko komentarz\n')).toEqual([]);
  });
});
