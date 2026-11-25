import { describe, expect, it } from 'vitest';
import { BodyPart, DamageType, createRng, normalizeAiPacket, CHEM_USE_NAMES } from '@f2/rules';
import { CombatSession, FISTS, type Combatant, type WeaponSpec } from './combat';
import { createRulesResolver } from './combat-rules';

const mk = (id: number, team: number, hex: number, seq: number, isPlayer = false) => ({
  id,
  team,
  hp: 10,
  maxAp: 8,
  sequence: seq,
  agility: 5,
  hex,
  isPlayer,
});
const hit = (damage: number) => () => ({ hit: true, damage });

const RIFLE: WeaponSpec = {
  name: 'rifle',
  pid: 8,
  minDmg: 5,
  maxDmg: 5,
  apCost: 5,
  range: 10,
  skill: 90,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
};

describe('zadanie walki (exe 0x4a45d4)', () => {
  it('atakujacy otwiera tury mimo nizszego sequence, cele whoHitMe wskazuja siebie', () => {
    const c = new CombatSession(
      [mk(1, 0, 0, 9, true), mk(2, 1, 5, 1), mk(3, 2, 20, 4)],
      hit(1),
      undefined,
      {
        request: { attacker: 2, defender: 1 },
      },
    );
    expect(c.current.id).toBe(2);
    const by = (id: number) => c.all.find((x) => x.id === id)!;
    expect(by(2).whoHitMeId).toBe(1);
    expect(by(1).whoHitMeId).toBe(2);
    expect(by(3).whoHitMeId).toBe(2);
  });
  it('bez zadania kolejka wg sequence', () => {
    const c = new CombatSession([mk(1, 0, 0, 9, true), mk(2, 1, 5, 1)], hit(1));
    expect(c.current.id).toBe(1);
    expect(c.current.whoHitMeId).toBeUndefined();
  });
});

describe('CombatSession', () => {
  it('kolejnosc tur wg sequence, AP na starcie tury', () => {
    const c = new CombatSession([mk(1, 0, 0, 5, true), mk(2, 1, 5, 9)], hit(5));
    expect(c.current.id).toBe(2);
    expect(c.current.ap).toBe(8);
  });
  it('atak odejmuje AP, zabicie wroga konczy walke i daje zdarzenie smierci z animacja', () => {
    const c = new CombatSession([mk(1, 0, 0, 9, true), mk(2, 1, 1, 5)], hit(10));
    expect(c.attack(1, 2)).toMatchObject({ hit: true, damage: 10 });
    expect(c.ended).toBe(true);
    expect(c.playerAlive).toBe(true);
    const d = c.events.find((e) => e.kind === 'death');
    expect(d).toMatchObject({ kind: 'death', id: 2 });
    expect((d as { anim: number }).anim).toBeGreaterThan(0);
  });
  it('odmawia ataku bez AP, poza zasiegiem broni i ruchu ponad AP', () => {
    const c = new CombatSession([mk(1, 0, 0, 9, true), mk(2, 1, 1, 5)], () => ({
      hit: false,
      damage: 0,
    }));
    expect(c.attack(1, 2)).not.toBeNull(); // piesc: 3 AP
    expect(c.attack(1, 2)).not.toBeNull();
    expect(c.attack(1, 2)).toBeNull(); // 2 AP < 3
    const far = new CombatSession([mk(1, 0, 0, 9, true), mk(2, 1, 20, 5)], hit(1));
    expect(far.attack(1, 2)).toBeNull();
    expect(far.move(1, 20)).toBe(false);
  });
  it('celowanie kosztuje +1 AP i przekazuje czesc ciala resolverowi', () => {
    let seen: BodyPart | undefined;
    const c = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), weapons: [RIFLE] }, mk(2, 1, 4, 5)],
      (_a, _t, ctx) => {
        seen = ctx.part;
        return { hit: false, damage: 0 };
      },
    );
    c.attack(1, 2, { part: BodyPart.Head });
    expect(seen).toBe(BodyPart.Head);
    expect(c.current.ap).toBe(8 - 6);
  });
  it('ruch po sciezce z env.path kosztuje 1 AP na heks i wola onMove', () => {
    const moved: number[] = [];
    const c = new CombatSession(
      [mk(1, 0, 0, 9, true), mk(2, 1, 50, 5)],
      hit(1),
      (a, b) => Math.abs(a - b),
      {
        path: (u, to) => [u.hex + 10, u.hex + 20, to].filter((h) => h <= to),
        onMove: (_u, p) => moved.push(...p),
      },
    );
    expect(c.move(1, 30)).toBe(true);
    expect(c.current.ap).toBe(8 - 3);
    expect(moved).toEqual([10, 20, 30]);
  });
  it('AI podchodzi na zasieg broni dystansowej i strzela', () => {
    const c = new CombatSession(
      [mk(1, 0, 0, 5, true), { ...mk(2, 1, 12, 9), weapons: [RIFLE] }],
      hit(99),
    );
    c.autoTurn();
    expect(c.ended).toBe(true);
    expect(c.playerAlive).toBe(false);
    const atk = c.events.find((e) => e.kind === 'attack');
    expect(atk).toBeDefined();
    // strzelil z zasiegu 10, nie wchodzac w zwarcie
    const me = c.all.find((x) => x.id === 2);
    expect(me?.hex).toBe(10);
  });
  it('AI wrecz podchodzi do sasiedniego heksa', () => {
    const c = new CombatSession([mk(1, 0, 0, 5, true), mk(2, 1, 3, 9)], hit(99));
    c.autoTurn();
    expect(c.ended).toBe(true);
    expect(c.playerAlive).toBe(false);
  });
  it('AI z dwiema broniami wybiera wg best_weapon (dystans ponad wrecz)', () => {
    const melee: WeaponSpec = { ...RIFLE, name: 'knife', range: 1, cls: 2, pid: 3, apCost: 3 };
    const seenWeapons: string[] = [];
    const c = new CombatSession(
      [mk(1, 0, 0, 5, true), { ...mk(2, 1, 5, 9), weapons: [melee, RIFLE], aiBestWeapon: 4 }],
      (_a, _t, ctx) => {
        seenWeapons.push(ctx.weapon.name);
        return { hit: false, damage: 0 };
      },
    );
    c.autoTurn();
    expect(seenWeapons[0]).toBe('rifle');
  });
  it('eksplozja rani sasiadow celu (kazdy sprawdzany raz) i zabija bez dublowania', () => {
    const bomb: WeaponSpec = {
      ...RIFLE,
      name: 'grenade',
      explosive: true,
      damageType: DamageType.Explosion,
    };
    const log: string[] = [];
    const c = new CombatSession(
      [
        { ...mk(1, 0, 0, 9, true), weapons: [bomb] },
        { ...mk(2, 1, 5, 5), hp: 30 },
        { ...mk(3, 1, 6, 4), hp: 3 },
        { ...mk(4, 1, 9, 3), hp: 3 },
      ],
      (_a, t, ctx) => {
        log.push(`${t.id}:${ctx.splash ? 's' : 'm'}`);
        return { hit: true, damage: 5 };
      },
    );
    c.attack(1, 2);
    expect(log).toEqual(['2:m', '3:s']);
    expect(c.all.find((x) => x.id === 3)?.hp).toBe(0);
    expect(c.all.find((x) => x.id === 4)?.hp).toBe(3);
    expect(c.events.filter((e) => e.kind === 'death')).toHaveLength(1);
  });
  it('AI zabija gracza: walka konczy sie smiercia gracza', () => {
    const c = new CombatSession([mk(1, 0, 0, 5, true), mk(2, 1, 3, 9)], hit(99));
    c.autoTurn();
    expect(c.playerAlive).toBe(false);
  });
});

describe('CombatSession z prawdziwym resolverem (rules)', () => {
  it('walka konczy sie i jest deterministyczna dla tego samego ziarna', () => {
    const run = (seed: number): string => {
      const rng = createRng(seed);
      const c = new CombatSession(
        [
          { ...mk(1, 0, 0, 9, true), hp: 40, weapons: [RIFLE], ac: 5 },
          { ...mk(2, 1, 4, 5), hp: 15 },
        ],
        createRulesResolver({ rng }),
        (a, b) => Math.abs(a - b),
        { rng },
      );
      for (let i = 0; i < 60 && !c.ended; i++) {
        if (c.current.isPlayer) {
          if (!c.attack(1, 2)) c.endTurn();
        } else c.autoTurn();
      }
      return JSON.stringify(c.events);
    };
    expect(run(7)).toBe(run(7));
    const ended = JSON.parse(run(7)) as { kind: string }[];
    expect(ended.some((e) => e.kind === 'end')).toBe(true);
  });
  it('koszt AP z @f2/rules: piesc 3 (+1 celowanie), bron wg proto, ruch 1 AP/heks bez flag nog', () => {
    const c = new CombatSession([mk(1, 0, 0, 9, true), mk(2, 1, 1, 5)], hit(0));
    expect(c.attackCost(FISTS, BodyPart.Uncalled)).toBe(3);
    expect(c.attackCost(FISTS, BodyPart.Head)).toBe(4);
    expect(c.attackCost(RIFLE, BodyPart.Uncalled)).toBe(5);
    expect(c.attackCost(RIFLE, BodyPart.Torso)).toBe(6);
  });
  it('Fast Shot gracza: -1 AP broni dystansowej (zasieg > 2), nie dotyczy piesci, NPC ani bez cechy', () => {
    const base = mk(1, 0, 0, 9, true);
    const fast = new CombatSession([{ ...base, traits: [7, -1] }, mk(2, 1, 1, 5)], hit(0));
    const player = fast.all[0] as Combatant;
    expect(fast.attackCost(RIFLE, BodyPart.Uncalled, player)).toBe(4);
    expect(fast.attackCost(RIFLE, BodyPart.Torso, player)).toBe(5);
    expect(fast.attackCost(FISTS, BodyPart.Uncalled, player)).toBe(3);
    const npc = { ...mk(3, 1, 2, 5), ap: 5, traits: [7, -1] };
    expect(fast.attackCost(RIFLE, BodyPart.Uncalled, npc)).toBe(5);
    const plain = new CombatSession([base, mk(2, 1, 1, 5)], hit(0));
    expect(plain.attackCost(RIFLE, BodyPart.Uncalled, plain.all[0] as Combatant)).toBe(5);
  });
  it('Fast Shot: brak celowanych strzalow bronia dystansowa (czesc ciala zdegradowana do Uncalled, bez +1 AP), piesci i inni celuja', () => {
    const seen: BodyPart[] = [];
    const resolver = (_a: Combatant, _t: Combatant, ctx: { part: BodyPart }) => {
      seen.push(ctx.part);
      return { hit: false, damage: 0 };
    };
    const fast = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), weapons: [RIFLE], traits: [7, -1] }, mk(2, 1, 4, 5)],
      resolver,
    );
    const p = fast.all[0] as Combatant;
    expect(fast.canAim(p, RIFLE)).toBe(false);
    expect(fast.canAim(p, FISTS)).toBe(true);
    fast.attack(1, 2, { part: BodyPart.Head });
    expect(seen).toEqual([BodyPart.Uncalled]);
    expect(fast.current.ap).toBe(8 - 4);
    const plain = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), weapons: [RIFLE] }, mk(2, 1, 4, 5)],
      resolver,
    );
    expect(plain.canAim(plain.all[0] as Combatant, RIFLE)).toBe(true);
    plain.attack(1, 2, { part: BodyPart.Head });
    expect(seen[1]).toBe(BodyPart.Head);
  });
  it('perki: Bonus Rate of Fire -1 dla dystansu, Bonus HtH Attacks -1 dla piesci/melee, tylko gracz, min 1', () => {
    const c = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), perks: { 5: 1 } }, mk(2, 1, 1, 5)],
      hit(0),
    );
    const p = c.all[0] as Combatant;
    expect(c.attackCost(RIFLE, BodyPart.Uncalled, p)).toBe(4);
    expect(c.attackCost(FISTS, BodyPart.Uncalled, p)).toBe(3);
    const h = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), perks: { 1: 1 } }, mk(2, 1, 1, 5)],
      hit(0),
    );
    const hp = h.all[0] as Combatant;
    expect(h.attackCost(FISTS, BodyPart.Uncalled, hp)).toBe(2);
    expect(h.attackCost(RIFLE, BodyPart.Uncalled, hp)).toBe(5);
    const both = new CombatSession(
      [{ ...mk(1, 0, 0, 9, true), perks: { 5: 1 }, traits: [7] }, mk(2, 1, 1, 5)],
      hit(0),
    );
    expect(both.attackCost(RIFLE, BodyPart.Uncalled, both.all[0] as Combatant)).toBe(3);
    const npc = { ...mk(3, 1, 2, 5), ap: 5, perks: { 5: 1 } };
    expect(c.attackCost(RIFLE, BodyPart.Uncalled, npc)).toBe(5);
  });
  it('ruch kryterow z obiema flagami nog kosztuje 8 AP/heks (moveStepCost)', () => {
    const slow = { ...mk(1, 0, 0, 9, true), legFlags: 0xc };
    const c = new CombatSession([slow, mk(2, 1, 20, 5)], hit(0));
    expect(c.move(1, 1)).toBe(true);
    expect(c.current.ap).toBe(0);
    expect(c.move(1, 2)).toBe(false);
  });
});

describe('AI leczy sie lekiem (chemShouldHeal)', () => {
  const ai = (chemUse: number) =>
    normalizeAiPacket({ chemUse: CHEM_USE_NAMES[chemUse], hurtTooMuch: [] } as never);
  it('ranny krytera z chemUse uzywa leku za 2 AP, zdrowy nie', () => {
    const used: number[] = [];
    const mkc = (hp: number) => [
      mk(1, 0, 0, 9, true),
      { ...mk(2, 1, 40, 1), hp, maxHp: 40, ai: ai(5) },
    ];
    const useHealingChem = (c: Combatant) => {
      used.push(c.id);
      c.hp += 20;
      return true;
    };
    const c = new CombatSession(mkc(10), hit(1), undefined, { useHealingChem });
    c.endTurn();
    const e = c.all.find((x) => x.id === 2)!;
    c.autoTurn();
    expect(used).toEqual([2]);
    expect(e.hp).toBe(30);
    const d = new CombatSession(mkc(40), hit(1), undefined, { useHealingChem });
    d.endTurn();
    d.autoTurn();
    expect(used).toEqual([2]);
  });
});
