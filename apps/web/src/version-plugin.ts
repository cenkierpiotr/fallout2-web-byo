import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface BuildVersion {
  semver: string;
  sha: string;
  schemaVersion: number;
  builtAt: string;
}

/** Wyciaga `SAVE_SCHEMA_VERSION` z zrodla schematu zapisu (bez importu pakietu w configu vite). */
export function readSchemaVersion(schemaSource: string): number {
  const m = /export const SAVE_SCHEMA_VERSION\s*=\s*(\d+)/.exec(schemaSource);
  if (!m) throw new Error('brak SAVE_SCHEMA_VERSION w schema.ts');
  return Number(m[1]);
}

export function buildVersion(root: string, now = new Date()): BuildVersion {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    /* build poza gitem */
  }
  const schema = readSchemaVersion(
    readFileSync(join(root, 'packages/engine-core/src/save/schema.ts'), 'utf8'),
  );
  return { semver: pkg.version, sha, schemaVersion: schema, builtAt: now.toISOString() };
}

/** Zapisuje `version.json` do dist (pobierany przez UpdateManager i /version.json w deployu). */
export function versionPlugin(repoRoot = resolve(__dirname, '../../..')): Plugin {
  let outDir = 'dist';
  return {
    name: 'f2-version-json',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      writeFileSync(
        join(outDir, 'version.json'),
        `${JSON.stringify(buildVersion(repoRoot), null, 2)}\n`,
      );
    },
  };
}
