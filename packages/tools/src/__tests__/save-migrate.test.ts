import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeWorld } from '@f2/engine-core';
import { arbitraryWorld } from '../../../engine-core/test/save-fixtures.js';
import { migrateSaveText } from '../save-migrate.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;

const meta = {
  slot: 'quick',
  name: 'q',
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime: 1,
  thumbnail: null,
  engineVersion: '0',
};

/** Zapis w schemacie biezacym (v4) jako obiekt JSON. */
const latest = (seed = 5): Rec =>
  JSON.parse(JSON.stringify(serializeWorld(arbitraryWorld(seed), meta)));

/** Cofniecie do v3 (bez perkPending), v2 i v1 (bez hp/radiation/poison/ammoPid) wg migracji w engine-core. */
function downgrade(g: Rec, to: 1 | 2 | 3): Rec {
  delete g.world.player.progress.perkPending;
  g.schemaVersion = to;
  if (to === 1) {
    delete g.world.player.hp;
    delete g.world.player.radiation;
    delete g.world.player.poison;
    const strip = (items: Rec[]): void =>
      items.forEach((i) => {
        delete i.ammoPid;
        strip(i.contents);
      });
    strip(g.world.player.inventory);
    for (const m of g.maps)
      for (const e of m.elevations) for (const o of e.objects) strip(o.inventory);
  }
  return g;
}

describe('save-migrate: lancuch migracji v1-v4', () => {
  it.each([1, 2, 3] as const)('v%i -> biezacy schemat', (v) => {
    const g = downgrade(latest(), v);
    const r = migrateSaveText(JSON.stringify(g));
    expect(r.ok).toBe(true);
    expect(r.from).toBe(v);
    expect(r.to).toBe(7);
    const out = JSON.parse(r.json!);
    expect(out.world.player.progress.perkPending).toBe(false);
    expect(typeof out.world.player.hp).toBe('number');
  });
  it('v4 jest bez zmian (idempotencja)', () => {
    const g = latest(4);
    const a = migrateSaveText(JSON.stringify(g));
    expect(a.ok).toBe(true);
    const b = migrateSaveText(a.json!);
    expect(b.json).toBe(a.json);
  });
  it('migracja wielokrotna daje ten sam wynik', () => {
    const g = downgrade(latest(), 1);
    const a = migrateSaveText(JSON.stringify(g));
    const b = migrateSaveText(JSON.stringify(g));
    expect(a.json).toBe(b.json);
    expect(migrateSaveText(a.json!).json).toBe(a.json);
  });
  it('nowszy schemat = save-too-new, nie cicha korupcja', () => {
    const g = latest();
    g.schemaVersion = 8;
    expect(migrateSaveText(JSON.stringify(g))).toMatchObject({ ok: false, error: 'save-too-new' });
  });
  it('uciety JSON i smieci = save-corrupt', () => {
    expect(migrateSaveText('{"schemaVersion":')).toMatchObject({
      ok: false,
      error: 'save-corrupt',
    });
    expect(migrateSaveText('[]')).toMatchObject({ ok: false, error: 'save-corrupt' });
    expect(migrateSaveText('{"schemaVersion":0}')).toMatchObject({ error: 'save-corrupt' });
  });
  it('pole spoza schematu po migracji nie przechodzi walidacji', () => {
    const g = downgrade(latest(), 2);
    g.world.player.baseStats = [1, 2];
    expect(migrateSaveText(JSON.stringify(g))).toMatchObject({ ok: false, error: 'save-corrupt' });
  });
  it('plik na dysku: zapis wynikowy ma schemaVersion 7', () => {
    const d = mkdtempSync(join(tmpdir(), 'f2sm-'));
    const f = join(d, 'v1.json');
    writeFileSync(f, JSON.stringify(downgrade(latest(), 1)));
    const r = migrateSaveText(readFileSync(f, 'utf8'));
    expect(JSON.parse(r.json!).schemaVersion).toBe(7);
  });
});
