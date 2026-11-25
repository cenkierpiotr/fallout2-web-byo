import { parseHeadsLst } from '@f2/audio';
import type { DialogCue } from './dialog-audio';

/** Kwestia NPC z VM (DialogHooks.speak) plus nazwa pliku mowy z pola audio wpisu MSG. */
export interface SpokenLine {
  headFid: number;
  text: string;
  /** Pole audio wpisu MSG (bez rozszerzenia); undefined = kwestia bez mowy. */
  audio: string | undefined;
}

export interface DialogSpeechDeps {
  /** Czy plik istnieje w VFS (sciezka dowolnej wielkosci liter). */
  has(path: string): boolean;
  /** Klucze VFS o danym prefiksie (male litery). */
  keys(prefix: string): string[];
  /** Tresc `art/heads/heads.lst` lub undefined gdy brak. */
  headsLst(): Promise<string | undefined>;
  /** DialogAudio.show: undefined zatrzymuje mowe. */
  show(cue: DialogCue | undefined): unknown;
  close(): void;
}

/**
 * Most VM -> mowa: z `headFid` (numer glowy = indeks w heads.lst, `& 0xfff`, W) i pola audio
 * sklada sciezke `sound/speech/<glowa>/<audio>.acm`; gdy tam pliku nie ma, szuka jednoznacznego
 * katalogu z plikiem o tej nazwie (dialog-cue.md). Brak pliku = cisza (nie blad); kazda nowa
 * kwestia (takze bez audio) przerywa poprzednia.
 */
export class DialogSpeech {
  private heads: Promise<string[]> | undefined;
  private owners: Map<string, string[]> | undefined;

  constructor(private readonly d: DialogSpeechDeps) {}

  private headNames(): Promise<string[]> {
    this.heads ??= this.d.headsLst().then((txt) => {
      const names: string[] = [];
      if (txt) for (const e of parseHeadsLst(txt)) names[e.index] = e.name;
      return names;
    });
    // odrzucony promise nie moze zostac w cache na zawsze: nastepne wywolanie ponowi
    this.heads.catch(() => {
      this.heads = undefined;
    });
    return this.heads;
  }

  private ownersOf(audio: string): string[] {
    if (!this.owners) {
      this.owners = new Map();
      for (const k of this.d.keys('sound/speech/')) {
        const m = /^sound\/speech\/([^/]+)\/([^/]+)\.acm$/.exec(k.toLowerCase());
        if (!m) continue;
        const list = this.owners.get(m[2]!) ?? [];
        list.push(m[1]!);
        this.owners.set(m[2]!, list);
      }
    }
    return this.owners.get(audio) ?? [];
  }

  async cueFor(line: SpokenLine): Promise<DialogCue | undefined> {
    const audio = line.audio?.trim().toLowerCase();
    if (!audio) return undefined;
    const head = (await this.headNames())[line.headFid & 0xfff];
    let dir: string | undefined;
    if (head && this.d.has(`sound/speech/${head}/${audio}.acm`)) dir = head;
    else {
      const o = this.ownersOf(audio);
      if (o.length === 1) dir = o[0];
    }
    if (!dir) return undefined;
    const lip = `sound/speech/${dir}/${audio}.lip`;
    return {
      speechPath: `sound/speech/${dir}/${audio}.acm`,
      ...(this.d.has(lip) ? { lipPath: lip } : {}),
      subtitle: line.text,
    };
  }

  /** Wolane z DialogHooks.speak. */
  async speak(line: SpokenLine): Promise<void> {
    const cue = await this.cueFor(line);
    await this.d.show(cue);
  }

  stop(): void {
    this.d.close();
  }
}
