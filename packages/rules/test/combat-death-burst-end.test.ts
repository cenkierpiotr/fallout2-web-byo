import { describe, expect, it } from 'vitest';
import {
  selectDeathAnim,
  DEATH_ANIM_NORMAL,
  DEATH_ANIM_BRUTAL,
  resolveBurst,
  isExplosionVictimEligible,
  addExplosionExtra,
  EXPLOSION_MAX_EXTRAS,
  combatShouldEnd,
  COMBAT_PENDING_Z,
  type DeathAnimInput,
} from '../src/index.js';

const base = (o: Partial<DeathAnimInput> = {}): DeathAnimInput => ({
  attackerIsPlayer: false,
  bloodyMess: false,
  pyromaniac: false,
  victimSkipsDeathAnim: false,
  weaponPid: 0,
  weaponKind43: false,
  damageType: 0,
  violence: 3,
  attackAnim: 0x30,
  damage: 20,
  fallingBack: true,
  probeAnim: (a) => a,
  ...o,
});

describe('tabele animacji smierci (0x5106e0 / 0x5106fc, D)', () => {
  it('normalna', () =>
    expect(DEATH_ANIM_NORMAL).toEqual([0x1a, 0x1c, 0x18, 0x18, 0x1b, 0x14, 0x17]));
  it('brutalna', () =>
    expect(DEATH_ANIM_BRUTAL).toEqual([0x19, 0x1c, 0x21, 0x20, 0x1e, 0x14, 0x1f]));
});

describe('selectDeathAnim (0x41060c, D)', () => {
  it('flaga proto ofiary 0x1000: animacja 0x1f, tryb 2, bez dalszych regul', () => {
    expect(selectDeathAnim(base({ victimSkipsDeathAnim: true }))).toEqual({ anim: 0x1f, mode: 2 });
  });
  it('male obrazenia (< prog 15): upadek 0x14, a bez cofania sie 0x15', () => {
    expect(selectDeathAnim(base({ damage: 10 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ damage: 10, fallingBack: false })).anim).toBe(0x15);
  });
  it('srednie obrazenia (15..44), violence 3: tabela normalna wg typu', () => {
    expect(selectDeathAnim(base({ damage: 30, damageType: 2 }))).toEqual({ anim: 0x18, mode: 0 });
    expect(selectDeathAnim(base({ damage: 30, damageType: 4 })).anim).toBe(0x1b);
  });
  it('duze obrazenia (>= 45), violence 3: brutalna gdy dostepna', () => {
    expect(selectDeathAnim(base({ damage: 50, damageType: 2 })).anim).toBe(0x21);
  });
  it('duze obrazenia: brak brutalnej animacji w sprite -> normalna', () => {
    const probeAnim = (a: number) => (a === 0x21 ? 0x14 : a);
    expect(selectDeathAnim(base({ damage: 50, damageType: 2, probeAnim })).anim).toBe(0x18);
  });
  it('violence <= 1: zawsze 0x14; violence 2: tabela normalna mimo duzych obrazen', () => {
    expect(selectDeathAnim(base({ damage: 99, violence: 1 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ damage: 99, violence: 2, damageType: 2 })).anim).toBe(0x18);
  });
  it('Bloody Mess (gracz): pomija progi, malych obrazen tez dotyczy brutalna', () => {
    expect(selectDeathAnim(base({ damage: 1, bloodyMess: true, damageType: 2 })).anim).toBe(0x21);
  });
  it('Bloody Mess nie omija violence <= 1', () => {
    expect(selectDeathAnim(base({ damage: 1, bloodyMess: true, violence: 1 })).anim).toBe(0x14);
  });
  it('seria/dystans (anim 0x11, 0x29, 0x2a): 0x17 tylko z Bloody Mess i violence 3', () => {
    expect(selectDeathAnim(base({ attackAnim: 0x11, bloodyMess: true })).anim).toBe(0x17);
    expect(selectDeathAnim(base({ attackAnim: 0x11 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ attackAnim: 0x29, bloodyMess: true, violence: 2 })).anim).toBe(
      0x14,
    );
  });
  it('anim 0x10 tylko dla typu 0; 0x12 dla typu != 6', () => {
    expect(selectDeathAnim(base({ attackAnim: 0x10, bloodyMess: true, damageType: 0 })).anim).toBe(
      0x17,
    );
    expect(
      selectDeathAnim(base({ attackAnim: 0x12, bloodyMess: true, damageType: 6, damage: 1 })).anim,
    ).toBe(0x1f);
    expect(selectDeathAnim(base({ attackAnim: 0x12, bloodyMess: true, damageType: 2 })).anim).toBe(
      0x17,
    );
  });
  it('anim 0x2d + typ 0: 0x17 od progu 45 lub Bloody Mess', () => {
    expect(selectDeathAnim(base({ attackAnim: 0x2d, damage: 44 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ attackAnim: 0x2d, damage: 45 })).anim).toBe(0x17);
    expect(selectDeathAnim(base({ attackAnim: 0x2d, damage: 1, bloodyMess: true })).anim).toBe(
      0x17,
    );
    expect(selectDeathAnim(base({ attackAnim: 0x2d, damage: 99, violence: 2 })).anim).toBe(0x14);
  });
  it('bron pid 0x9f: ogien, progi 5/15, anim 0x2d (nie zmienia typu argumentu wejsciowego)', () => {
    // ogien, anim wymuszone 0x2d ale typ != 0 => sciezka ogolna z progami 5 i 15
    expect(selectDeathAnim(base({ weaponPid: 0x9f, damageType: 0, damage: 4 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ weaponPid: 0x9f, damageType: 0, damage: 10 })).anim).toBe(0x18);
    expect(selectDeathAnim(base({ weaponPid: 0x9f, damageType: 0, damage: 15 })).anim).toBe(0x21);
  });
  it('Pyromaniac (gracz, ogien): progi 1/1', () => {
    expect(
      selectDeathAnim(base({ pyromaniac: true, attackerIsPlayer: true, damageType: 2, damage: 1 }))
        .anim,
    ).toBe(0x21);
    expect(
      selectDeathAnim(
        base({ pyromaniac: true, attackerIsPlayer: false, damageType: 2, damage: 10 }),
      ).anim,
    ).toBe(0x14);
  });
  it('bron rodzaju 0x43: progi dzielone przez 3 (5 i 15)', () => {
    expect(selectDeathAnim(base({ weaponKind43: true, damage: 4 })).anim).toBe(0x14);
    expect(selectDeathAnim(base({ weaponKind43: true, damage: 10, damageType: 2 })).anim).toBe(
      0x18,
    );
    expect(selectDeathAnim(base({ weaponKind43: true, damage: 15, damageType: 2 })).anim).toBe(
      0x21,
    );
  });
});

function seqRng(values: number[]) {
  let i = 0;
  return {
    int: () => values[i++] ?? 100,
    used: () => i,
  };
}

describe('seria resolveBurst (0x423284, D poza geometria linii)', () => {
  const t = (id: number, toHit: number, isMain = false) => ({ id, toHit, isMain });
  it('trafienia liczone do pierwszej porazki, kazda runda zuzywa rzut', () => {
    const rng = seqRng([10, 10, 90]);
    const r = resolveBurst({ rounds: 5, mode: 'burst', targets: [t(1, 50, true)] }, rng);
    expect(r.mainHits).toBe(2);
    expect(r.extras).toEqual([]);
  });
  it('po wyczerpaniu rund zuzywany jest jeszcze jeden rzut (kolejnosc ewaluacji)', () => {
    const rng = seqRng([1, 1, 1]);
    const r = resolveBurst({ rounds: 2, mode: 'burst', targets: [t(1, 50, true)] }, rng);
    expect(r.mainHits).toBe(2);
    expect(rng.used()).toBe(3);
  });
  it('rundy nie trafione ida dalej: kolejny kryter na linii (extra)', () => {
    const rng = seqRng([90, 10, 90]);
    const r = resolveBurst({ rounds: 3, mode: 'burst', targets: [t(1, 50, true), t(2, 50)] }, rng);
    expect(r.mainHits).toBe(0);
    expect(r.extras).toEqual([{ id: 2, hits: 1 }]);
  });
  it('koniec gdy rundy 0 (tryb burst)', () => {
    const rng = seqRng([1, 1, 90, 1]);
    const r = resolveBurst({ rounds: 2, mode: 'burst', targets: [t(1, 50, true), t(2, 50)] }, rng);
    expect(r.mainHits).toBe(2);
    expect(r.extras).toEqual([]);
  });
  it('limit 6 extras', () => {
    const rng = seqRng(Array(40).fill([1, 100]).flat());
    const targets = [t(1, 50, true), ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => t(i, 50))];
    const r = resolveBurst({ rounds: 99, mode: 'burst', targets }, rng);
    expect(r.extras.length).toBe(6);
  });
  it('tryb plomien (0x2f): 1 szansa na kryter, wynik glowny 0', () => {
    const rng = seqRng([1, 1, 1, 1]);
    const r = resolveBurst({ rounds: 0, mode: 'flame', targets: [t(1, 50, true), t(2, 50)] }, rng);
    expect(r.mainHits).toBe(0);
    expect(r.extras).toEqual([{ id: 2, hits: 1 }]);
  });
});

describe('eksplozja: dodatkowe cele (0x423c10, czesciowo D)', () => {
  it('kwalifikacja: zywy kryter, nie ukryty, nie zablokowany', () => {
    const ok = { isCritter: true, dead: false, hidden: false, blocked: false };
    expect(isExplosionVictimEligible(ok)).toBe(true);
    expect(isExplosionVictimEligible({ ...ok, isCritter: false })).toBe(false);
    expect(isExplosionVictimEligible({ ...ok, dead: true })).toBe(false);
    expect(isExplosionVictimEligible({ ...ok, hidden: true })).toBe(false);
    expect(isExplosionVictimEligible({ ...ok, blocked: true })).toBe(false);
  });
  it('dodaje bez duplikatow, max 6', () => {
    let list: number[] = [];
    for (const id of [1, 1, 2, 3, 4, 5, 6, 7, 8]) list = addExplosionExtra(list, id);
    expect(list).toEqual([1, 2, 3, 4, 5, 6]);
    expect(EXPLOSION_MAX_EXTRAS).toBe(6);
  });
});

describe('koniec walki (0x422c60, D)', () => {
  const p = (team: number, whoHit?: number) => ({ team, whoHitMeTeam: whoHit });
  it('< 2 uczestnikow: koniec', () => {
    expect(combatShouldEnd({ playerPresent: true, playerTeam: 0, participants: [p(0)] })).toBe(
      true,
    );
  });
  it('gracza nie ma na liscie: koniec', () => {
    expect(
      combatShouldEnd({ playerPresent: false, playerTeam: 0, participants: [p(1), p(2)] }),
    ).toBe(true);
  });
  it('wszyscy druzyna gracza: koniec', () => {
    expect(
      combatShouldEnd({ playerPresent: true, playerTeam: 0, participants: [p(0), p(0)] }),
    ).toBe(true);
  });
  it('jest wrog: dalej', () => {
    expect(
      combatShouldEnd({ playerPresent: true, playerTeam: 0, participants: [p(0), p(1)] }),
    ).toBe(false);
  });
  it('sojusznik trafiony przez druzyne gracza (+0x54) blokuje koniec', () => {
    expect(
      combatShouldEnd({ playerPresent: true, playerTeam: 0, participants: [p(0), p(0, 0)] }),
    ).toBe(false);
    expect(
      combatShouldEnd({ playerPresent: true, playerTeam: 0, participants: [p(0), p(0, 1)] }),
    ).toBe(true);
  });
});

describe('COMBAT_PENDING_Z po R13e', () => {
  it('nie zawiera juz serii, eksplozji, animacji smierci ani konca walki', () => {
    const k = Object.keys(COMBAT_PENDING_Z);
    for (const gone of ['burst', 'explosion', 'deathAnimation', 'combatEnd']) {
      expect(k).not.toContain(gone);
    }
  });
});
