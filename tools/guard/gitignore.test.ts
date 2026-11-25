import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(here, '../../.gitignore'), 'utf-8');
const patterns = new Set(
  content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#')),
);

describe('ochrona .gitignore (git na Linuksie rozroznia wielkosc liter)', () => {
  it.each([
    '/game/',
    '*.dat',
    '*.DAT',
    '*.frm',
    '*.FRM',
    '*.iso',
    '.env',
    '*.fr[0-5]',
    '*.FR[0-5]',
  ])('zawiera wymagany wpis: %s', (entry) => {
    expect(patterns.has(entry)).toBe(true);
  });

  it('ma warianty malych i wielkich liter dla dat i frm', () => {
    for (const e of ['*.dat', '*.DAT', '*.frm', '*.FRM']) {
      expect(patterns.has(e), `brak ${e}`).toBe(true);
    }
  });

  it.each(['game/x', 'a.dat', 'a.DAT', 'a.FRM', 'a.fr3'])(
    'git check-ignore ignoruje probna sciezke: %s',
    (path) => {
      const r = spawnSync('git', ['check-ignore', '-q', '--no-index', path], {
        cwd: join(here, '../..'),
      });
      // exit 0 = ignorowana. exit 128 (fatal: beyond a symbolic link) zdarza sie gdy
      // sciezka przechodzi przez symlink (np. lokalny link game/ -> folder gry) - wtedy
      // git nie traversuje symlinka, wiec weryfikujemy pattern recznie.
      if (r.status === 128) {
        const seg = path.startsWith('game/') ? '/game/' : path.replace(/^[^./]+/, '*.');
        expect(patterns.has(seg), `${path} (pattern ${seg}) nie jest w .gitignore`).toBe(true);
        return;
      }
      expect(r.status, `${path} nie jest ignorowana`).toBe(0);
    },
  );
});
