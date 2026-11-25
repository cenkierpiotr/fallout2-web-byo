import { describe, expect, it } from 'vitest';
import { parseRelations } from '@f2/formats';
import { CombatSession } from '../combat';
import {
  planCombatRequest,
  spawnGroup,
  type GroupMember,
  type GroupSpawner,
} from './worldmap-group';

// Przeplyw GameShell po wejsciu w spotkanie (spawnGroup -> planCombatRequest -> CombatSession z requestem),
// bez plikow gry: sprawdza, ze AMBUSH grupa->gracz otwiera walke atakiem na gracza, a FIGHTING z Player nie robi nic.
const PLAYER = 1;
const member = (group: number, hex: number): GroupMember =>
  ({ pid: 0x1000000, hex, group, team: 1, dead: false, items: [] }) as unknown as GroupMember;

const spawner = (): GroupSpawner => {
  let next = 100;
  return {
    createObject: () => next++,
    critterAddTrait: () => undefined,
    addMultObjsToInven: () => undefined,
    wieldObjCritter: () => undefined,
  } as unknown as GroupSpawner;
};

const combatant = (id: number, team: number, hex: number, sequence: number, isPlayer = false) => ({
  id,
  team,
  hp: 10,
  maxAp: 8,
  sequence,
  agility: 5,
  hex,
  isPlayer,
});

const flow = (relationsText: string) => {
  const firstByGroup = new Map<number, number>();
  const ids = spawnGroup(spawner(), [member(0, 20100), member(0, 20101)], 0, {
    player: 20000,
    firstByGroup,
  });
  const req = planCombatRequest(parseRelations(relationsText), firstByGroup, PLAYER);
  const parts = [
    combatant(PLAYER, 0, 20000, 9, true),
    ...ids.map((id, i) => combatant(id, 1, 20100 + i, 1)),
  ];
  const session = new CombatSession(
    parts,
    () => ({ hit: true, damage: 1 }),
    (a, b) => Math.abs(a - b),
    req ? { request: req } : {},
  );
  return { ids, req, session };
};

describe('spotkanie z relacji Enc -> start walki', () => {
  it('AMBUSH grupa->gracz: pierwszy krytter grupy atakuje gracza i otwiera tury', () => {
    const { ids, req, session } = flow('(2-2) R AMBUSH Player');
    expect(req).toEqual({ attacker: ids[0], defender: PLAYER });
    expect(session.current.id).toBe(ids[0]);
    const by = (id: number) => session.all.find((c) => c.id === id)!;
    expect(by(ids[0]!).whoHitMeId).toBe(PLAYER);
    expect(by(PLAYER).whoHitMeId).toBe(ids[0]);
  });
  it('FIGHTING z Player: brak requestu, kolejka wg sequence (gracz pierwszy), bez celow', () => {
    const { req, session } = flow('(2-2) R FIGHTING Player');
    expect(req).toBeUndefined();
    expect(session.current.id).toBe(PLAYER);
    expect(session.current.whoHitMeId).toBeUndefined();
  });
});
