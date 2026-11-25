import { parseLst, parseMsg } from '@f2/formats';
import type { MsgEntry } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';

export type GameMsgFile =
  | 'MAP'
  | 'MISC'
  | 'PERK'
  | 'PIPBOY'
  | 'COMBAT'
  | 'proto'
  | 'pro_item'
  | 'pro_crit'
  | 'pro_scen'
  | 'pro_wall'
  | 'pro_tile'
  | 'pro_misc';

export interface MessageSourceOptions {
  /** Jezyk bazowy, np. 'english' (katalog text/<jezyk>/). */
  language: string;
  /** Opcjonalny jezyk nakladkowy (np. 'polish'); brakujace pliki/wpisy bierze z bazowego. */
  overlayLanguage?: string;
  /**
   * Czytnik pakietu jezykowego PL (UTF-8), sciezka wzgledna `dialog/<x>.msg` albo `game/<x>.msg`;
   * null = brak pliku. Nakladany po polskim tekscie z gry, tylko gdy `overlayLanguage` to 'polish'.
   */
  pack?: (rel: string) => Promise<Uint8Array | null>;
}

type Msgs = Map<number, MsgEntry>;

/** Zrodlo komunikatow: dialogi skryptow (wg scripts.lst) i pliki gry, z opcjonalna nakladka jezykowa. */
export class MessageSource {
  private scriptNames: Promise<string[]> | undefined;
  private readonly cache = new Map<string, Promise<Msgs>>();

  constructor(
    private readonly vfs: VirtualFs,
    private readonly opts: MessageSourceOptions,
  ) {}

  dialog(scriptIndex: number): Promise<Msgs> {
    return this.cached(`dialog:${scriptIndex}`, async () => {
      const names = await this.getScriptNames();
      const entry = names[scriptIndex];
      if (!entry) return new Map();
      const dot = entry.indexOf('.');
      const name = (dot === -1 ? entry : entry.slice(0, dot)).trim().toLowerCase();
      if (!name) return new Map();
      return this.load(`dialog/${name}.msg`);
    });
  }

  game(file: GameMsgFile): Promise<Msgs> {
    const name = file.toLowerCase();
    return this.cached(`game:${name}`, () => this.load(`game/${name}.msg`));
  }

  async get(scriptIndex: number, msgId: number): Promise<string | undefined> {
    return (await this.dialog(scriptIndex)).get(msgId)?.text;
  }

  private getScriptNames(): Promise<string[]> {
    this.scriptNames ??= this.vfs
      .open('scripts/scripts.lst')
      .then((b) => parseLst(b).map((l) => l.trim()));
    return this.scriptNames;
  }

  private cached(key: string, make: () => Promise<Msgs>): Promise<Msgs> {
    let p = this.cache.get(key);
    if (!p) {
      p = make();
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }

  /** Wczytuje plik z bazowego jezyka, nakladajac wpisy z jezyka nakladkowego (jesli istnieje). */
  private async load(rel: string): Promise<Msgs> {
    const result: Msgs = new Map();
    const langs = [this.opts.language];
    if (this.opts.overlayLanguage && this.opts.overlayLanguage !== this.opts.language) {
      langs.push(this.opts.overlayLanguage);
    }
    for (const lang of langs) {
      const path = `text/${lang}/${rel}`;
      if (!this.vfs.resolve(path)) continue;
      const b = await this.vfs.open(path);
      const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      for (const [id, e] of parseMsg(buf)) result.set(id, e);
    }
    if (this.opts.overlayLanguage === 'polish' && this.opts.pack) {
      const bytes = await this.opts.pack(rel).catch(() => null);
      if (bytes && bytes.byteLength > 0) {
        const buf = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        for (const [id, e] of parseMsg(buf, 'utf-8')) result.set(id, e);
      }
    }
    return result;
  }
}
