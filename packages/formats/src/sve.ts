/** Napisy filmow (art\cuts\*.sve, text\<jezyk>\cuts\*.sve). Patrz dokumentacja techniczna */
export interface SveCue {
  /** Numer klatki MVE, od ktorej napis jest widoczny. */
  frame: number;
  /** Tekst napisu; pusty tekst oznacza wyczyszczenie napisu. */
  text: string;
}

/** Parsuje tekst SVE ("klatka:tekst" w linii) do cue posortowanych po klatce (stabilnie). */
export function parseSve(text: string): SveCue[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const cues: SveCue[] = [];
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const num = line.slice(0, colon).trim();
    if (!/^\d+$/.test(num)) continue;
    cues.push({ frame: Number(num), text: line.slice(colon + 1) });
  }
  return cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.frame - b.c.frame || a.i - b.i)
    .map((x) => x.c);
}
