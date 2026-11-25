import {
  findPath,
  hexDistance,
  hexNeighbors,
  isHexBlocked,
  moveObject,
  type GameMap,
  type GameObject,
  type World,
} from '@f2/engine-core';

/** Towarzysz zostaje w tej odleglosci (heksy) od gracza bez ruchu; dalej doskakuje. */
export const FOLLOW_DISTANCE = 3;
/** Powyzej tej odleglosci towarzysz biegnie. */
export const FOLLOW_RUN_DISTANCE = 8;
/** Co ile ticks (1/10 s) planowana jest nowa trasa nieruchomego towarzysza. */
export const FOLLOW_REPLAN_TICKS = 10;
const RESULT_DEAD = 0x80;

export interface FollowHost {
  world: Pick<World, 'map' | 'player' | 'movement' | 'scripts'>;
  /** Walka przejmuje ruch towarzyszy (CombatController). */
  enemiesNearby: () => boolean;
}

const alive = (o: GameObject): boolean =>
  !o.hidden && (o.extra.kind !== 'critter' || ((o.extra.raw[3] ?? 0) & RESULT_DEAD) === 0);

/** Wolny heks w pierscieniu 1..3 wokol gracza najblizszy `from`, nie zajety przez `taken`. */
export function followTarget(
  map: GameMap,
  player: GameObject,
  mover: GameObject,
  taken: ReadonlySet<number>,
): number | null {
  const seen = new Set<number>([player.hex]);
  let ring = [player.hex];
  const cands: number[] = [];
  for (let r = 1; r <= FOLLOW_DISTANCE; r++) {
    const next: number[] = [];
    for (const h of ring)
      for (const n of hexNeighbors(h)) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
        if (!taken.has(n) && !isHexBlocked(map, player.elevation, n, mover)) cands.push(n);
      }
    ring = next;
  }
  cands.sort((a, b) => hexDistance(a, mover.hex) - hexDistance(b, mover.hex));
  return cands[0] ?? null;
}

/**
 * Towarzysze (`scripts.inventory.partyObjects()`) podazaja za graczem poza walka: nieruchomy
 * towarzysz dalej niz FOLLOW_DISTANCE dostaje trase do wolnego heksa przy graczu (A*), na innym
 * poziomie mapy jest przenoszony. Podczas walki ruchem steruje CombatController.
 */
export class PartyFollower {
  private acc = FOLLOW_REPLAN_TICKS;

  constructor(
    private readonly host: FollowHost,
    private readonly path: typeof findPath = findPath,
  ) {}

  update(dtTicks: number): void {
    const { world } = this.host;
    const members = world.scripts?.inventory.partyObjects() ?? [];
    if (members.length === 0 || this.host.enemiesNearby()) return;
    const { map, player, movement } = world;
    for (const c of members) if (alive(c) && movement.stateOf(c)) movement.tick(c, dtTicks);
    this.acc += dtTicks;
    if (this.acc < FOLLOW_REPLAN_TICKS) return;
    this.acc = 0;
    const taken = new Set<number>(members.map((m) => m.hex));
    for (const c of members) {
      if (!alive(c) || movement.stateOf(c)) continue;
      if (c.elevation !== player.elevation) {
        const t = followTarget(map, player, c, taken);
        if (t !== null) {
          moveObject(map, c, t, player.elevation);
          taken.add(t);
        }
        continue;
      }
      const d = hexDistance(c.hex, player.hex);
      if (d <= FOLLOW_DISTANCE) continue;
      const t = followTarget(map, player, c, taken);
      if (t === null) continue;
      const p = this.path(map, c.elevation, c.hex, t, c, { doorPolicy: movement.doorPolicy });
      if (!p || p.length === 0) continue;
      taken.add(t);
      movement.start(c, [...p], d > FOLLOW_RUN_DISTANCE);
    }
  }
}
