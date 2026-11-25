import { describe, expect, it } from 'vitest';
import { Perk, Stat, newCritterData, newSkillState } from '@f2/rules';
import { CritterStatsModel, type CritterRecord } from '../critter-stats.js';
import { fake } from './helpers.js';
import { defaultRulesContext } from '@f2/rules';

const player = fake(1, 100);
const npc = fake(1, 101);
npc.proto = {
  baseStats: Array.from({ length: 35 }, (_, i) => (i < 7 ? 6 : 0)),
  bonusStats: new Array(35).fill(0),
  skills: new Array(18).fill(0),
  aiPacket: 12,
  team: 3,
} as never;

function model(rec?: CritterRecord) {
  return new CritterStatsModel({
    isPlayer: (o) => o === player,
    playerRecord: () => rec,
    context: () => defaultRulesContext(),
  });
}

describe('CritterStatsModel: staty pochodne wg formul exe', () => {
  it('gracz domyslny: SPECIAL 5, wiek 25, plec 0 i pochodne', () => {
    const m = model();
    expect(m.getStat(player, Stat.Strength)).toBe(5);
    expect(m.getStat(player, Stat.Age)).toBe(25);
    expect(m.getStat(player, Stat.MaxHitPoints)).toBe(15 + 5 + 2 * 5);
    expect(m.getStat(player, Stat.MaxActionPoints)).toBe(5 + 2);
    expect(m.getStat(player, Stat.ArmorClass)).toBe(5);
    expect(m.getStat(player, Stat.CarryWeight)).toBe(25 + 25 * 5);
    expect(m.getStat(player, Stat.Sequence)).toBe(10);
    expect(m.getStat(player, Stat.HealingRate)).toBe(1);
    expect(m.getStat(player, Stat.CriticalChance)).toBe(5);
    expect(m.getStat(player, Stat.MeleeDamage)).toBe(1);
    expect(m.getStat(player, Stat.RadiationResistance)).toBe(10);
    expect(m.getStat(player, Stat.PoisonResistance)).toBe(25);
    expect(m.getStat(player, Stat.CurrentHitPoints)).toBe(30);
  });
  it('NPC z prototypu; obiekt spoza krytera = -1', () => {
    const m = model();
    expect(m.getStat(npc, Stat.Strength)).toBe(6);
    expect(m.getStat(fake(0, 5), Stat.Strength)).toBe(-1);
    expect(m.getStat(undefined, 0)).toBe(-1);
  });
  it('set_critter_stat zmienia SPECIAL i przelicza pochodne', () => {
    const m = model();
    expect(m.setStat(player, Stat.Strength, 8)).toBe(0);
    expect(m.getStat(player, Stat.CarryWeight)).toBe(25 + 25 * 8);
    expect(m.getStat(player, Stat.MeleeDamage)).toBe(3);
    expect(m.setStat(player, Stat.MaxHitPoints, 1)).toBe(-1); // pochodne tylko do odczytu
    expect(m.setStat(player, Stat.Luck, 11)).toBe(-1); // poza zakresem
  });
  it('perki: add/rm przez model, ranga i efekt statowy', () => {
    const m = model();
    expect(m.addPerk(player, Perk.BonusHtHDamage)).toBe(true);
    expect(m.perkRank(player, Perk.BonusHtHDamage)).toBe(1);
    expect(m.getStat(player, Stat.MeleeDamage)).toBe(3);
    m.removePerk(player, Perk.BonusHtHDamage);
    expect(m.perkRank(player, Perk.BonusHtHDamage)).toBe(0);
  });
  it('trait gracza (has_trait kind 2) i skill (critter_mod_skill)', () => {
    const rec: CritterRecord = { ...newCritterData(true), ...newSkillState() };
    rec.traits = [3, -1];
    const m = model(rec);
    expect(m.playerTrait(player, 3)).toBe(1);
    expect(m.playerTrait(player, 4)).toBe(0);
    expect(m.playerTrait(player, 16)).toBe(0);
    const before = m.skill(player, 0);
    m.modSkill(player, 0, 4);
    expect(m.skill(player, 0)).toBe(before + 4);
  });
  it('has_trait kind 0: perki 0, 44, 46 (uzywane tylko przez skrypty) zwracaja range', () => {
    const rec: CritterRecord = { ...newCritterData(true), ...newSkillState() };
    rec.perkRanks[0] = 1;
    rec.perkRanks[44] = 1;
    rec.perkRanks[46] = 1;
    const m = model(rec);
    expect(m.perkRank(player, 0)).toBe(1);
    expect(m.perkRank(player, 44)).toBe(1);
    expect(m.perkRank(player, 46)).toBe(1);
    expect(m.perkRank(player, 45)).toBe(0);
  });
});
