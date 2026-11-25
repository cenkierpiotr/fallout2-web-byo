import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePackFile } from './lang-pack-plugin';

describe('resolvePackFile', () => {
  const root = mkdtempSync(join(tmpdir(), 'f2-pack-'));
  mkdirSync(join(root, 'game'));
  writeFileSync(join(root, 'game', 'pro_item.msg'), '{1}{}{x}');
  it('zwraca plik pakietu', () => {
    expect(resolvePackFile(root, '/lang-pack/pl/game/pro_item.msg')).toBe(
      join(root, 'game', 'pro_item.msg'),
    );
  });
  it('odrzuca brak pliku, inny prefiks i ucieczke z katalogu', () => {
    expect(resolvePackFile(root, '/lang-pack/pl/game/nie.msg')).toBeNull();
    expect(resolvePackFile(root, '/inne/game/pro_item.msg')).toBeNull();
    expect(resolvePackFile(root, '/lang-pack/pl/../../etc/passwd')).toBeNull();
    expect(resolvePackFile(root, '/lang-pack/pl/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });
});
