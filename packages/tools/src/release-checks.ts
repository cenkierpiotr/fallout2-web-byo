import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Suma rozmiarow plikow katalogu (rekurencyjnie). */
export function dirSize(dir: string): number {
  let total = 0;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    total += st.isDirectory() ? dirSize(p) : st.size;
  }
  return total;
}

export interface DistReport {
  ok: boolean;
  bytes: number;
  problems: string[];
}

/** check-dist-clean: straznik plikow gry (scripts/guard-no-game-files.mjs --dist) + limit rozmiaru (domyslnie 5 MB). */
export function checkDistClean(
  dist: string,
  repoRoot: string,
  maxBytes = 5 * 1024 * 1024,
): DistReport {
  const problems: string[] = [];
  if (!existsSync(dist)) return { ok: false, bytes: 0, problems: [`brak katalogu ${dist}`] };
  try {
    execFileSync('node', [join(repoRoot, 'scripts/guard-no-game-files.mjs'), '--dist', dist], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    problems.push(
      `straznik: ${(err.stderr?.toString() || err.stdout?.toString() || 'blad').trim()}`,
    );
  }
  const bytes = dirSize(dist);
  if (bytes > maxBytes) problems.push(`dist ${bytes} B > limit ${maxBytes} B`);
  return { ok: problems.length === 0, bytes, problems };
}

export function h2Headings(md: string): string[] {
  return md
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.slice(3).trim());
}

export interface DocsReport {
  ok: boolean;
  problems: string[];
}

const KNOWN_BINARIES = new Set([
  'pnpm',
  'node',
  'git',
  'ssh',
  'rsync',
  'curl',
  'docker',
  'rclone',
  'nginx',
  'ln',
  'npx',
  'tsx',
]);

/**
 * docs-check: (1) wewnetrzne linki markdown `](sciezka)` istnieja, (2) komendy `pnpm <skrypt>` i `pnpm tools <cmd>`
 * z backtickow istnieja w package.json / cli.ts, (3) skrypty `deploy/...` istnieja, (4) PL i EN maja te same liczby H2.
 */
export function checkDocs(
  repoRoot: string,
  files: string[],
  pairs: Array<[string, string]>,
): DocsReport {
  const problems: string[] = [];
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = new Set(Object.keys(pkg.scripts ?? {}));
  const cliSrc = existsSync(join(repoRoot, 'packages/tools/src/cli.ts'))
    ? readFileSync(join(repoRoot, 'packages/tools/src/cli.ts'), 'utf8')
    : '';
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) {
      problems.push(`${rel}: brak pliku`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = (m[1] ?? '').split('#')[0] ?? '';
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (!existsSync(resolve(dirname(abs), target)))
        problems.push(`${rel}: martwy link ${target}`);
    }
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const parts = (m[1] ?? '').trim().split(/\s+/);
      if (parts[0] === 'pnpm' && parts[1]) {
        if (parts[1] === 'tools') {
          const sub = parts[2];
          if (sub && !cliSrc.includes(`'${sub}'`))
            problems.push(`${rel}: nieznana komenda pnpm tools ${sub}`);
        } else if (
          !scripts.has(parts[1]) &&
          !['install', 'i', 'exec', 'dlx', 'add', 'run', '--filter'].includes(parts[1])
        ) {
          problems.push(`${rel}: brak skryptu pnpm ${parts[1]}`);
        }
      } else if (
        parts[0] &&
        /^deploy\/\S+/.test(parts[0]) &&
        !existsSync(resolve(repoRoot, parts[0]))
      ) {
        problems.push(`${rel}: brak ${parts[0]}`);
      } else if (parts[0] && KNOWN_BINARIES.has(parts[0])) {
        /* zewnetrzne polecenie: nie weryfikujemy */
      }
    }
  }
  for (const [a, b] of pairs) {
    const ha = h2Headings(readFileSync(resolve(repoRoot, a), 'utf8'));
    const hb = h2Headings(readFileSync(resolve(repoRoot, b), 'utf8'));
    if (ha.length !== hb.length)
      problems.push(`${a} vs ${b}: liczba H2 ${ha.length} != ${hb.length}`);
  }
  return { ok: problems.length === 0, problems };
}
