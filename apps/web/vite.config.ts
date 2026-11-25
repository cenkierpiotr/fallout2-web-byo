import { defineConfig } from 'vite';
import { langPackPlugin } from './src/lang-pack-plugin';
import { pwaPrecachePlugin } from './src/pwa-precache-plugin';
import { versionPlugin } from './src/version-plugin';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { version: semver } = JSON.parse(
  readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

let sha = 'unknown';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  sha = 'unknown';
}

export default defineConfig({
  plugins: [langPackPlugin(), pwaPrecachePlugin(), versionPlugin()],
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  worker: { format: 'es', rollupOptions: {} },
  // BUNDLE_VERSION: wersja wbudowana w JS (topbar pokazuje graczu, ktory bundle faktycznie dziala).
  define: {
    'import.meta.env.BUNDLE_VERSION': JSON.stringify(
      process.env['BUNDLE_VERSION'] ?? `${semver}+${sha}`,
    ),
  },
  // Safari 15+ (iOS): esbuild obniza skladnie, ktorej Safari 15 nie zna.
  build: { target: ['es2022', 'safari15'] },
  server: { host: true },
});
