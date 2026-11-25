import { FormatError } from './errors.js';

/** Konfiguracja filmu (art\cuts\*.cfg): efekty fade. Patrz dokumentacja techniczna ("Otwarte": cfg). */
export type MovieFadeKind = 'in' | 'out';

export interface MovieEffect {
  startFrame: number;
  /** in: z koloru do palety filmu; out: z palety filmu do koloru. */
  kind: MovieFadeKind;
  /** r,g,b w zakresie 0..63. */
  color: [number, number, number];
  steps: number;
}

export interface MovieCfg {
  effects: MovieEffect[];
}

type Section = Map<string, string>;

function parseIni(text: string): Map<string, Section> {
  const sections = new Map<string, Section>();
  let cur: Section | null = null;
  for (const raw of text.split('\n')) {
    const line = (raw.includes(';') ? raw.slice(0, raw.indexOf(';')) : raw).trim();
    if (!line) continue;
    const head = /^\[(.*)\]$/.exec(line);
    if (head) {
      cur = sections.get(head[1]!.trim().toLowerCase()) ?? new Map();
      sections.set(head[1]!.trim().toLowerCase(), cur);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0 || !cur) continue;
    cur.set(line.slice(0, eq).trim().toLowerCase(), line.slice(eq + 1).trim());
  }
  return sections;
}

function int(format: string, what: string, v: string | undefined): number {
  if (v === undefined || !/^-?\d+$/.test(v.trim()))
    throw new FormatError(format, `${what}: oczekiwano liczby, jest "${v ?? ''}"`);
  return Number(v.trim());
}

export function parseMovieCfg(text: string): MovieCfg {
  const ini = parseIni(text);
  const info = ini.get('info');
  const list = info?.get('effect_frames');
  if (!info || list === undefined)
    throw new FormatError('movie-cfg', 'brak [info] lub effect_frames');
  const frames = list
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => int('movie-cfg', 'effect_frames', s));
  const effects: MovieEffect[] = [];
  for (const f of frames) {
    const sec = ini.get(String(f));
    if (!sec) throw new FormatError('movie-cfg', `brak sekcji [${f}]`);
    const kind = (sec.get('fade_type') ?? '').toLowerCase();
    if (kind !== 'in' && kind !== 'out')
      throw new FormatError('movie-cfg', `[${f}] fade_type "${kind}"`);
    const rgb = (sec.get('fade_color') ?? '').split(',');
    if (rgb.length !== 3) throw new FormatError('movie-cfg', `[${f}] fade_color wymaga r,g,b`);
    const c = rgb.map((v) => Math.min(63, Math.max(0, int('movie-cfg', `[${f}] fade_color`, v))));
    const steps = Math.max(1, int('movie-cfg', `[${f}] fade_steps`, sec.get('fade_steps')));
    effects.push({ startFrame: f, kind, color: [c[0]!, c[1]!, c[2]!], steps });
  }
  effects.sort((a, b) => a.startFrame - b.startFrame);
  return { effects };
}
