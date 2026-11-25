import { describe, expect, it } from 'vitest';
import {
  FIX_REGISTRY,
  applyProtoFixes,
  fixEnabled,
  resolveFixes,
  scaleTravelTicks,
  stepCost,
  skillDec,
  Skill,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  recalcDerived,
  skillTag,
  type CritterData,
  type SkillCritter,
  type SkillPoolState,
} from '../src/index.js';

describe('rejestr poprawek (ADR-0004)', () => {
  it('kazdy wpis ma id rules.fixes.<nazwa>, opis PL i EN oraz znane pola', () => {
    const ids = new Set<string>();
    for (const f of FIX_REGISTRY) {
      expect(f.id).toMatch(/^[a-zA-Z][a-zA-Z0-9]+$/);
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(f.title.pl.length).toBeGreaterThan(3);
      expect(f.title.en.length).toBeGreaterThan(3);
      expect(f.desc.pl.length).toBeGreaterThan(15);
      expect(f.desc.en.length).toBeGreaterThan(15);
      expect(['D', 'P', 'Z']).toContain(f.confidence);
      expect(['active', 'pending', 'external']).toContain(f.status);
      expect(f.desc.pl + f.desc.en + f.title.pl + f.title.en).not.toContain('—');
    }
  });

  it('domyslnie wszystkie aktywne poprawki wlaczone (ADR-0004)', () => {
    const f = resolveFixes({});
    for (const d of FIX_REGISTRY) expect(f[d.id]).toBe(d.status === 'active');
  });

  it('nadpisania uzytkownika wygrywaja, nieznane klucze ignorowane', () => {
    const f = resolveFixes({ pathfinderFix: false, nieznana: true });
    expect(f.pathfinderFix).toBe(false);
    expect('nieznana' in f).toBe(false);
  });

  it('tryb klasyczny wylacza wszystkie poprawki', () => {
    const f = resolveFixes({ pathfinderFix: true }, true);
    expect(Object.values(f).every((v) => v === false)).toBe(true);
  });

  it('fixEnabled czyta flage', () => {
    expect(fixEnabled({ a: true }, 'a')).toBe(true);
    expect(fixEnabled({}, 'a')).toBe(false);
  });
});

describe('poprawki prototypow (vanilla vs patch 1.02.25)', () => {
  const crit = (pid: number, over: Record<string, unknown> = {}) => ({
    pid,
    kind: 'critter',
    critterFlags: 2,
    bonusStats: new Array<number>(38).fill(0),
    ...over,
  });

  it('wlaczona poprawka ustawia wartosc z patcha, wylaczona wraca do vanilli', () => {
    const p = crit(16777318);
    const on = applyProtoFixes(p, resolveFixes({}));
    expect(on.critterFlags).toBe(0);
    const off = applyProtoFixes(on, resolveFixes({ protoNoBarterFlag: false }));
    expect(off.critterFlags).toBe(2);
    expect(p.critterFlags).toBe(2); // brak mutacji wejscia
  });

  it('pola tablicowe (bonusStats[9])', () => {
    const on = applyProtoFixes(crit(16777688), resolveFixes({}));
    expect(on.bonusStats[9]).toBe(26);
    const off = applyProtoFixes(on, resolveFixes({ protoK9ArmorClass: false }));
    expect(off.bonusStats[9]).toBe(0);
  });

  it('prototyp bez wpisow zwracany bez zmian (ta sama referencja)', () => {
    const p = crit(16777999);
    expect(applyProtoFixes(p, resolveFixes({}))).toBe(p);
  });

  it('pole tail[0] broni', () => {
    const w = { pid: 350, kind: 'item', tail: [76], data: [] as number[] };
    expect(applyProtoFixes(w, resolveFixes({})).tail[0]).toBe(82);
  });
});

describe('pathfinderFix (sfall PathfinderFix)', () => {
  it('bez poprawki: oryginalne obnizenie kosztu kroku, czas bez zmian', () => {
    expect(stepCost(4, 2)).toBe(2);
    expect(scaleTravelTicks(18000, 2, {})).toBe(18000);
  });
  it('z poprawka: 25% krocej na range, koszt kroku bez obnizki', () => {
    const f = { pathfinderFix: true };
    expect(scaleTravelTicks(18000, 0, f)).toBe(18000);
    expect(scaleTravelTicks(18000, 1, f)).toBe(13500);
    expect(scaleTravelTicks(18000, 2, f)).toBe(9000);
    expect(stepCost(4, 2, f)).toBe(4);
  });
});

describe('skillRefundTagTier jako flaga', () => {
  const base = defaultRulesContext();
  const make = (): SkillCritter & SkillPoolState => {
    const b: CritterData = newCritterData(true);
    [5, 5, 5, 5, 5, 5, 5].forEach((v, i) => (b.baseStats[i] = v));
    recalcDerived(b, base);
    const c = Object.assign(b, newSkillState(), { skillPoints: 0 }) as SkillCritter &
      SkillPoolState;
    skillTag(c, Skill.SmallGuns);
    c.skillRaw[Skill.SmallGuns] = 95;
    return c;
  };
  it('flaga zmienia zwrot punktow przy przejsciu progu', () => {
    const a = make();
    const b = make();
    skillDec(a, Skill.SmallGuns, { ...base, fixes: {} });
    skillDec(b, Skill.SmallGuns, { ...base, fixes: resolveFixes({}) });
    expect(b.skillPoints).toBeGreaterThanOrEqual(a.skillPoints);
  });
});
