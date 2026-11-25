// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCss, cssVarName, flattenTokens, type Tokens } from '../tokens/build-tokens';

const tokensPath = fileURLToPath(new URL('../tokens/tokens.json', import.meta.url));
const cssPath = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')) as Tokens;

function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad hex ${hex}`);
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type ColorTree = Tokens['color'];
function themeColors(theme: 'modern' | 'retro' | 'high-contrast'): ColorTree {
  if (theme === 'modern') return tokens.color;
  const over = tokens.themes[theme].color;
  return {
    ...tokens.color,
    ...over,
    bg: { ...tokens.color.bg, ...over.bg },
    text: { ...tokens.color.text, ...over.text },
    state: { ...tokens.color.state, ...over.state },
  };
}

describe('build-tokens', () => {
  const css = buildCss(tokens);

  it('emits every token as --<path>', () => {
    const flat = flattenTokens(tokens);
    expect(flat.length).toBeGreaterThan(35);
    for (const [path] of flat) {
      if (path[0] === 'target') continue;
      expect(css, path.join('.')).toContain(`${cssVarName(path)}:`);
    }
    for (const name of [
      '--color-bg-panel',
      '--color-bg-panelRaised',
      '--color-bg-overlay',
      '--color-border',
      '--color-accent',
      '--color-accentHover',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-muted',
      '--color-state-ok',
      '--color-state-warning',
      '--color-state-danger',
      '--color-state-info',
      '--space-1',
      '--space-8',
      '--radius-sm',
      '--radius-lg',
      '--font-family-body',
      '--font-size-xxl',
      '--shadow-1',
      '--shadow-2',
      '--motion-fast',
      '--motion-base',
      '--target-min',
      '--font-scale',
    ]) {
      expect(css, name).toContain(`${name}:`);
    }
  });

  it('has theme and profile selectors', () => {
    expect(css).toContain(':root');
    expect(css).toContain('[data-theme="retro"]');
    expect(css).toContain('[data-theme="high-contrast"]');
    expect(css).toContain('[data-profile="touch"]');
  });

  it('touch profile sets --target-min 48px (desktop 32px)', () => {
    const root = /:root\s*\{[^}]*\}/.exec(css)![0];
    expect(root).toMatch(/--target-min:\s*32px/);
    const touch = /\[data-profile="touch"\]\s*\{[^}]*\}/.exec(css)![0];
    expect(touch).toMatch(/--target-min:\s*48px/);
  });

  it('font sizes are multiplied by --font-scale', () => {
    expect(css).toMatch(/--font-size-md:\s*calc\(18px \* var\(--font-scale\)\)/);
    expect(css).toMatch(/--font-scale:\s*1;/);
  });

  it('reduced motion zeroes motion tokens', () => {
    const idx = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(idx);
    expect(block).toMatch(/--motion-fast:\s*0ms/);
    expect(block).toMatch(/--motion-base:\s*0ms/);
  });

  it('committed tokens.css is up to date', () => {
    expect(readFileSync(cssPath, 'utf8')).toBe(css);
  });
});

describe('WCAG contrast', () => {
  for (const theme of ['modern', 'retro', 'high-contrast'] as const) {
    const c = themeColors(theme);
    const minPrimary = theme === 'high-contrast' ? 7 : 4.5;
    for (const surface of ['panel', 'panelRaised', 'overlay'] as const) {
      it(`${theme}: text.primary on bg.${surface} >= ${minPrimary}`, () => {
        expect(contrast(c.text.primary, c.bg[surface])).toBeGreaterThanOrEqual(minPrimary);
      });
      it(`${theme}: text.secondary on bg.${surface} >= 4.5`, () => {
        expect(contrast(c.text.secondary, c.bg[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${theme}: text.muted on bg.panel >= 4.5`, () => {
      expect(contrast(c.text.muted, c.bg.panel)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: accent on bg.panel >= 4.5 (text/links) and state colors >= 4.5`, () => {
      expect(contrast(c.accent, c.bg.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentHover, c.bg.panel)).toBeGreaterThanOrEqual(4.5);
      for (const k of ['ok', 'warning', 'danger', 'info'] as const) {
        expect(contrast(c.state[k], c.bg.panel), k).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${theme}: border on bg.panel >= 3 (non-text UI)`, () => {
      expect(contrast(c.border, c.bg.panel)).toBeGreaterThanOrEqual(3);
    });
  }

  it('modern theme is dark with amber accent (ADR-0005)', () => {
    expect(lum(tokens.color.bg.panel)).toBeLessThan(0.05);
    const n = parseInt(tokens.color.accent.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(120);
    expect(b).toBeLessThan(100);
  });
});
