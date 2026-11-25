/** Surowy parser AI.TXT (pakiety AI). Enumy zostaja stringami; walidacja w rules/ai/packets. */
import { parseIni } from './ini.js';

export type HurtFlag = 'blind' | 'crippled' | 'crippled_arms' | 'crippled_legs';
export type AiMsgKey =
  | 'attack'
  | 'move'
  | 'run'
  | 'miss'
  | 'hitEyes'
  | 'hitGroin'
  | 'hitHead'
  | 'hitLeftArm'
  | 'hitLeftLeg'
  | 'hitRightArm'
  | 'hitRightLeg'
  | 'hitTorso';

export interface AiPacketRaw {
  name: string;
  packetNum: number;
  aggression: number;
  maxDist: number;
  minToHit: number;
  minHp: number;
  calledFreq: number;
  secondaryFreq: number;
  chance: number;
  color: number;
  outlineColor: number;
  font: number;
  hurtTooMuch: Set<HurtFlag>;
  areaAttackMode?: string;
  runAwayMode?: string;
  bestWeapon?: string;
  distance?: string;
  attackWho?: string;
  chemUse?: string;
  chemPrimaryDesire: number[];
  disposition?: string;
  generalType?: string;
  bodyType?: string;
  msgRanges: Record<AiMsgKey, [number, number]>;
}

const HURT_FLAGS: ReadonlySet<string> = new Set([
  'blind',
  'crippled',
  'crippled_arms',
  'crippled_legs',
]);

const MSG_KEYS: ReadonlyArray<readonly [AiMsgKey, string]> = [
  ['attack', 'attack'],
  ['move', 'move'],
  ['run', 'run'],
  ['miss', 'miss'],
  ['hitEyes', 'hit_eyes'],
  ['hitGroin', 'hit_groin'],
  ['hitHead', 'hit_head'],
  ['hitLeftArm', 'hit_left_arm'],
  ['hitLeftLeg', 'hit_left_leg'],
  ['hitRightArm', 'hit_right_arm'],
  ['hitRightLeg', 'hit_right_leg'],
  ['hitTorso', 'hit_torso'],
];

const NUM_FIELDS = [
  ['packet_num', 'packetNum'],
  ['aggression', 'aggression'],
  ['max_dist', 'maxDist'],
  ['min_to_hit', 'minToHit'],
  ['min_hp', 'minHp'],
  ['called_freq', 'calledFreq'],
  ['secondary_freq', 'secondaryFreq'],
  ['chance', 'chance'],
  ['color', 'color'],
  ['outline_color', 'outlineColor'],
  ['font', 'font'],
] as const;

const STR_FIELDS = [
  ['area_attack_mode', 'areaAttackMode'],
  ['run_away_mode', 'runAwayMode'],
  ['best_weapon', 'bestWeapon'],
  ['distance', 'distance'],
  ['attack_who', 'attackWho'],
  ['chem_use', 'chemUse'],
  ['disposition', 'disposition'],
  ['general_type', 'generalType'],
  ['body_type', 'bodyType'],
] as const;

function int(section: string, key: string, v: string | undefined): number {
  if (v === undefined) return 0;
  const n = Number(v);
  if (v === '' || !Number.isInteger(n))
    throw new Error(`AI.TXT [${section}] ${key}: nieprawidlowa liczba '${v}'`);
  return n;
}

export function parseAiTxt(text: string): AiPacketRaw[] {
  return parseIni(text).map((sec) => {
    const e = sec.entries;
    const name = sec.name;
    const msgRanges = {} as Record<AiMsgKey, [number, number]>;
    for (const [camel, snake] of MSG_KEYS) {
      msgRanges[camel] = [
        int(name, `${snake}_start`, e.get(`${snake}_start`)),
        int(name, `${snake}_end`, e.get(`${snake}_end`)),
      ];
    }
    const p: AiPacketRaw = {
      name,
      packetNum: 0,
      aggression: 0,
      maxDist: 0,
      minToHit: 0,
      minHp: 0,
      calledFreq: 0,
      secondaryFreq: 0,
      chance: 0,
      color: 0,
      outlineColor: 0,
      font: 0,
      hurtTooMuch: new Set<HurtFlag>(),
      chemPrimaryDesire: [],
      msgRanges,
    };
    for (const [snake, camel] of NUM_FIELDS) p[camel] = int(name, snake, e.get(snake));
    for (const [snake, camel] of STR_FIELDS) {
      const v = e.get(snake);
      if (v !== undefined) p[camel] = v;
    }
    const hurt = e.get('hurt_too_much');
    if (hurt !== undefined) {
      for (const part of hurt.split(',')) {
        const f = part.trim();
        if (HURT_FLAGS.has(f)) p.hurtTooMuch.add(f as HurtFlag);
      }
    }
    const chem = e.get('chem_primary_desire');
    if (chem !== undefined && chem.trim() !== '') {
      p.chemPrimaryDesire = chem.split(',').map((x) => int(name, 'chem_primary_desire', x.trim()));
    }
    return p;
  });
}
