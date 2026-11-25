import type { LookLang } from './object-text';

/** Minimalny widok obiektu swiata potrzebny do nazwy: typ i id tekstu z prototypu. */
export interface NamedObject {
  type: number;
  proto: { textId: number };
}

export interface PartyNameDeps {
  /** Obiekt swiata towarzysza po id; brak = nie ma go na biezacej mapie. */
  objectOf: (objId: number) => NamedObject | undefined;
  /** Nazwa z pro_*.msg (PL: pakiet > gra > EN); undefined = brak wpisu. */
  describe: (lang: LookLang, type: number, textId: number) => Promise<{ name: string } | undefined>;
  lang: () => LookLang;
  /** Wolane po dojsciu nowej nazwy (wymusza ponowny render okna). */
  onUpdate: () => void;
}

/**
 * Synchroniczny resolver nazw towarzyszy dla okna rozkazow: zwraca nazwe z cache albo undefined
 * (wtedy okno pokazuje "Towarzysz N") i w tle dociaga nazwe z msg NPC, po czym wola `onUpdate`.
 */
export function createPartyNameResolver(
  d: PartyNameDeps,
): (row: { objId: number }) => string | undefined {
  const cache = new Map<string, string>();
  const pending = new Set<string>();
  return (row) => {
    const o = d.objectOf(row.objId);
    if (!o) return undefined;
    const lang = d.lang();
    const key = `${lang}:${o.type}:${o.proto.textId}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (!pending.has(key)) {
      pending.add(key);
      void d
        .describe(lang, o.type, o.proto.textId)
        .then((t) => {
          const name = t?.name.trim();
          if (name) cache.set(key, name);
        })
        .catch(() => undefined)
        .finally(() => {
          pending.delete(key);
          d.onUpdate();
        });
    }
    return undefined;
  };
}
