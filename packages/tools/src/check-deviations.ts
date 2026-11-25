import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DeviationsReport {
  ok: boolean;
  problems: string[];
  devIds: string[];
  fixIds: string[];
}

/** Identyfikatory poprawek z `FIX_REGISTRY` (`id`, `status`) wyciagniete z zrodla fixes.ts bez importu pakietu. */
export function parseFixRegistry(src: string): { id: string; status: string }[] {
  const out: { id: string; status: string }[] = [];
  const re = /\n\s+id: '([A-Za-z0-9]+)',[\s\S]*?\n\s+status: '(active|pending|external)',/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push({ id: m[1]!, status: m[2]! });
  return out;
}

const STATUS_BULLET: Record<string, string> = {
  active: '- Aktywne',
  external: '- Zewnetrzne',
  pending: '- W przygotowaniu',
};

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) listSourceFiles(p, acc);
    else if (/\.(ts|tsx|json)$/.test(n) && !/\.test\.tsx?$/.test(n)) acc.push(p);
  }
  return acc;
}

/**
 * check-deviations: spojnosc `docs/specs/deviations.md` z kodem.
 * 1. Kazdy wpis rejestru `FIX_REGISTRY` jest wymieniony w odpowiedniej linii dokumentu (aktywne / zewnetrzne / w przygotowaniu).
 * 2. Kazde `rules.fixes.<id>` w dokumencie istnieje w rejestrze.
 * 3. Identyfikatory `DEV-*` sa unikalne i maja status D, W lub Z.
 * 4. Sciezki w odwrotnych apostrofach (`packages/...`, `apps/...`, `docs/...`, `tools/...`) istnieja.
 * 5. Opcje wskazane jako `opcja \`x\`` istnieja w zrodlach (packages, apps).
 */
export function checkDeviations(root: string): DeviationsReport {
  const problems: string[] = [];
  const docPath = join(root, 'docs/specs/deviations.md');
  const fixesPath = join(root, 'packages/rules/src/fixes.ts');
  if (!existsSync(docPath))
    return { ok: false, problems: [`brak ${docPath}`], devIds: [], fixIds: [] };
  if (!existsSync(fixesPath))
    return { ok: false, problems: [`brak ${fixesPath}`], devIds: [], fixIds: [] };
  const doc = readFileSync(docPath, 'utf8');
  const reg = parseFixRegistry(readFileSync(fixesPath, 'utf8'));
  if (reg.length === 0) problems.push('FIX_REGISTRY: nie znaleziono wpisow');
  const lines = doc.split('\n');

  for (const f of reg) {
    const prefix = STATUS_BULLET[f.status]!;
    const bullet = lines.find((l) => l.startsWith(prefix));
    if (!bullet) problems.push(`brak linii "${prefix}" dla poprawki ${f.id}`);
    else if (!new RegExp(`\\b${f.id}\\b`).test(bullet))
      problems.push(
        `poprawka ${f.id} (status ${f.status}) nie jest wymieniona w linii "${prefix}"`,
      );
  }
  const known = new Set(reg.map((f) => f.id));
  for (const m of doc.matchAll(/rules\.fixes\.([A-Za-z0-9]+)/g)) {
    if (m[1] !== undefined && m[1] !== 'id' && !known.has(m[1]))
      problems.push(`dokument wymienia nieistniejaca poprawke rules.fixes.${m[1]}`);
  }

  const devIds: string[] = [];
  for (const l of lines) {
    const m = /^- (DEV-[A-Z]?\d+)\b(.*)$/.exec(l);
    if (!m) continue;
    const id = m[1]!;
    if (devIds.includes(id)) problems.push(`zdublowany identyfikator ${id}`);
    devIds.push(id);
    if (!/Status:? (D|W|Z)\b|Status (D|W|Z)\b/.test(m[2]!))
      problems.push(`${id}: brak statusu pewnosci (D/W/Z)`);
  }
  if (devIds.length === 0) problems.push('brak wpisow DEV-*');

  for (const m of doc.matchAll(/`((?:packages|apps|docs|tools)\/[A-Za-z0-9_./-]+)`/g)) {
    const p = m[1]!;
    if (/[*<>]/.test(p)) continue;
    if (!existsSync(join(root, p))) problems.push(`sciezka nie istnieje: ${p}`);
  }

  const opts = [...doc.matchAll(/opcja `([A-Za-z0-9_]+)`/g)].map((m) => m[1]!);
  if (opts.length) {
    const files = [
      ...listSourceFiles(join(root, 'packages')),
      ...listSourceFiles(join(root, 'apps')),
    ];
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const o of opts) {
      if (!new RegExp(`\\b${o}\\b`).test(text))
        problems.push(`opcja \`${o}\` z dokumentu nie istnieje w kodzie`);
    }
  }
  return { ok: problems.length === 0, problems, devIds, fixIds: reg.map((f) => f.id) };
}
