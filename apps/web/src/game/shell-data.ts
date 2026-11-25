import { loadPresets } from '@f2/engine-core';
import { defaultRulesContext } from '@f2/rules';
import type { CreatorPreset, CreatorTexts } from '@f2/app/src/creator-binding';
import type { CharacterTexts } from '@f2/app/src/character-binding';
import type { VirtualFs } from '@f2/vfs';
import { readGameMsg, type GameMsgOptions } from './msg-read';

/**
 * Biografia premade po polsku z pakietu PL (`premade/<id>.bio`, UTF-8, poza repo). Gra bierze biogramy
 * z plikow BIO w MASTER.DAT (nie z .msg, D), wiec pakiet ma je jako osobne pliki. Brak pliku = angielski oryginal.
 */
export async function readPresetBio(
  id: string,
  opts: GameMsgOptions,
  fallback: string,
): Promise<string> {
  if (!opts.pl || !opts.pack) return fallback;
  const bytes = await opts.pack(`premade/${id}.bio`).catch(() => null);
  if (!bytes || bytes.byteLength === 0) return fallback;
  const text = new TextDecoder('utf-8').decode(bytes).replace(/\r\n?/g, '\n').trim();
  return text === '' ? fallback : text;
}

/** Presety i teksty kreatora z danych gry (STAT.MSG: nazwa 100+i, opis 200+i wg dokumentacja techniczna). */
export async function loadCreatorData(
  vfs: Pick<VirtualFs, 'open'>,
  msgOpts: GameMsgOptions = {},
): Promise<{
  presets: CreatorPreset[];
  texts: CreatorTexts;
  rulesContext: typeof defaultRulesContext;
}> {
  const [pre, stat, skill, trait] = await Promise.all([
    loadPresets(vfs).catch(() => []),
    readGameMsg(vfs, 'stat', msgOpts),
    readGameMsg(vfs, 'skill', msgOpts),
    readGameMsg(vfs, 'trait', msgOpts),
  ]);
  const bios = await Promise.all(pre.map((p) => readPresetBio(p.id, msgOpts, p.bio)));
  const presets: CreatorPreset[] = pre.map((p, i) => ({
    id: p.id,
    name: p.gcd.name,
    bio: bios[i] ?? p.bio,
    gender: p.gcd.gender === 1 ? 'female' : 'male',
    age: p.gcd.age,
    special: p.gcd.baseStats.slice(0, 7),
    tags: p.gcd.tags.filter((t) => t >= 0),
    traits: p.gcd.traits,
    pool: p.gcd.unspentSpecialPoints,
  }));
  const g = (m: Map<number, string>, i: number): string => m.get(i) ?? '';
  const texts: CreatorTexts = {
    stat: (i) => ({ name: g(stat, 100 + i), description: g(stat, 200 + i) }),
    skill: (i) => ({ name: g(skill, 100 + i), description: g(skill, 200 + i) }),
    trait: (i) => ({ name: g(trait, 100 + i), description: g(trait, 200 + i) }),
  };
  return { presets, texts, rulesContext: defaultRulesContext };
}

/** Nazwy i opisy atutow (PERK.MSG: 101+i / 1101+i) i cech (TRAIT.MSG: 100+i / 200+i). */
export async function loadCharacterTexts(
  vfs: Pick<VirtualFs, 'open'>,
  msgOpts: GameMsgOptions = {},
): Promise<CharacterTexts> {
  const [perk, trait] = await Promise.all([
    readGameMsg(vfs, 'perk', msgOpts),
    readGameMsg(vfs, 'trait', msgOpts),
  ]);
  const g = (m: Map<number, string>, i: number): string => m.get(i) ?? '';
  return {
    perk: (i) => ({ name: g(perk, 101 + i) || `Perk ${i}`, description: g(perk, 1101 + i) }),
    trait: (i) => ({ name: g(trait, 100 + i) || `Trait ${i}`, description: g(trait, 200 + i) }),
  };
}
