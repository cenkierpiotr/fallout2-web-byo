import { readFileSync, writeFileSync } from 'node:fs';
import { migrate } from '@f2/engine-core';

export interface MigrateResult {
  ok: boolean;
  from: number | null;
  to: number | null;
  /** save-corrupt | save-too-new */
  error?: string;
  json?: string;
}

/** Migruje tekst zapisu (JSON) do biezacego schematu; nie rzuca, zwraca kod bledu. */
export function migrateSaveText(text: string): MigrateResult {
  let from: number | null = null;
  try {
    const v = (JSON.parse(text) as { schemaVersion?: unknown }).schemaVersion;
    from = typeof v === 'number' ? v : null;
  } catch {
    /* migrate zwroci save-corrupt */
  }
  const r = migrate(text);
  if ('error' in r) return { ok: false, from, to: null, error: r.error };
  return { ok: true, from, to: r.schemaVersion, json: JSON.stringify(r) };
}

/** CLI: `save-migrate <plik.json>... [--out <plik>]` (--out tylko dla jednego wejscia). Kod 1 gdy ktorykolwiek zapis odrzucony. */
export function runSaveMigrate(args: string[]): void {
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const files = args.filter((_, i) => outIdx < 0 || (i !== outIdx && i !== outIdx + 1));
  if (files.length === 0 || (out && files.length !== 1)) {
    process.stderr.write(
      'uzycie: tools save-migrate <plik.json>... [--out <plik>] (--out: jeden plik)\n',
    );
    process.exit(2);
  }
  let bad = 0;
  for (const f of files) {
    const r = migrateSaveText(readFileSync(f, 'utf8'));
    if (r.ok) {
      process.stdout.write(`${f}: v${r.from} -> v${r.to} OK\n`);
      if (out) writeFileSync(out, r.json!);
    } else {
      bad++;
      process.stdout.write(`${f}: v${r.from ?? '?'} ODRZUCONY (${r.error})\n`);
    }
  }
  process.exit(bad ? 1 : 0);
}
