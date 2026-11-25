import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const PREFIX = '/lang-pack/pl/';

/** Rozwiazuje URL pakietu PL na plik w katalogu pakietu; null przy ucieczce z katalogu lub braku pliku. */
export function resolvePackFile(root: string, url: string): string | null {
  if (!url.startsWith(PREFIX)) return null;
  const rel = decodeURIComponent(url.slice(PREFIX.length).split('?')[0] ?? '');
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/**
 * Dev/preview: serwuje pakiet jezykowy PL (poza repo) pod `/lang-pack/pl/*`.
 * Katalog: `F2_LANG_PACK_DIR` (np. .../lang-packs/pl/text/polish); bez niego wtyczka nic nie robi.
 */
export function langPackPlugin(dir = process.env['F2_LANG_PACK_DIR']): Plugin {
  const root = dir && existsSync(dir) ? normalize(dir) : null;
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const file = root && req.url ? resolvePackFile(root, req.url) : null;
    if (!file) return next();
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(readFileSync(file));
  };
  return {
    name: 'f2-lang-pack',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}
