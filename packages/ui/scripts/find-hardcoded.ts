/**
 * Lint i18n: znajduje w packages/ui/src/**\/*.tsx tekst UI bez t(...):
 *  - tekst JSX zawierajacy litery,
 *  - atrybuty/propsy aria-label, aria-description, title, label, placeholder, alt z literalem tekstowym.
 * Wyjscie: lista trafien; kod 1 gdy sa trafienia. Wyjatek: komentarz `i18n-ignore` w tej samej linii.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface Hit {
  file: string;
  line: number;
  kind: 'jsx-text' | 'attribute';
  text: string;
}

const TEXT_ATTRS = new Set([
  'aria-label',
  'aria-description',
  'title',
  'label',
  'placeholder',
  'alt',
]);
const HAS_LETTER = /\p{L}/u;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

export function scanSource(file: string, source: string): Hit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split('\n');
  const hits: Hit[] = [];
  const add = (node: ts.Node, kind: Hit['kind'], text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (lines[line]?.includes('i18n-ignore')) return;
    hits.push({ file, line: line + 1, kind, text: text.trim().replace(/\s+/g, ' ') });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) add(node, 'jsx-text', node.text);
    if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) && HAS_LETTER.test(init.text)) add(init, 'attribute', init.text);
      else if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (
          (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) &&
          HAS_LETTER.test(e.text)
        )
          add(e, 'attribute', e.text);
        else if (
          ts.isTemplateExpression(e) &&
          HAS_LETTER.test(e.head.text + e.templateSpans.map((s) => s.literal.text).join(''))
        )
          add(e, 'attribute', e.getText(sf));
      }
    }
    // Propsy obiektowe w opcjach: { label: 'Tekst' } / { title: '...' }
    if (
      ts.isPropertyAssignment(node) &&
      TEXT_ATTRS.has(node.name.getText(sf)) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
      HAS_LETTER.test(node.initializer.text)
    )
      add(node.initializer, 'attribute', node.initializer.text);
    if (
      ts.isPropertyAssignment(node) &&
      TEXT_ATTRS.has(node.name.getText(sf)) &&
      ts.isTemplateExpression(node.initializer) &&
      HAS_LETTER.test(
        node.initializer.head.text +
          node.initializer.templateSpans.map((x) => x.literal.text).join(''),
      )
    )
      add(node.initializer, 'attribute', node.initializer.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export function scanDir(root: string): Hit[] {
  return walk(root, []).flatMap((f) => scanSource(f, readFileSync(f, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '../../src'));
  const hits = scanDir(root);
  for (const h of hits)
    console.log(`${relative(process.cwd(), h.file)}:${h.line} [${h.kind}] ${h.text}`);
  console.log(`lint:i18n: ${hits.length} trafien`);
  process.exit(hits.length > 0 ? 1 : 0);
}
