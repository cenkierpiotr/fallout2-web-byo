import {
  canPassDoor,
  isDoorLocked,
  makeDoorPolicy,
  type DoorPolicy,
  type GameObject,
} from '@f2/engine-core';

/**
 * Polityka drzwi ruchu w swiecie gry (D 0x415e24, patrz makeDoorPolicy).
 * Krytery inne niz gracz: dokladnie regula exe (typ ciala 0/2, typ zabicia != 0xf), wiec psy
 * (typ ciala 1) i roboty o typie zabicia 0xf nie otwieraja drzwi ani ich nie planuja.
 *
 * Gracz: exe wymaga bitu 4 w proto drzwi (D, 0x415e24), ale bit jest 0 we wszystkich 98 drzwiach
 * (W), czyli w exe sciezka gracza nigdy nie prowadzi przez drzwi, a gracz otwiera je akcja Uzyj
 * (klik na drzwi). Web odwzorowuje to jako "ruch w zamkniete drzwi = Uzyj": drzwi sa dla gracza
 * przechodnie w planowaniu, a `MovementSystem` przy wejsciu na ich heks wykonuje pelne Uzyj
 * (`defaultUse`: klucze, blokada). Zamkniete na klucz drzwi sa przechodnie tylko gdy gracz ma
 * pasujacy klucz (`hasKey`), inaczej ruch jest blokowany jak w exe (decyzja projektowa, poziom W).
 */
export function makeWorldDoorPolicy(
  isPlayer: (o: GameObject) => boolean,
  hasKey: (player: GameObject, door: GameObject) => boolean = () => false,
): DoorPolicy {
  const npc = makeDoorPolicy((m) => {
    const p = m.proto as { kind?: string; bodyType?: number; killType?: number };
    return {
      bodyType: p.kind === 'critter' ? (p.bodyType ?? 0) : 0,
      killType: p.kind === 'critter' ? (p.killType ?? 0) : 0,
      isPlayer: false,
    };
  });
  const player: DoorPolicy = (mover, blocker) =>
    canPassDoor(mover, blocker) ||
    (mover.type === 1 && isDoorLocked(blocker) && hasKey(mover, blocker));
  return (mover, blocker) => (isPlayer(mover) ? player(mover, blocker) : npc(mover, blocker));
}
