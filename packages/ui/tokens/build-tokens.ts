import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Tree<T> = { [key: string]: T | Tree<T> };

export interface Tokens {
  color: {
    bg: { panel: string; panelRaised: string; overlay: string };
    border: string;
    accent: string;
    accentHover: string;
    text: { primary: string; secondary: string; muted: string };
    state: { ok: string; warning: string; danger: string; info: string };
  };
  space: Record<'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8', number>;
  radius: { sm: number; md: number; lg: number };
  target: { min: { desktop: number; touch: number } };
  font: {
    family: { body: string; heading: string };
    size: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  };
  shadow: { '1': string; '2': string };
  motion: { fast: number; base: number };
  themes: Record<'retro' | 'high-contrast', { color: ThemeColors }>;
}

export interface ThemeColors {
  bg?: Partial<Tokens['color']['bg']>;
  text?: Partial<Tokens['color']['text']>;
  state?: Partial<Tokens['color']['state']>;
  border?: string;
  accent?: string;
  accentHover?: string;
}

type Leaf = string | number;

function walk(obj: unknown, path: string[], out: Array<[string[], Leaf]>): void {
  if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Tree<Leaf>)) walk(v, [...path, k], out);
  } else {
    out.push([path, obj as Leaf]);
  }
}

/** Splaszcza tokeny bazowe (bez `themes`) do par [sciezka, wartosc]. */
export function flattenTokens(t: Tokens): Array<[string[], Leaf]> {
  const out: Array<[string[], Leaf]> = [];
  for (const [k, v] of Object.entries(t)) {
    if (k === 'themes') continue;
    walk(v, [k], out);
  }
  return out;
}

export function cssVarName(path: string[]): string {
  return '--' + path.join('-');
}

function cssValue(path: string[], v: Leaf): string {
  if (typeof v === 'string') return v;
  const head = path[0];
  if (head === 'font' && path[1] === 'size') return `calc(${v}px * var(--font-scale))`;
  if (head === 'motion') return `${v}ms`;
  return `${v}px`;
}

function block(selector: string, decls: string[]): string {
  return `${selector} {\n${decls.map((d) => `  ${d}`).join('\n')}\n}`;
}

export function buildCss(t: Tokens): string {
  const root: string[] = [];
  for (const [path, v] of flattenTokens(t)) {
    if (path[0] === 'target') continue; // --target-min zalezy od profilu
    root.push(`${cssVarName(path)}: ${cssValue(path, v)};`);
  }
  root.push('--font-scale: 1;');
  root.push(`--target-min: ${t.target.min.desktop}px;`);

  const parts = [
    '/* Generowany z tokens.json (pnpm --filter @f2/ui tokens). Nie edytowac recznie. */',
  ];
  parts.push(block(':root', root));
  for (const theme of ['retro', 'high-contrast'] as const) {
    const decls: string[] = [];
    const flat: Array<[string[], Leaf]> = [];
    walk(t.themes[theme].color, ['color'], flat);
    for (const [path, v] of flat) decls.push(`${cssVarName(path)}: ${v};`);
    parts.push(block(`[data-theme="${theme}"]`, decls));
  }
  parts.push(block('[data-profile="touch"]', [`--target-min: ${t.target.min.touch}px;`]));
  parts.push(
    `@media (prefers-reduced-motion: reduce) {\n  :root {\n    --motion-fast: 0ms;\n    --motion-base: 0ms;\n  }\n}`,
  );
  return parts.join('\n\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tokens = JSON.parse(
    readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'),
  ) as Tokens;
  const out = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
  writeFileSync(out, buildCss(tokens));
  console.log(`zapisano ${out}`);
}
