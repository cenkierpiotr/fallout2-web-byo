/**
 * Katalog DialogCue: wpis dialogu (plik MSG + id) -> glowa mowiaca + plik mowy ACM + LIP.
 * Zasady (dokumentacja techniczna): pole audio wpisu MSG to nazwa pliku bez rozszerzenia,
 * a katalog glowy `sound/speech/<glowa>/` jest nazwa z `art/heads/heads.lst`.
 */

export type HeadMood = 'good' | 'neutral' | 'bad';
export type HeadKind = 'v' | 'f' | 'n' | 'g' | 'b' | 'p';

/** Liczba klatek ust w pliku P glowy (fonem -> klatka 0..8). */
export const MOUTH_FRAMES = 9;

/** Tablice znakow nazwy FRM glowy indeksowane `anim` (exe 0x51089c / 0x5108a0), 12 pozycji. */
export const HEAD_ANIM: readonly { mood: string; kind: string }[] = [...'gggnnnbbbgnb'].map(
  (mood, i) => ({ mood, kind: 'vfngfbnfvppp'[i]! }),
);

const MOOD_CHAR: Record<HeadMood, string> = { good: 'g', neutral: 'n', bad: 'b' };

/** Sciezka FRM glowy w kluczach VFS (male litery). `variant` tylko dla `f` (fidget 1..3). */
export function headFrmPath(
  head: string,
  mood: HeadMood,
  kind: HeadKind,
  variant?: number,
): string {
  const v = kind === 'f' ? String(variant ?? 1) : '';
  return `art/heads/${head}${MOOD_CHAR[mood]}${kind}${v}.frm`.toLowerCase();
}

export interface HeadsLstEntry {
  name: string;
  /** Indeks wiersza w heads.lst (numer glowy we FID). */
  index: number;
  /** Trzy liczby z wiersza (liczba fidgetow; przypisanie do nastrojow Z). */
  fidgets: [number, number, number];
}

/** Parsuje `art/heads/heads.lst` (`nazwa,a,b,c`); wiersz 0 (`reser`) jest pomijany. */
export function parseHeadsLst(text: string): HeadsLstEntry[] {
  const out: HeadsLstEntry[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const parts = raw
      .split(';')[0]!
      .split(',')
      .map((s) => s.trim());
    const name = (parts[0] ?? '').toLowerCase();
    if (name === '' || parts.length < 4) return;
    const n = (i: number): number => Number.parseInt(parts[i] ?? '0', 10) || 0;
    out.push({ name, index, fidgets: [n(1), n(2), n(3)] });
  });
  return out;
}

export interface MsgLine {
  id: number;
  audio: string;
  text: string;
}

export interface DialogCueEntry {
  msgFile: string;
  id: number;
  audio: string;
  /** Wybrana glowa (katalog mowy) lub undefined, gdy zadnego pliku mowy nie ma. */
  head: string | undefined;
  /** Wszystkie glowy z plikiem o tej nazwie (>1 = niejednoznacznosc rozstrzygnieta wiekszoscia). */
  headCandidates: string[];
  speechPath: string;
  lipPath: string | undefined;
  hasAcm: boolean;
  hasLip: boolean;
  /** FRM mowy (9 klatek ust) per nastroj; undefined bez glowy. */
  talkFrm: Record<HeadMood, string> | undefined;
  subtitle: string;
}

export interface DialogCueInput {
  /** Klucze VFS (male litery, `/`), np. wynik `vfs.list()`. */
  files: ReadonlySet<string>;
  headsLst?: string;
  messages: { path: string; entries: Iterable<MsgLine> }[];
}

const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase();

export class DialogCueCatalog {
  private readonly index = new Map<string, DialogCueEntry>();
  constructor(readonly entries: readonly DialogCueEntry[]) {
    for (const e of entries) this.index.set(`${e.msgFile}#${e.id}`, e);
  }
  find(msgFile: string, id: number): DialogCueEntry | undefined {
    return this.index.get(`${norm(msgFile)}#${id}`);
  }
  /** Ksztalt wymagany przez DialogAudio (apps/web). */
  toDialogCue(e: DialogCueEntry): { speechPath: string; lipPath?: string; subtitle?: string } {
    return {
      speechPath: e.speechPath,
      ...(e.lipPath ? { lipPath: e.lipPath } : {}),
      ...(e.subtitle ? { subtitle: e.subtitle } : {}),
    };
  }
}

export function buildDialogCueCatalog(input: DialogCueInput): DialogCueCatalog {
  const order = new Map<string, number>();
  if (input.headsLst) parseHeadsLst(input.headsLst).forEach((h, i) => order.set(h.name, i));

  // nazwa pliku mowy -> glowy, ktore go maja (ACM lub LIP)
  const owners = new Map<string, Set<string>>();
  for (const f of input.files) {
    const m = /^sound\/speech\/([^/]+)\/([^/]+)\.(acm|lip)$/.exec(f);
    if (!m) continue;
    const key = m[2]!;
    let s = owners.get(key);
    if (!s) owners.set(key, (s = new Set()));
    s.add(m[1]!);
  }
  const rank = (h: string): number => order.get(h) ?? Number.MAX_SAFE_INTEGER;
  const sorted = (s: Set<string>): string[] =>
    [...s].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));

  const entries: DialogCueEntry[] = [];
  for (const msg of input.messages) {
    const msgFile = norm(msg.path);
    const lines = [...msg.entries].filter((l) => l.audio.trim() !== '');
    // glosy jednoznacznych wpisow tego pliku
    const votes = new Map<string, number>();
    for (const l of lines) {
      const c = owners.get(l.audio.trim().toLowerCase());
      if (c?.size === 1) {
        const h = [...c][0]!;
        votes.set(h, (votes.get(h) ?? 0) + 1);
      }
    }
    for (const l of lines) {
      const audio = l.audio.trim().toLowerCase();
      const cands = sorted(owners.get(audio) ?? new Set());
      let head: string | undefined = cands[0];
      if (cands.length > 1) {
        head = [...cands].sort(
          (a, b) => (votes.get(b) ?? 0) - (votes.get(a) ?? 0) || rank(a) - rank(b),
        )[0];
      }
      const dir = head ?? '';
      const speechPath = `sound/speech/${dir}/${audio}.acm`;
      const lip = `sound/speech/${dir}/${audio}.lip`;
      const hasAcm = head !== undefined && input.files.has(speechPath);
      const hasLip = head !== undefined && input.files.has(lip);
      entries.push({
        msgFile,
        id: l.id,
        audio,
        head,
        headCandidates: cands,
        speechPath,
        lipPath: hasLip ? lip : undefined,
        hasAcm,
        hasLip,
        talkFrm: head
          ? {
              good: headFrmPath(head, 'good', 'p'),
              neutral: headFrmPath(head, 'neutral', 'p'),
              bad: headFrmPath(head, 'bad', 'p'),
            }
          : undefined,
        subtitle: l.text,
      });
    }
  }
  return new DialogCueCatalog(entries);
}
