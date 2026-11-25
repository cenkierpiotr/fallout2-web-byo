import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVersion, readSchemaVersion } from './version-plugin';

describe('version-plugin', () => {
  it('readSchemaVersion czyta stala', () => {
    expect(readSchemaVersion('export const SAVE_SCHEMA_VERSION = 4;')).toBe(4);
    expect(() => readSchemaVersion('nic')).toThrow();
  });
  it('buildVersion laczy package.json i schema.ts, sha unknown poza gitem', () => {
    const root = mkdtempSync(join(tmpdir(), 'f2ver-'));
    writeFileSync(join(root, 'package.json'), '{"version":"1.2.3"}');
    mkdirSync(join(root, 'packages/engine-core/src/save'), { recursive: true });
    writeFileSync(
      join(root, 'packages/engine-core/src/save/schema.ts'),
      'export const SAVE_SCHEMA_VERSION = 7;',
    );
    const v = buildVersion(root, new Date('2026-11-11T10:00:00Z'));
    expect(v).toMatchObject({
      semver: '1.2.3',
      schemaVersion: 7,
      builtAt: '2026-11-11T10:00:00.000Z',
    });
    expect(typeof v.sha).toBe('string');
  });
});
