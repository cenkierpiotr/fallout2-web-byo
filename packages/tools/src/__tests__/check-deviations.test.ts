import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDeviations, parseFixRegistry } from '../check-deviations.js';

const repo = resolve(__dirname, '../../../..');
const hasRepoSpec = existsSync(join(repo, 'docs/specs/deviations.md'));

const FIXES = `
export const FIX_REGISTRY = [
  {
    id: 'aaaFix',
    group: 'skills',
    status: 'active',
  },
  {
    id: 'bbbFix',
    group: 'skills',
    status: 'pending',
  },
];`;

function fixture(doc: string, extra: Record<string, string> = {}): string {
  const r = mkdtempSync(join(tmpdir(), 'f2dev-'));
  mkdirSync(join(r, 'docs/specs'), { recursive: true });
  mkdirSync(join(r, 'packages/rules/src'), { recursive: true });
  writeFileSync(join(r, 'docs/specs/deviations.md'), doc);
  writeFileSync(join(r, 'packages/rules/src/fixes.ts'), FIXES);
  for (const [p, c] of Object.entries(extra)) {
    mkdirSync(join(r, p, '..'), { recursive: true });
    writeFileSync(join(r, p), c);
  }
  return r;
}

const GOOD = `# DEV
- DEV-1 Cos. Status D.
- Aktywne: aaaFix.
- W przygotowaniu: bbbFix.
`;

describe('parseFixRegistry', () => {
  it('czyta id i status', () => {
    expect(parseFixRegistry(FIXES)).toEqual([
      { id: 'aaaFix', status: 'active' },
      { id: 'bbbFix', status: 'pending' },
    ]);
  });
});

describe('checkDeviations', () => {
  it('spojny dokument przechodzi', () => {
    expect(checkDeviations(fixture(GOOD)).problems).toEqual([]);
  });
  it('poprawka z rejestru bez wpisu w dokumencie', () => {
    const r = checkDeviations(fixture(GOOD.replace('bbbFix', 'xxx')));
    expect(r.problems.join()).toContain('bbbFix');
  });
  it('poprawka w zlej linii statusu', () => {
    const r = checkDeviations(
      fixture(
        GOOD.replace('Aktywne: aaaFix', 'Aktywne: zzz').replace(
          'przygotowaniu: bbbFix',
          'przygotowaniu: aaaFix, bbbFix',
        ),
      ),
    );
    expect(r.problems.join()).toContain('aaaFix');
    expect(r.ok).toBe(false);
  });
  it('rules.fixes.<id> spoza rejestru', () => {
    const r = checkDeviations(fixture(`${GOOD}\nPrzelacznik \`rules.fixes.nieMa\`.\n`));
    expect(r.problems.join()).toContain('nieMa');
  });
  it('zdublowany DEV i brak statusu', () => {
    const r = checkDeviations(fixture(`${GOOD}- DEV-1 Drugi.\n`));
    expect(r.problems.join()).toContain('zdublowany');
    expect(r.problems.join()).toContain('brak statusu');
  });
  it('nieistniejaca sciezka i opcja', () => {
    const r = checkDeviations(
      fixture(`${GOOD}Zob. \`packages/nie/ma.ts\`, opcja \`zlaOpcja\`.\n`, {
        'packages/a/x.ts': 'export const ok = 1;',
      }),
    );
    expect(r.problems.join()).toContain('packages/nie/ma.ts');
    expect(r.problems.join()).toContain('zlaOpcja');
  });
  it.skipIf(!hasRepoSpec)('prawdziwe repo jest spojne', () => {
    expect(checkDeviations(repo).problems).toEqual([]);
  });
});
