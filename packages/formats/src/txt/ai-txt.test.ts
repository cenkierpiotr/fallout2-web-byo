import { describe, expect, it } from 'vitest';
import { parseAiTxt } from './ai-txt.js';

const FIX = `[Test]
packet_num=5
aggression=60
hurt_too_much=crippled, blind, bogus
chem_primary_desire=284,81,103
hit_head_start=1300
hit_head_end=1310
disposition=defensive

[Pusty]
packet_num=7
`;

describe('parseAiTxt', () => {
  it('pola, zakresy, enumy jako stringi', () => {
    const [t, p] = parseAiTxt(FIX);
    expect(t?.name).toBe('Test');
    expect(t?.packetNum).toBe(5);
    expect(t?.aggression).toBe(60);
    expect([...(t?.hurtTooMuch ?? [])].sort()).toEqual(['blind', 'crippled']);
    expect(t?.chemPrimaryDesire).toEqual([284, 81, 103]);
    expect(t?.msgRanges.hitHead).toEqual([1300, 1310]);
    expect(t?.msgRanges.attack).toEqual([0, 0]);
    expect(t?.disposition).toBe('defensive');
    expect(p?.packetNum).toBe(7);
    expect('disposition' in (p ?? {})).toBe(false);
    expect(p?.chemPrimaryDesire).toEqual([]);
  });
  it('nieprawidlowa liczba rzuca blad z sekcja i kluczem', () => {
    expect(() => parseAiTxt('[X]\nmax_dist=abc\n')).toThrow(/\[X\] max_dist/);
  });
});
