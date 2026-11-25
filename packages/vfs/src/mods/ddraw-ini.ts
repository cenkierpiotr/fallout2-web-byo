/**
 * Parser ddraw.ini (format INI sfall). Statusy w dokumentacja techniczna
 * `patchFiles`: wartosci PatchFile i PatchFile<N> z sekcji [Misc] (PatchFile pierwszy, potem N rosnaco).
 */
export interface DdrawIni {
  patchFiles: string[];
  sections: Record<string, Record<string, string>>;
}

export function parseDdrawIni(text: string): DdrawIni {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sections: Record<string, Record<string, string>> = {};
  const canonical = new Map<string, string>(); // nazwa sekcji lowercase -> pierwsza pisownia
  const keyCanon = new Map<string, Map<string, string>>(); // sekcja lc -> klucz lc -> pisownia
  const patch: { num: number | null; value: string }[] = [];
  let section = '';

  const sectionObj = (name: string): Record<string, string> => {
    const lc = name.toLowerCase();
    const canon = canonical.get(lc) ?? name;
    canonical.set(lc, canon);
    return (sections[canon] ??= {});
  };
  sectionObj('');

  for (const raw of src.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const sm = /^\[(.*)\]$/.exec(line);
    if (sm) {
      section = (sm[1] ?? '').trim();
      sectionObj(section);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === '') continue;
    let value = line.slice(eq + 1).trim();
    const c = value.indexOf(' ;');
    if (c !== -1) value = value.slice(0, c).trim();

    const obj = sectionObj(section);
    const slc = section.toLowerCase();
    let kmap = keyCanon.get(slc);
    if (!kmap) keyCanon.set(slc, (kmap = new Map()));
    const klc = key.toLowerCase();
    const prev = kmap.get(klc);
    if (prev !== undefined && prev !== key) delete obj[prev];
    kmap.set(klc, key);
    obj[key] = value;

    if (slc === 'misc' && value !== '') {
      if (klc === 'patchfile') patch.push({ num: null, value });
      else {
        const m = /^patchfile(\d+)$/.exec(klc);
        if (m) patch.push({ num: Number(m[1]), value });
      }
    }
  }

  patch.sort((a, b) => (a.num ?? -1) - (b.num ?? -1));
  const seen = new Set<string>();
  const patchFiles: string[] = [];
  for (const p of patch) {
    if (!seen.has(p.value)) {
      seen.add(p.value);
      patchFiles.push(p.value);
    }
  }
  return { patchFiles, sections };
}
