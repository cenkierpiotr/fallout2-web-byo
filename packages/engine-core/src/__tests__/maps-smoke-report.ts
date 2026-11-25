/** Typy i generator raportu dokumentacja techniczna dla maps-smoke.test.ts (bez zasobow gry w repo). */

export interface KnownException {
  id: string;
  /** mapName (male litery) */
  map: string;
  pattern: RegExp;
  reason: string;
}

export interface MapSmokeResult {
  index: number;
  lookupName: string;
  mapName: string;
  loaded: boolean;
  loadError?: string;
  objects: number;
  scripts: number;
  vmErrors: string[];
  unsupported: string[];
  missingScripts: string[];
  renderIssues: string[];
  /** id znanych wyjatkow, ktore zadzialaly na tej mapie */
  known: string[];
}

export function renderMapsCoverage(
  results: MapSmokeResult[],
  known: KnownException[],
  noFile: Set<string>,
): string {
  const loaded = results.filter((r) => r.loaded);
  const clean = loaded.filter((r) => r.known.length === 0);
  const L: string[] = [];
  L.push('# Pokrycie map (maps-smoke)');
  L.push('');
  L.push(
    `Test: \`packages/engine-core/src/__tests__/maps-smoke.test.ts\` (wymaga F2_GAME_DIR i F2_PATCH_DIR). Mapy z data/maps.txt: ${results.length}; wczytane: ${loaded.length}; bez wyjatkow: ${clean.length}; bez pliku .map: ${results.length - loaded.length}.`,
  );
  L.push(
    'Dla kazdej mapy: load, indeksowanie obiektow, loadScriptsForMap (start + map_enter), 3 ticki, sprawdzenie renderowalnosci (kafle w tiles.lst, wpisy i pliki FRM obiektow).',
  );
  L.push('');
  L.push('## Wymaga uwagi');
  L.push('');
  L.push(
    `- Brak pliku .map w danych gry (${[...noFile].join(', ')}): mapy z maps.txt bez zasobu, nieladowalne rowniez w oryginale (Z: potwierdzone tylko brakiem pliku w MASTER.DAT/patchu).`,
  );
  L.push(
    '- Zewnetrzne zmienne: oryginal ma je globalne miedzy mapami; test wczytuje eksportera przed zaleznymi (DENRES1 po DENBUS1). W grze zachowanie zalezy od kolejnosci odwiedzin map.',
  );
  L.push('- Opkody 0x815a-0x815c (sfall/patch) nieimplementowane, semantyka Z.');
  L.push('');
  L.push('## Znane wyjatki');
  L.push('');
  L.push(
    'Zrodlo dla bledow zmiennych zewnetrznych: lancuchy "External variable %s does not exist", programFatalError przerywa procedure rowniez w oryginale.',
  );
  L.push('');
  L.push('| id | mapa | uzasadnienie |');
  L.push('|---|---|---|');
  for (const k of known) L.push(`| ${k.id} | ${k.map} | ${k.reason.replace(/\|/g, '/')} |`);
  L.push('');
  L.push('## Tabela map');
  L.push('');
  L.push('| # | lookup | plik | wczytana | obiekty | skrypty | VmError | render | wyjatki |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    L.push(
      `| ${r.index} | ${r.lookupName} | ${r.mapName} | ${r.loaded ? 'tak' : 'NIE (brak pliku)'} | ${r.objects} | ${r.scripts} | ${r.vmErrors.length} | ${r.renderIssues.length} | ${r.known.join(', ') || '-'} |`,
    );
  }
  L.push('');
  return L.join('\n');
}
