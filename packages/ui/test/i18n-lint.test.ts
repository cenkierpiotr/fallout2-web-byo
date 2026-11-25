import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanDir, scanSource } from '../scripts/find-hardcoded';
import en from '../i18n/en.json';
import pl from '../i18n/pl.json';
import optionsEn from '../i18n/options.en.json';
import optionsPl from '../i18n/options.pl.json';

const SRC = join(__dirname, '../src');

describe('lint i18n', () => {
  it('wykrywa tekst JSX i atrybuty bez t()', () => {
    const hits = scanSource(
      'x.tsx',
      `const a = <div title="Tytul" aria-label={t('k')}>Witaj <b>{t('x')}</b></div>;
       const b = <input placeholder="Szukaj" label={\`Etykieta \${x}\`} />;
       const c = { label: 'Opcja' };`,
    );
    expect(hits.map((h) => h.text)).toEqual([
      'Tytul',
      'Witaj',
      'Szukaj',
      '`Etykieta ${x}`',
      'Opcja',
    ]);
  });

  it('pomija wywolania t(), znaki bez liter i i18n-ignore', () => {
    const hits = scanSource(
      'x.tsx',
      `const a = <span>{t('k')} / 12 -</span>;
       const b = <i title="OK">x</i>; // i18n-ignore`,
    );
    expect(hits).toEqual([]);
  });

  it('zrodla packages/ui/src nie maja hardcoded tekstu', () => {
    expect(scanDir(SRC)).toEqual([]);
  });

  it('slowniki pl i en maja identyczny zestaw kluczy', () => {
    // PL ma dodatkowe formy mnogie (few/many), reszta musi byc identyczna.
    const base = (k: string) => k.replace(/\.(one|few|many|other)$/, '');
    const set = (o: object) => [...new Set(Object.keys(o).map(base))].sort();
    expect(set(optionsPl)).toEqual(set(optionsEn));
    expect(set(pl)).toEqual(set(en));
    const plain = (o: object) =>
      Object.keys(o)
        .filter((k) => !/\.(one|few|many|other)$/.test(k))
        .sort();
    expect(plain(pl)).toEqual(plain(en));
  });

  it('kazdy klucz uzyty w t(...) istnieje w slownikach', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p)) files.push(p);
      }
    };
    walk(SRC);
    const keys = new Set<string>();
    for (const f of files)
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g)) keys.add(m[1]!);
    const dict = { ...en, ...optionsEn } as Record<string, string>;
    expect([...keys].filter((k) => !(k in dict))).toEqual([]);
  });
});
