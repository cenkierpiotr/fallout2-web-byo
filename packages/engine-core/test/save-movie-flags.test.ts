/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/index.js';
import { deserializeWorld, serializeWorld } from '../src/save/serialize.js';
import { arbitraryWorld } from './save-fixtures.js';

const meta = () => ({
  slot: 'quick',
  name: 'q',
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime: 1,
  thumbnail: null,
  engineVersion: '0',
});
const roundTrip = (w: ReturnType<typeof arbitraryWorld>) =>
  JSON.parse(JSON.stringify(serializeWorld(w, meta())));
const flags = (...on: number[]): number[] => {
  const a = new Array<number>(17).fill(0);
  for (const i of on) a[i] = 1;
  return a;
};

describe('zapis: flagi obejrzanych filmow (slot 21, 17 B)', () => {
  it('round-trip przez JSON, migrate i deserializeWorld', () => {
    const w = arbitraryWorld(3);
    w.movieFlags = flags(0, 5, 16);
    const g = roundTrip(w);
    expect(g.schemaVersion).toBe(7);
    const m = migrate(g) as any;
    expect(m.movieFlags).toEqual(flags(0, 5, 16));
    expect(deserializeWorld(m).movieFlags).toEqual(flags(0, 5, 16));
  });
  it('brak pola w swiecie = 17 zer', () => {
    const w = arbitraryWorld(3);
    delete w.movieFlags;
    expect(roundTrip(w).movieFlags).toEqual(flags());
  });
  it('zapis nie aliasuje zywego stanu', () => {
    const w = arbitraryWorld(3);
    w.movieFlags = flags(1);
    const save = serializeWorld(w, meta());
    w.movieFlags[2] = 1;
    expect(save.movieFlags).toEqual(flags(1));
  });
  it('migracja v4 -> v5 dodaje 17 zer; v1 tez', () => {
    for (const v of [4, 3, 1]) {
      const g = roundTrip(arbitraryWorld(3));
      g.schemaVersion = v;
      delete g.movieFlags;
      if (v < 3) {
        delete g.party;
        delete g.gvars;
      }
      const r = migrate(g) as any;
      expect(r.schemaVersion).toBe(7);
      expect(r.movieFlags).toEqual(flags());
    }
  });
  it('walidacja: zla dlugosc, nie-0/1, brak pola w v5', () => {
    const bad = (mut: (g: any) => void) => {
      const g = roundTrip(arbitraryWorld(3));
      mut(g);
      expect(migrate(g)).toEqual({ error: 'save-corrupt' });
    };
    bad((g) => (g.movieFlags = [1, 0]));
    bad((g) => (g.movieFlags[3] = 2));
    bad((g) => (g.movieFlags[3] = 'x'));
    bad((g) => delete g.movieFlags);
  });
  it('v7 -> save-too-new', () => {
    expect(migrate({ ...roundTrip(arbitraryWorld(3)), schemaVersion: 8 })).toEqual({
      error: 'save-too-new',
    });
  });
});

describe('migrate: patologiczne zagniezdzenie', () => {
  it('zbyt gleboki ekwipunek daje save-corrupt zamiast wyjatku', () => {
    const g = roundTrip(arbitraryWorld(3));
    let deep: any = {
      pid: 1,
      count: 1,
      ammo: null,
      ammoPid: null,
      equippedSlot: null,
      contents: [],
    };
    for (let i = 0; i < 200_000; i++)
      deep = { pid: 1, count: 1, ammo: null, ammoPid: null, equippedSlot: null, contents: [deep] };
    g.world.player.inventory = [deep];
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  });
});

describe('zapis v6: flaga gry zakonczonej', () => {
  it('round-trip true i false przez JSON, migrate i deserializeWorld', () => {
    for (const v of [true, false]) {
      const w = arbitraryWorld(3);
      w.gameEnded = v;
      const g = roundTrip(w);
      expect(g.gameEnded).toBe(v);
      const m = migrate(g) as any;
      expect(deserializeWorld(m).gameEnded ?? false).toBe(v);
    }
  });
  it('migracja z v5 (i v1) daje false', () => {
    for (const v of [5, 1]) {
      const g = roundTrip(arbitraryWorld(3));
      g.schemaVersion = v;
      delete g.gameEnded;
      if (v < 5) delete g.movieFlags;
      if (v < 3) {
        delete g.party;
        delete g.gvars;
      }
      const r = migrate(g) as any;
      expect(r.schemaVersion).toBe(7);
      expect(r.gameEnded).toBe(false);
    }
  });
  it('gameEnded nie-bool w zapisie v6 = save-corrupt', () => {
    const g = roundTrip(arbitraryWorld(3));
    g.gameEnded = 'tak';
    expect((migrate(g) as any).error).toBe('save-corrupt');
  });
});

describe('zapis v7: flaga promieniowania gracza (bit 0x2)', () => {
  it('round-trip true i false przez JSON, migrate i deserializeWorld', () => {
    for (const v of [true, false]) {
      const w = arbitraryWorld(3);
      w.radiationFlag = v;
      const g = roundTrip(w);
      expect(g.schemaVersion).toBe(7);
      expect(g.radiationFlag).toBe(v);
      const m = migrate(g) as any;
      expect(deserializeWorld(m).radiationFlag ?? false).toBe(v);
    }
  });
  it('migracja z v6 (i v5, v1) daje false; stare zapisy ladowane', () => {
    for (const v of [6, 5, 1]) {
      const g = roundTrip(arbitraryWorld(3));
      g.schemaVersion = v;
      delete g.radiationFlag;
      if (v < 6) delete g.gameEnded;
      if (v < 5) delete g.movieFlags;
      if (v < 3) {
        delete g.party;
        delete g.gvars;
      }
      const r = migrate(g) as any;
      expect(r.schemaVersion).toBe(7);
      expect(r.radiationFlag).toBe(false);
      expect(r.gameEnded).toBe(false);
    }
  });
  it('migracja v6 nie nadpisuje istniejacej flagi', () => {
    const g = roundTrip(arbitraryWorld(3));
    g.schemaVersion = 6;
    g.radiationFlag = true;
    expect((migrate(g) as any).radiationFlag).toBe(true);
  });
  it('radiationFlag nie-bool w zapisie v7 = save-corrupt', () => {
    const g = roundTrip(arbitraryWorld(3));
    g.radiationFlag = 1;
    expect((migrate(g) as any).error).toBe('save-corrupt');
  });
});
