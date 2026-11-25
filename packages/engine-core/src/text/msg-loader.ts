/** Jezyk tekstow gry (katalog `text/<jezyk>/`). */
export type GameTextLanguage = 'english' | 'polish';

export interface MsgEntry {
  id: number;
  audio: string;
  text: string;
}

/** Warstwa widziana przez loader (strukturalnie zgodna z `VfsLayer` z @f2/vfs). */
interface MsgLayer {
  readonly name: string;
  has(path: string): boolean;
  open(path: string): Promise<Uint8Array>;
}

/** Strukturalnie zgodne z `VirtualFs`: loader potrzebuje stosu warstw, nie tylko `resolve`. */
export interface MsgSource {
  readonly layers: readonly MsgLayer[];
}

export interface MsgLoaderOptions {
  language: GameTextLanguage;
  fallback: 'english';
}

/** Nazwa warstwy pakietu jezykowego (LangPackLayer): zawartosc w UTF-8. */
const PACK_LAYER_PREFIX = 'lang-pack:';

/**
 * Parser MSG: ciag `{numer}{audio}{tekst}`, tekst poza nawiasami pomijany, znaki konca linii w polu
 * pomijane, ostatni duplikat id wygrywa. Tolerancyjny: niedomkniety wpis konczy odczyt.
 */
export function parseMsgEntries(text: string): Map<number, MsgEntry> {
  const entries = new Map<number, MsgEntry>();
  let pos = 0;
  const field = (): string | null => {
    const open = text.indexOf('{', pos);
    if (open === -1) return null;
    const close = text.indexOf('}', open + 1);
    if (close === -1) return null;
    pos = close + 1;
    return text.slice(open + 1, close).replace(/[\r\n]/g, '');
  };
  for (;;) {
    const num = field();
    if (num === null) break;
    const audio = field();
    const body = field();
    if (audio === null || body === null) break;
    const id = /^[+-]?\d+$/.test(num.trim()) ? Number.parseInt(num, 10) | 0 : 0;
    entries.set(id, { id, audio, text: body });
  }
  return entries;
}

/** 'auto' = jezyk interfejsu ('pl' -> polish, reszta -> english). */
export function resolveGameTextLanguage(setting: string, uiLanguage: string): GameTextLanguage {
  if (setting === 'polish' || setting === 'english') return setting;
  return uiLanguage.toLowerCase().startsWith('pl') ? 'polish' : 'english';
}

/** Tabela wpisow jednego pliku MSG po zlaczeniu jezyka docelowego z angielskim fallbackiem. */
export class MsgTable {
  constructor(
    readonly name: string,
    private readonly entries: ReadonlyMap<number, MsgEntry>,
    /** Liczba wpisow wziętych z angielskiego, bo brakowalo ich w jezyku docelowym. */
    readonly fallbacks: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  has(id: number): boolean {
    return this.entries.has(id);
  }

  get(id: number): MsgEntry | undefined {
    return this.entries.get(id);
  }

  ids(): number[] {
    return [...this.entries.keys()];
  }
}

function decode(bytes: Uint8Array, layerName: string, language: GameTextLanguage): string {
  // pakiet: UTF-8 (nasz tekst); dane gry: polski = cp1250, angielski = cp1252
  if (layerName.startsWith(PACK_LAYER_PREFIX)) return new TextDecoder('utf-8').decode(bytes);
  return new TextDecoder(language === 'polish' ? 'windows-1250' : 'windows-1252').decode(bytes);
}

/**
 * Loader MSG z fallbackiem per wpis (ADR-0008): wpis w jezyku docelowym wygrywa, brakujace id i caly
 * brakujacy plik uzupelnia angielski. Przy polskim: warstwy gry (cp1250) wygrywaja z pakietem (UTF-8)
 * dla istniejacych id, pakiet uzupelnia reszte.
 */
export class MsgLoader {
  private language: GameTextLanguage;
  private readonly fallback: 'english';
  private cache = new Map<string, Promise<MsgTable>>();
  private gen = 0;

  constructor(
    private readonly vfs: MsgSource,
    opts: MsgLoaderOptions,
  ) {
    this.language = opts.language;
    this.fallback = opts.fallback;
  }

  get currentLanguage(): GameTextLanguage {
    return this.language;
  }

  /** Numer generacji cache; rosnie przy realnej zmianie jezyka. */
  get generation(): number {
    return this.gen;
  }

  /**
   * Zmiana jezyka unieważnia cache MSG. Tabele juz wydane (np. trwajacy dialog) pozostaja
   * poprawne; nowy jezyk dostaja dopiero kolejne `load`.
   */
  setLanguage(language: GameTextLanguage): void {
    if (language === this.language) return;
    this.language = language;
    this.cache = new Map();
    this.gen++;
  }

  load(name: string): Promise<MsgTable> {
    const key = normalizeName(name);
    let p = this.cache.get(key);
    if (!p) {
      p = this.build(key);
      this.cache.set(key, p);
      // nieudane wczytanie nie zostaje w cache
      p.catch(() => {
        if (this.cache.get(key) === p) this.cache.delete(key);
      });
    }
    return p;
  }

  /** Tekst wpisu albo pusty ciag, gdy brak id (takze w fallbacku). */
  text(table: MsgTable, id: number): string {
    return table.get(id)?.text ?? '';
  }

  private async readLanguage(
    lang: GameTextLanguage,
    key: string,
    onlyFirst: boolean,
  ): Promise<Map<number, MsgEntry> | undefined> {
    const path = `text/${lang}/${key}`;
    const layers = this.vfs.layers.filter((l) => l.has(path));
    if (layers.length === 0) return undefined;
    const merged = new Map<number, MsgEntry>();
    // warstwy od najwyzszego priorytetu: wczesniejsza wygrywa per id
    for (const layer of onlyFirst ? layers.slice(0, 1) : layers) {
      const parsed = parseMsgEntries(decode(await layer.open(path), layer.name, lang));
      for (const [id, e] of parsed) if (!merged.has(id)) merged.set(id, e);
    }
    return merged;
  }

  private async build(key: string): Promise<MsgTable> {
    const name = `${this.language}/${key}`;
    if (this.language === this.fallback) {
      const en = await this.readLanguage('english', key, true);
      if (!en) throw new Error(`brak pliku MSG: text/english/${key}`);
      return new MsgTable(name, en, 0);
    }
    const [target, en] = await Promise.all([
      this.readLanguage(this.language, key, false),
      this.readLanguage(this.fallback, key, true),
    ]);
    if (!target && !en)
      throw new Error(`brak pliku MSG: ${key} (${this.language}, ${this.fallback})`);
    const out = new Map<number, MsgEntry>(target ?? []);
    let fallbacks = 0;
    for (const [id, e] of en ?? []) {
      if (!out.has(id)) {
        out.set(id, e);
        fallbacks++;
      }
    }
    return new MsgTable(name, out, fallbacks);
  }
}

/** `game/stat`, `game/stat.msg`, `Game\Stat.MSG` -> `game/stat.msg`. */
function normalizeName(name: string): string {
  const n = name.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
  return n.endsWith('.msg') ? n : `${n}.msg`;
}
