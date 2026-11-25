import { describe, expect, it } from 'vitest';
import {
  AiPacketTable,
  acceptableToHit,
  chemHealPercent,
  chemRandomChance,
  chemShouldHeal,
  chooseTarget,
  CHEM_USE_NAMES,
  fleeThreshold,
  mayApproach,
  mayUseAreaWeapon,
  normalizeAiPacket,
  shouldFlee,
  tauntMsgId,
  type AiMsgKind,
  type AiPacketSource,
} from '../src/index.js';

const KINDS: AiMsgKind[] = [
  'attack',
  'move',
  'run',
  'miss',
  'hitEyes',
  'hitGroin',
  'hitHead',
  'hitLeftArm',
  'hitLeftLeg',
  'hitRightArm',
  'hitRightLeg',
  'hitTorso',
];
function src(over: Partial<AiPacketSource> = {}): AiPacketSource {
  const msgRanges = Object.fromEntries(
    KINDS.map((k) => [k, [0, 0] as const]),
  ) as AiPacketSource['msgRanges'];
  return {
    name: 'T',
    packetNum: 1,
    aggression: 50,
    maxDist: 10,
    minToHit: 20,
    minHp: 7,
    chance: 50,
    hurtTooMuch: new Set<string>(),
    msgRanges,
    ...over,
  };
}

describe('AiPacketTable', () => {
  it('brak pakietu = "Missing AI Packet", find = null', () => {
    const t = new AiPacketTable([src({ packetNum: 3 })]);
    expect(t.get(3).packetNum).toBe(3);
    expect(() => t.get(9)).toThrow(/Missing AI Packet/);
    expect(t.find(9)).toBeNull();
  });
});

describe('ucieczka', () => {
  it('tryb -1 (brak) -> prog = min_hp z pakietu', () => {
    const p = normalizeAiPacket(src());
    expect(p.runAwayIndex).toBe(-1);
    expect(fleeThreshold(p, 100)).toBe(7);
  });
  it('bleeding (2) -> prog 60 z 100 HP (traci max 40%)', () => {
    const p = normalizeAiPacket(src({ runAwayMode: 'bleeding' }));
    expect(p.runAwayIndex).toBe(2);
    expect(fleeThreshold(p, 100)).toBe(60);
    expect(shouldFlee(p, { hp: 59, maxHp: 100 })).toBe(true);
    expect(shouldFlee(p, { hp: 60, maxHp: 100 })).toBe(false);
  });
  it('coward: ucieka po pierwszym zadrapaniu, never: nigdy', () => {
    expect(
      shouldFlee(normalizeAiPacket(src({ runAwayMode: 'coward' })), { hp: 99, maxHp: 100 }),
    ).toBe(true);
    expect(
      shouldFlee(normalizeAiPacket(src({ runAwayMode: 'never' })), { hp: 1, maxHp: 100 }),
    ).toBe(false);
  });
  it('hurt_too_much: okaleczone nogi wymuszaja ucieczke', () => {
    const p = normalizeAiPacket(
      src({ runAwayMode: 'never', hurtTooMuch: new Set(['crippled_legs']) }),
    );
    expect(shouldFlee(p, { hp: 100, maxHp: 100, crippledLegs: true })).toBe(true);
    expect(shouldFlee(p, { hp: 100, maxHp: 100, crippledArms: true })).toBe(false);
  });
});

describe('wybor celu', () => {
  const foes = [
    { id: 1, hp: 30, distance: 8 },
    { id: 2, hp: 10, distance: 3 },
    { id: 3, hp: 50, distance: 5 },
    { id: 4, hp: 99, distance: 40 },
  ];
  const pick = (who: string, hit?: number): number | undefined =>
    chooseTarget(normalizeAiPacket(src({ attackWho: who })), foes, hit, () => 0)?.id;
  it('closest / weakest / strongest', () => {
    expect(pick('closest')).toBe(2);
    expect(pick('weakest')).toBe(2);
    expect(pick('strongest')).toBe(3);
  });
  it('max_dist odfiltrowuje dalekie cele, chyba ze cel nas trafil', () => {
    expect(pick('strongest')).toBe(3);
    expect(pick('strongest', 4)).toBe(4);
  });
  it('whomever_attacking_me: ten co trafil, inaczej najblizszy', () => {
    expect(pick('whomever_attacking_me', 1)).toBe(1);
    expect(pick('whomever_attacking_me')).toBe(2);
  });
  it('brak celu w zasiegu -> null; charge ignoruje max_dist', () => {
    const far = [{ id: 9, hp: 1, distance: 50 }];
    expect(chooseTarget(normalizeAiPacket(src()), far, undefined, () => 0)).toBeNull();
    expect(
      chooseTarget(normalizeAiPacket(src({ distance: 'charge' })), far, undefined, () => 0)?.id,
    ).toBe(9);
  });
});

describe('dystans, obszar, szansa, taunt', () => {
  it('stay nigdy nie rusza, stay_close tylko w poblizu gracza (<=5), charge zawsze', () => {
    const stay = normalizeAiPacket(src({ distance: 'stay' }));
    expect(mayApproach(stay, false, 5, 1)).toBe(false);
    expect(mayApproach(stay, true, 5, 1)).toBe(false);
    const close = normalizeAiPacket(src({ distance: 'stay_close' }));
    expect(mayApproach(close, false, 5, 1, 5)).toBe(true);
    expect(mayApproach(close, false, 5, 1, 6)).toBe(false);
    expect(mayApproach(normalizeAiPacket(src({ distance: 'charge' })), false, 99, 1, 99)).toBe(
      true,
    );
  });
  it('enumy wg tablic exe: distance, area, chem_use', () => {
    expect(normalizeAiPacket(src({ distance: 'stay_close' })).distance).toBe('stay_close');
    expect(normalizeAiPacket(src({ areaAttackMode: 'no_pref' })).areaMode).toBe('unset');
    expect(normalizeAiPacket(src({ areaAttackMode: 'be_careful' })).areaMode).toBe('be_careful');
    expect(CHEM_USE_NAMES.indexOf('stims_when_hurt_little')).toBe(1);
    expect(normalizeAiPacket(src({ chemUse: 'sometimes' })).chemUse).toBe(3);
    expect(normalizeAiPacket(src({ chemUse: 'always' })).chemUse).toBe(5);
  });
  it('area: always, sometimes (rand(1,freq)==1), progi be_* 85/50/95 + brak sojusznikow', () => {
    const area = (mode: string, ctx: Parameters<typeof mayUseAreaWeapon>[1], roll = 1) =>
      mayUseAreaWeapon(
        normalizeAiPacket(src({ areaAttackMode: mode, secondaryFreq: 4 })),
        ctx,
        () => roll,
      );
    expect(area('always', { friendsInBlast: 5 })).toBe(true);
    expect(area('sometimes', { friendsInBlast: 0 }, 1)).toBe(true);
    expect(area('sometimes', { friendsInBlast: 0 }, 2)).toBe(false);
    expect(area('be_careful', { friendsInBlast: 0, toHit: 50 })).toBe(true);
    expect(area('be_careful', { friendsInBlast: 0, toHit: 49 })).toBe(false);
    expect(area('be_careful', { friendsInBlast: 1, toHit: 99 })).toBe(false);
    expect(area('be_sure', { friendsInBlast: 0, toHit: 84 })).toBe(false);
    expect(area('be_sure', { friendsInBlast: 0, toHit: 85 })).toBe(true);
    expect(area('be_absolutely_sure', { friendsInBlast: 0, toHit: 94 })).toBe(false);
    expect(area('be_absolutely_sure', { friendsInBlast: 0, toHit: 95 })).toBe(true);
  });
  it('area unset: IN>=6 i dystans>=10 -> nie; inaczej losowanie', () => {
    const p = normalizeAiPacket(src({ secondaryFreq: 2 }));
    expect(
      mayUseAreaWeapon(p, { friendsInBlast: 0, intelligence: 6, targetDistance: 10 }, () => 1),
    ).toBe(false);
    expect(
      mayUseAreaWeapon(p, { friendsInBlast: 0, intelligence: 5, targetDistance: 10 }, () => 1),
    ).toBe(true);
    expect(
      mayUseAreaWeapon(p, { friendsInBlast: 0, intelligence: 6, targetDistance: 9 }, () => 2),
    ).toBe(false);
  });
  it('chem: progi HP 60/30/50 i AP>=2', () => {
    expect([0, 1, 2, 3, 4, 5].map(chemHealPercent)).toEqual([0, 60, 30, 50, 50, 50]);
    expect(chemShouldHeal(1, 59, 100, 2)).toBe(true);
    expect(chemShouldHeal(1, 60, 100, 2)).toBe(false);
    expect(chemShouldHeal(2, 29, 100, 5)).toBe(true);
    expect(chemShouldHeal(2, 30, 100, 5)).toBe(false);
    expect(chemShouldHeal(1, 1, 100, 1)).toBe(false);
    expect(chemShouldHeal(0, 1, 100, 9)).toBe(false);
  });
  it('chem: szansa losowa 25/75 co 3. licznik, 100 zawsze', () => {
    expect(chemRandomChance(3, 3)).toBe(25);
    expect(chemRandomChance(3, 4)).toBe(0);
    expect(chemRandomChance(4, 6)).toBe(75);
    expect(chemRandomChance(4, 7)).toBe(0);
    expect(chemRandomChance(5, 7)).toBe(100);
    expect(chemRandomChance(1, 3)).toBe(0);
  });
  it('flaga ucieczki (bit 4) wymusza ucieczke, hp == min_hp nie', () => {
    const p = normalizeAiPacket(src());
    expect(shouldFlee(p, { hp: 100, maxHp: 100, fleeFlag: true })).toBe(true);
    expect(shouldFlee(p, { hp: 7, maxHp: 100 })).toBe(false);
    expect(shouldFlee(p, { hp: 6, maxHp: 100 })).toBe(true);
  });
  it('attack_who z miara power: strongest rosnaco, weakest malejaco (kolejnosc binarki)', () => {
    const f = [
      { id: 1, hp: 5, distance: 9, power: 30 },
      { id: 2, hp: 5, distance: 3, power: 10 },
      { id: 3, hp: 5, distance: 6, power: 50 },
    ];
    expect(
      chooseTarget(normalizeAiPacket(src({ attackWho: 'strongest' })), f, undefined, () => 0)?.id,
    ).toBe(2);
    expect(
      chooseTarget(normalizeAiPacket(src({ attackWho: 'weakest' })), f, undefined, () => 0)?.id,
    ).toBe(3);
  });
  it('min_to_hit', () => {
    const p = normalizeAiPacket(src({ minToHit: 40 }));
    expect(acceptableToHit(p, 39)).toBe(false);
    expect(acceptableToHit(p, 40)).toBe(true);
  });
  it('taunt: chance 0 nigdy, 100 zawsze, wiersz z zakresu', () => {
    const ranges = { ...src().msgRanges, attack: [2040, 2059] as const };
    const never = normalizeAiPacket(src({ chance: 0, msgRanges: ranges }));
    const always = normalizeAiPacket(src({ chance: 100, msgRanges: ranges }));
    for (let r = 1; r <= 100; r++)
      expect(
        tauntMsgId(
          never,
          'attack',
          () => r,
          (lo) => lo,
        ),
      ).toBeNull();
    for (let r = 1; r <= 100; r++)
      expect(
        tauntMsgId(
          always,
          'attack',
          () => r,
          (lo, hi) => hi,
        ),
      ).toBe(2059);
    expect(
      tauntMsgId(
        always,
        'move',
        () => 1,
        (lo) => lo,
      ),
    ).toBeNull();
  });
});
