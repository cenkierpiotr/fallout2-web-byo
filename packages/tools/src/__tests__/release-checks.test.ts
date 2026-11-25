import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDistClean, checkDocs, h2Headings } from '../release-checks.js';

const repo = resolve(__dirname, '../../../..');

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'f2rc-'));
}

describe('checkDistClean', () => {
  it('czysty dist przechodzi', () => {
    const d = tmp();
    writeFileSync(join(d, 'index.html'), '<html></html>');
    const r = checkDistClean(d, repo);
    expect(r.ok).toBe(true);
  });
  it('plik gry w dist jest wykryty', () => {
    const d = tmp();
    writeFileSync(join(d, 'master.dat'), 'x');
    expect(checkDistClean(d, repo).ok).toBe(false);
  });
  it('limit rozmiaru', () => {
    const d = tmp();
    writeFileSync(join(d, 'a.js'), 'x'.repeat(100));
    expect(checkDistClean(d, repo, 50).problems.join()).toContain('limit');
  });
  it('brak katalogu', () => {
    expect(checkDistClean('/nie/istnieje', repo).ok).toBe(false);
  });
});

describe('checkDocs', () => {
  function fixture(rb: string, pl: string, en: string): string {
    const r = tmp();
    writeFileSync(join(r, 'package.json'), '{"scripts":{"build":"x","release":"y"}}');
    mkdirSync(join(r, 'packages/tools/src'), { recursive: true });
    writeFileSync(join(r, 'packages/tools/src/cli.ts'), "cmd === 'docs-check'");
    mkdirSync(join(r, 'docs'), { recursive: true });
    mkdirSync(join(r, 'deploy'), { recursive: true });
    writeFileSync(join(r, 'deploy/deploy.sh'), '#!/bin/sh');
    writeFileSync(join(r, 'docs/runbook.md'), rb);
    writeFileSync(join(r, 'docs/pl.md'), pl);
    writeFileSync(join(r, 'docs/en.md'), en);
    return r;
  }
  const files = ['docs/runbook.md'];
  const pairs: Array<[string, string]> = [['docs/pl.md', 'docs/en.md']];
  it('poprawne komendy, link i parzystosc H2', () => {
    const r = fixture(
      '`pnpm build` `pnpm tools docs-check` `deploy/deploy.sh` [x](pl.md)',
      '## A\n## B',
      '## A\n## B',
    );
    expect(checkDocs(r, files, pairs).problems).toEqual([]);
  });
  it('wykrywa nieistniejacy skrypt, komende, deploy i martwy link', () => {
    const r = fixture('`pnpm nope` `pnpm tools zzz` `deploy/nie.sh` [x](brak.md)', '## A', '## A');
    const p = checkDocs(r, files, pairs).problems.join('\n');
    expect(p).toContain('pnpm nope');
    expect(p).toContain('pnpm tools zzz');
    expect(p).toContain('deploy/nie.sh');
    expect(p).toContain('brak.md');
  });
  it('wykrywa rozjazd H2 PL/EN', () => {
    const r = fixture('', '## A\n## B', '## A');
    expect(checkDocs(r, files, pairs).problems.join()).toContain('liczba H2');
  });
  it('h2Headings', () => {
    expect(h2Headings('# T\n## A\ntext\n## B')).toEqual(['A', 'B']);
  });
});

describe('dokumentacja uzytkownika w repo', () => {
  it('PL i EN maja te same H2', () => {
    const r = checkDocs(
      repo,
      ['docs/user/README.pl.md', 'docs/user/README.en.md'],
      [['docs/user/README.pl.md', 'docs/user/README.en.md']],
    );
    expect(r.problems).toEqual([]);
  });
});
