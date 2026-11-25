import { describe, expect, it } from 'vitest';
import { parseDdrawIni } from '../src/mods/ddraw-ini.js';

describe('parseDdrawIni', () => {
  it('test_ddraw_ini_patchfile_list_order', () => {
    const r = parseDdrawIni('[Misc]\nPatchFile10=p10\nPatchFile=main\nPatchFile2=p2\n');
    expect(r.patchFiles).toEqual(['main', 'p2', 'p10']);
  });

  it('test_ddraw_ini_comments_bom_crlf', () => {
    const r = parseDdrawIni('﻿; c\r\n# c2\r\n[General]\r\nKey1=Value1 ; inline\r\n');
    expect(r.sections['General']?.['Key1']).toBe('Value1');
  });

  it('test_ddraw_ini_case_insensitive_misc_and_key', () => {
    const r = parseDdrawIni('[mISC]\nPATCHFILE=mods\\a.dat\npatchfile1=mods\\b.dat\n');
    expect(r.patchFiles).toEqual(['mods\\a.dat', 'mods\\b.dat']);
  });

  it('test_ddraw_ini_extra_sections_preserved', () => {
    const r = parseDdrawIni('[Speed]\nSpeedMulti0=50\n[Other]\nTest=Value\n');
    expect(r.sections['Speed']?.['SpeedMulti0']).toBe('50');
    expect(r.sections['Other']?.['Test']).toBe('Value');
  });

  it('test_ddraw_ini_inline_comment_and_empty_value', () => {
    const r = parseDdrawIni('[Misc]\nPatchFile=p1 ; c\nPatchFile2=\nPatchFile3=v3 ; c\n');
    expect(r.patchFiles).toEqual(['p1', 'v3']);
  });

  it('test_ddraw_ini_patchfile_outside_misc_ignored', () => {
    const r = parseDdrawIni('[General]\nPatchFile=ignored.dat\n[Misc]\nPatchFile=valid.dat\n');
    expect(r.patchFiles).toEqual(['valid.dat']);
    expect(r.sections['General']?.['PatchFile']).toBe('ignored.dat');
  });

  it('test_ddraw_ini_dedup', () => {
    const r = parseDdrawIni('[Misc]\nPatchFile=a\nPatchFile1=b\nPatchFile2=a\nPatchFile3=b\n');
    expect(r.patchFiles).toEqual(['a', 'b']);
  });

  it('test_ddraw_ini_repeated_section_merges_and_later_key_wins', () => {
    const r = parseDdrawIni('[Misc]\nA=1\n[misc]\na=2\nB=3\n');
    expect(r.sections['Misc']).toEqual({ a: '2', B: '3' });
  });

  it('test_ddraw_ini_real_patch_file_has_no_patchfile', () => {
    const r = parseDdrawIni('[Misc]\nScriptExtender=1\nMovie1=iplogo.mve\n');
    expect(r.patchFiles).toEqual([]);
    expect(r.sections['Misc']?.['ScriptExtender']).toBe('1');
  });
});
