import { FormatError } from '../errors.js';
import { ByteReader } from '../io/reader.js';

/** Minimalny rozmiar GCD: pola 0..106 (428 B); pole 107 (punkty SPECIAL) opcjonalne. */
const MIN_SIZE = 428;

export interface GcdRecord {
  name: string;
  age: number;
  gender: 0 | 1;
  /** ST PE EN CH IN AG LK (stats[0..6]). */
  baseStats: number[];
  /** Wszystkie 35 statow bazowych (indeksy stats.json). */
  stats: number[];
  /** 35 bonusow statow. */
  bonusStats: number[];
  /** 18 bonusow skilli (nie tagi). */
  skills: number[];
  /** 4 sloty tagow: indeks skilla lub -1. */
  tags: number[];
  /** 2 sloty traitow: indeks lub -1. */
  traits: number[];
  /** Pola 89..92 (znaczenie nieustalone, R22a-U1). */
  extra: number[];
  unspentSpecialPoints: number;
}

/** Parser GCD (spec dokumentacja techniczna): 108 pol int32 big-endian. */
export function parseGcd(buf: Uint8Array): GcdRecord {
  if (buf.length < MIN_SIZE) {
    throw new FormatError('gcd', `plik GCD za krotki: ${buf.length} B (min ${MIN_SIZE})`);
  }
  const r = new ByteReader(buf);
  const ints = (n: number): number[] => Array.from({ length: n }, () => r.u32be() | 0);
  r.u32be(); // naglowek
  const stats = ints(35);
  const bonusStats = ints(35);
  const skills = ints(18);
  const extra = ints(4);
  const nameBytes = buf.subarray(r.pos, r.pos + 32);
  r.seek(r.pos + 32);
  let end = nameBytes.indexOf(0);
  if (end === -1) end = 32;
  let name = '';
  for (let i = 0; i < end; i++) name += String.fromCharCode(nameBytes[i]!);
  const tags = ints(4);
  const traits = ints(2);
  const unspentSpecialPoints = r.remaining >= 4 ? r.u32be() | 0 : 0;
  return {
    name,
    age: stats[33]!,
    gender: stats[34] === 1 ? 1 : 0,
    baseStats: stats.slice(0, 7),
    stats,
    bonusStats,
    skills,
    tags,
    traits,
    extra,
    unspentSpecialPoints,
  };
}

/** BIO: zwykly tekst ANSI (latin1), CRLF normalizowane do LF. */
export function parseBio(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
  return s.replace(/\r\n?/g, '\n');
}
