#!/usr/bin/env node
// Straznik: pliki gry i pakiety PL (tlumaczenia tekstow gry) nie moga trafic do repo ani do artefaktu builda.
// Uzycie: node scripts/guard-no-game-files.mjs [--dist <katalog>]  (domyslnie skanuje git ls-files)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_EXT = new Set([
  'dat',
  'frm',
  'fr0',
  'fr1',
  'fr2',
  'fr3',
  'fr4',
  'fr5',
  'acm',
  'mve',
  'iso',
  'map',
  'pro',
  'int',
  'msg',
  'lip',
  'pal',
  'lst',
  'gam',
  'aaf',
  'fon',
  'msk',
  'rix',
  'sve',
  'gcd',
  'bio',
  'exe',
  'dll',
  '7z',
  'rar',
  'zip',
]);
const FORBIDDEN_PATH = [
  /^game\//i,
  /^i18n\/work\//i,
  /^assets-hd\//i,
  /(^|\/)pl-pack[^/]*\//i,
  /(^|\/)pakiet-pl\//i,
];

export function violations(paths) {
  const bad = [];
  for (const p of paths) {
    const ext = p.includes('.') ? p.split('.').pop().toLowerCase() : '';
    if (FORBIDDEN_EXT.has(ext)) bad.push(`${p} (rozszerzenie .${ext})`);
    else if (FORBIDDEN_PATH.some((r) => r.test(p))) bad.push(`${p} (zabroniony katalog)`);
  }
  return bad;
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, acc);
    else acc.push(f);
  }
  return acc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--dist');
  const paths =
    i > 0
      ? walk(process.argv[i + 1])
      : execFileSync('git', ['ls-files', '-z']).toString().split('\0').filter(Boolean);
  const bad = violations(paths);
  if (bad.length) {
    console.error('STRAZNIK: znaleziono pliki gry/pakiety PL:\n' + bad.join('\n'));
    process.exit(1);
  }
  console.log(`Straznik OK (${paths.length} plikow)`);
}
