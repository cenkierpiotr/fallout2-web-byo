import { parseMsgEntries } from '@f2/engine-core';
import type { VirtualFs } from '@f2/vfs';

export type LookLang = 'pl' | 'en';

export interface ObjectText {
  name: string;
  description: string;
}

/** Nazwy plikow tekstow prototypow wg typu obiektu (0 item, 1 critter, 2 scenery, 3 wall, 4 tile, 5 misc). */
const PRO_FILES = ['pro_item', 'pro_crit', 'pro_scen', 'pro_wall', 'pro_tile', 'pro_misc'] as const;

export function protoMsgFile(objectType: number): string | undefined {
  return PRO_FILES[objectType];
}

/** Zrodlo pakietu jezykowego PL (UTF-8): sciezka wzgledna `game/pro_item.msg`; null = brak pakietu/pliku. */
export type PackReader = (rel: string) => Promise<Uint8Array | null>;

export interface ObjectTextOptions {
  pack?: PackReader;
}

type Table = Map<number, string>;

function toTable(text: string): Table {
  const out: Table = new Map();
  for (const [id, e] of parseMsgEntries(text)) out.set(id, e.text);
  return out;
}

/**
 * Nazwy i opisy obiektow z `pro_*.msg`: nazwa = `proto.textId`, opis = `textId + 1`.
 * Jezyk PL: pakiet (UTF-8) > `text/polish` z gry (cp1250) > angielski per wpis.
 */
export class ObjectTextSource {
  private readonly cache = new Map<string, Promise<Table>>();

  constructor(
    private readonly vfs: Pick<VirtualFs, 'open'>,
    private readonly opts: ObjectTextOptions = {},
  ) {}

  private cached(key: string, make: () => Promise<Table>): Promise<Table> {
    let p = this.cache.get(key);
    if (!p) {
      p = make();
      this.cache.set(key, p);
    }
    return p;
  }

  private english(file: string): Promise<Table> {
    return this.cached(`en:${file}`, async () => {
      try {
        const b = await this.vfs.open(`text/english/game/${file}.msg`);
        return toTable(new TextDecoder('windows-1252').decode(b));
      } catch {
        return new Map();
      }
    });
  }

  private polish(file: string): Promise<Table> {
    return this.cached(`pl:${file}`, async () => {
      const fromPack = await this.opts.pack?.(`game/${file}.msg`).catch(() => null);
      if (fromPack) {
        const t = toTable(new TextDecoder('utf-8').decode(fromPack));
        if (t.size > 0) return t;
      }
      try {
        const b = await this.vfs.open(`text/polish/game/${file}.msg`);
        return toTable(new TextDecoder('windows-1250').decode(b));
      } catch {
        return new Map();
      }
    });
  }

  /** Nazwa i opis albo undefined, gdy brak wpisu nazwy w obu jezykach. */
  async describe(
    lang: LookLang,
    objectType: number,
    textId: number,
  ): Promise<ObjectText | undefined> {
    const file = protoMsgFile(objectType);
    if (!file) return undefined;
    const en = await this.english(file);
    const pl = lang === 'pl' ? await this.polish(file) : undefined;
    const get = (id: number): string | undefined => pl?.get(id) ?? en.get(id);
    const name = get(textId);
    if (name === undefined) return undefined;
    return { name, description: get(textId + 1) ?? '' };
  }
}

/** Tekst akcji "Patrz": nazwa, a po niej opis (jesli jest). */
export function formatLook(t: ObjectText): string {
  const name = t.name.trim();
  const desc = t.description.trim();
  if (!name) return desc;
  return desc ? `${name}. ${desc}` : name;
}

/** Czytnik pakietu PL po HTTP (`/lang-pack/pl/<rel>`); odpowiedz bez ok lub HTML = brak pakietu. */
export function httpPackReader(base = '/lang-pack/pl/'): PackReader {
  return async (rel) => {
    try {
      const r = await fetch(base + rel);
      if (!r.ok) return null;
      // SPA fallback (nginx/dev) oddaje index.html z 200 dla brakujacego pliku: traktuj jak brak.
      if (/text\/html/i.test(r.headers?.get('content-type') ?? '')) return null;
      const bytes = new Uint8Array(await r.arrayBuffer());
      const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
      return /^<(!doctype|html)\b/i.test(head) ? null : bytes;
    } catch {
      return null;
    }
  };
}
