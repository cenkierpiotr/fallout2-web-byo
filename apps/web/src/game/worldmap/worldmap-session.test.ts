import { describe, expect, it } from 'vitest';
import {
  gvarsOf,
  hostFromSession,
  WORLDMAP_KEY,
  createWorldmapForSession,
  saveWorldmap,
  captureWorldmapForSave,
  worldmapWasOpen,
  WORLDMAP_OPEN_KEY,
} from './worldmap-session';
import type { WorldmapController } from './worldmap-controller';
import { defaultSessionState } from '../save-world';
import { Perk, Skill } from '@f2/rules';
import { GameClock } from '@f2/engine-core';
import { readFileSync } from 'node:fs';
import type { GameSession } from '../game-session';

const fakeSession = (): GameSession => {
  const state = defaultSessionState();
  state.sheet.baseStats[6] = 7;
  state.sheet.perks = { [Perk.Pathfinder]: 2 };
  state.sheet.progress.level = 9;
  return { state, world: { clock: new GameClock(), scripts: undefined } } as unknown as GameSession;
};

const dir = process.env['F2_PATCH_DIR'] ?? '';
const pick = (n: string): string => {
  try {
    return readFileSync(`${dir}/DATA/Data/${n}`, 'latin1');
  } catch {
    return '';
  }
};
const WORLDMAP_TXT = pick('WORLDMAP.TXT');
const CITY_TXT = pick('CITY.TXT');

describe('worldmap-session', () => {
  it('host: zegar, statystyki, perki bez wzgledu na wielkosc liter, gvars', () => {
    const s = fakeSession();
    const extras = { gvars: { get: (i: number) => (i === 3 ? 42 : 0) } };
    const h = hostFromSession(s, extras as never);
    expect(h.luck()).toBe(7);
    expect(h.player('Level')).toBe(9);
    expect(h.perk('pathfinder')).toBe(2);
    expect(h.perk('scout')).toBe(0);
    const t = h.ticks();
    h.advance(100);
    expect(h.ticks()).toBe(t + 100);
    expect(gvarsOf(extras as never)[3]).toBe(42);
  });
  it('outdoorsman: poziom z rdzenia (baza + (Endurance+Intelligence)/2 + tag), nie surowa wartosc', () => {
    const s = fakeSession();
    s.state.sheet.skills[Skill.Outdoorsman] = 10;
    const h = hostFromSession(s, undefined);
    const raw = h.outdoorsman();
    expect(raw).toBeGreaterThan(10);
    s.state.sheet.taggedSkills = [Skill.Outdoorsman];
    expect(h.outdoorsman()).toBeGreaterThan(raw);
  });
  it('samochod: host wystawia paliwo, ruch i obszar ze skryptow', () => {
    const s = fakeSession();
    const rt = { carFuel: 500, carMoving: true, carArea: -1, syncClock: () => undefined };
    (s.world as unknown as { scripts: unknown }).scripts = rt;
    const h = hostFromSession(s, undefined);
    expect(h.car?.fuel).toBe(500);
    h.car!.fuel = 0;
    h.car!.moving = false;
    h.car!.area = 3;
    expect(rt).toMatchObject({ carFuel: 0, carMoving: false, carArea: 3 });
  });
  it.skipIf(!WORLDMAP_TXT || !CITY_TXT)(
    'createWorldmapForSession: dane z plikow gry, stan z modData, znane obszary ze skryptow',
    async () => {
      const s = fakeSession();
      const files: Record<string, string> = {
        'data/worldmap.txt': WORLDMAP_TXT,
        'data/city.txt': CITY_TXT,
      };
      const mk = (known: Map<number, number>) =>
        createWorldmapForSession({
          session: s,
          extras: undefined,
          read: async (p) => files[p] ?? '',
          maps: [{ index: 0, name: 'ARMAIN', lookup: 'Arroyo Main' }],
          knownAreas: known,
        });
      const c = await mk(new Map([[1, 1]]));
      expect(c.model.data.areas.length).toBeGreaterThan(1);
      expect(c.model.known.has(1)).toBe(true);
      c.model.x = 123;
      saveWorldmap(s, c);
      expect(s.state.modData[WORLDMAP_KEY]).toBeDefined();
      const d = await mk(new Map());
      expect(d.model.x).toBe(123);
    },
  );
});

describe('stan mapy swiata w zapisie (captureWorldmapForSave)', () => {
  it('otwarta mapa swiata: flaga + snapshot; zamknieta: flaga znika', () => {
    const s = fakeSession();
    const snap = { x: 7 };
    const ctl = { snapshot: () => snap } as unknown as WorldmapController;
    captureWorldmapForSave(s, ctl, true);
    expect(worldmapWasOpen(s)).toBe(true);
    expect(s.state.modData[WORLDMAP_KEY]).toBe(snap);
    captureWorldmapForSave(s, ctl, false);
    expect(worldmapWasOpen(s)).toBe(false);
    expect(WORLDMAP_OPEN_KEY in s.state.modData).toBe(false);
  });
  it('bez kontrolera (mapa swiata nigdy nie otwarta) nie tworzy wpisu worldmap', () => {
    const s = fakeSession();
    captureWorldmapForSave(s, null, false);
    expect(WORLDMAP_KEY in s.state.modData).toBe(false);
    expect(worldmapWasOpen(s)).toBe(false);
  });
});
