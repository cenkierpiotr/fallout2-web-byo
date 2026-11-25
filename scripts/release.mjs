#!/usr/bin/env node
// Uzycie: node scripts/release.mjs <semver> [--tag]
// Sprawdza semver i wpis w CHANGELOG.md, podbija wersje w package.json, buduje i sprawdza dist.
// Tag git tylko z --tag.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [ver, flag] = process.argv.slice(2);
if (!ver || !/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error('uzycie: pnpm release <semver> [--tag]');
  process.exit(2);
}
const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!new RegExp(`^## ${ver.replaceAll('.', '\\.')}\\b`, 'm').test(changelog)) {
  console.error(`CHANGELOG.md: brak sekcji "## ${ver}"`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = ver;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('pnpm', ['--filter', '@f2/web', 'build']);
run('pnpm', ['tools', 'check-dist-clean', 'apps/web/dist']);
if (flag === '--tag') run('git', ['tag', '-a', `v${ver}`, '-m', `v${ver}`]);
console.log(`wersja ${ver} zbudowana w apps/web/dist`);
