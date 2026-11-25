import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Wstawia liste plikow powloki do sw.js (znacznik `__PRECACHE__`), z wersja zalezna od ich zawartosci. */
export function buildPrecache(files: Array<{ url: string; data: Uint8Array | string }>): {
  version: string;
  urls: string[];
} {
  const sorted = [...files].sort((a, b) => a.url.localeCompare(b.url));
  const h = createHash('sha256');
  for (const f of sorted) h.update(f.url).update('\0').update(f.data).update('\0');
  return { version: h.digest('hex').slice(0, 12), urls: ['./', ...sorted.map((f) => f.url)] };
}

export function injectPrecache(sw: string, pre: { version: string; urls: string[] }): string {
  const marker = 'const PRECACHE = null; /*__PRECACHE__*/';
  if (!sw.includes(marker)) throw new Error('sw.js: brak znacznika __PRECACHE__');
  return sw.replace(marker, `const PRECACHE = ${JSON.stringify(pre)};`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function pwaPrecachePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'f2-pwa-precache',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const all = walk(outDir).filter((p) => {
        const rel = relative(outDir, p).split('\\').join('/');
        return (
          !/\/(sw\.js|version\.json|\.DS_Store)$/.test(p) &&
          !p.endsWith('.map') &&
          // Silniki WASM (Fallout 1 CE, ADR-0022) ladowane na zadanie przy wyborze gry; poza precache PWA.
          !rel.startsWith('engines/')
        );
      });
      const pre = buildPrecache(
        all.map((p) => ({ url: relative(outDir, p).split('\\').join('/'), data: readFileSync(p) })),
      );
      const swPath = join(outDir, 'sw.js');
      writeFileSync(swPath, injectPrecache(readFileSync(swPath, 'utf8'), pre));
    },
  };
}
