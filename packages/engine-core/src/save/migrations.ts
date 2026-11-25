import {
  MOVIE_FLAG_COUNT,
  SAVE_SCHEMA_VERSION,
  type SaveError,
  type SaveGameV7,
} from './schema.js';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isNumArr = (v: unknown, len?: number): boolean =>
  Array.isArray(v) && (len === undefined || v.length === len) && v.every(isNum);
const isNumRecord = (v: unknown): boolean => isObj(v) && Object.values(v).every(isNum);

/** STAT_max_hit_points w indeksacji statow bazowych (po 7 SPECIAL: 0..6). */
const MAX_HP_STAT = 7;
const SLOTS = ['left', 'right', 'armor'];

function validItems(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (i) =>
        isObj(i) &&
        isNum(i['pid']) &&
        isNum(i['count']) &&
        (i['ammo'] === null || isNum(i['ammo'])) &&
        (i['ammoPid'] === null || isNum(i['ammoPid'])) &&
        (i['equippedSlot'] === null ||
          (typeof i['equippedSlot'] === 'string' && SLOTS.includes(i['equippedSlot']))) &&
        validItems(i['contents']),
    )
  );
}

function validPlayer(p: unknown): boolean {
  if (!isObj(p)) return false;
  return (
    isNum(p['hp']) &&
    isNum(p['radiation']) &&
    isNum(p['poison']) &&
    isNum(p['hex']) &&
    isNum(p['elevation']) &&
    isInt(p['orientation']) &&
    p['orientation'] >= 0 &&
    p['orientation'] <= 5 &&
    isInt(p['flags']) &&
    validItems(p['inventory']) &&
    isNumArr(p['baseStats'], 35) &&
    isNumArr(p['statBonuses'], 35) &&
    isNumArr(p['skills'], 18) &&
    isNumArr(p['kills'], 19) &&
    isNumArr(p['taggedSkills']) &&
    isNumArr(p['traits']) &&
    isNumRecord(p['perks']) &&
    isObj(p['progress']) &&
    isNum(p['progress']['level']) &&
    typeof p['progress']['perkPending'] === 'boolean'
  );
}

function validMap(m: unknown): boolean {
  if (!isObj(m)) return false;
  return (
    typeof m['name'] === 'string' &&
    (m['encounter'] === undefined || typeof m['encounter'] === 'boolean') &&
    isNum(m['lastVisitTick']) &&
    isNumArr(m['mapVars']) &&
    isObj(m['scriptLocals']) &&
    Object.values(m['scriptLocals']).every((a) => isNumArr(a)) &&
    Array.isArray(m['elevations']) &&
    m['elevations'].every(
      (e) =>
        isObj(e) &&
        Array.isArray(e['objects']) &&
        e['objects'].every(
          (o) => isObj(o) && isNum(o['pid']) && isNum(o['hex']) && validItems(o['inventory']),
        ),
    )
  );
}

const EFFECT_KIND = {
  'drug-revert': 'drug-stage',
  withdrawal: 'withdrawal',
  'withdrawal-end': 'withdrawal-end',
} as const;

/** Ksztalt TimedEffectData (timed-effects-adapter.ts); seq/useId musza byc skonczone (rebind). */
function validEffectPayload(kind: keyof typeof EFFECT_KIND, p: unknown): boolean {
  return (
    isObj(p) &&
    p['kind'] === EFFECT_KIND[kind] &&
    isNum(p['seq']) &&
    isNum(p['useId']) &&
    isNum(p['targetId']) &&
    isNum(p['atTick']) &&
    isNum(p['drugPid']) &&
    isNum(p['addictionIndex']) &&
    isNum(p['withdrawalEffect']) &&
    Array.isArray(p['deltas']) &&
    p['deltas'].every((d) => isObj(d) && isNum(d['stat']) && isNum(d['amount']))
  );
}

function validEvent(e: unknown): boolean {
  if (!isObj(e) || !isNum(e['atTick']) || typeof e['kind'] !== 'string' || !isNum(e['objId']))
    return false;
  const k = e['kind'];
  if (k === 'drug-revert' || k === 'withdrawal' || k === 'withdrawal-end')
    return validEffectPayload(k, e['payload']);
  return true;
}

function validMeta(m: unknown): boolean {
  return (
    isObj(m) &&
    typeof m['slot'] === 'string' &&
    typeof m['name'] === 'string' &&
    typeof m['characterName'] === 'string' &&
    isNum(m['level']) &&
    typeof m['location'] === 'string' &&
    typeof m['gameDate'] === 'string' &&
    isNum(m['realTime']) &&
    (m['thumbnail'] === null || typeof m['thumbnail'] === 'string') &&
    typeof m['engineVersion'] === 'string'
  );
}

const GVAR_MIN = -(2 ** 31);
const GVAR_MAX = 2 ** 31 - 1;

function validParty(p: unknown): boolean {
  if (p === null) return true;
  if (!isObj(p) || p['version'] !== 1 || typeof p['denied'] !== 'boolean') return false;
  const e = p['entries'];
  if (!Array.isArray(e) || e.length === 0) return false;
  const ids = new Set<number>();
  for (const x of e) {
    if (!isObj(x) || !isInt(x['objId']) || !isInt(x['pid']) || !isObj(x['counters'])) return false;
    const c = x['counters'];
    if (!isInt(c['applied']) || c['applied'] < 0 || !isInt(c['checks']) || c['checks'] < 0)
      return false;
    if (typeof c['roll'] !== 'boolean') return false;
    if (ids.has(x['objId'])) return false;
    ids.add(x['objId']);
  }
  return true;
}

function validGvars(g: unknown): boolean {
  if (g === null) return true;
  if (!isObj(g) || g['version'] !== 1 || !Array.isArray(g['values'])) return false;
  return g['values'].every((v) => isInt(v) && v >= GVAR_MIN && v <= GVAR_MAX);
}

/** sfall: brak/null = OK (starsze zapisy); gdy jest, musi miec poprawny ksztalt. */
function validSfall(s: unknown): boolean {
  if (s === undefined || s === null) return true;
  if (!isObj(s) || s['version'] !== 1) return false;
  if (!isNumRecord(s['globals'])) return false;
  const arrays = s['arrays'];
  if (
    !Array.isArray(arrays) ||
    !arrays.every(
      (a) =>
        isObj(a) &&
        isInt(a['id']) &&
        typeof a['assoc'] === 'boolean' &&
        Array.isArray(a['items']) &&
        a['items'].every(
          (it) =>
            Array.isArray(it) &&
            it.length === 2 &&
            (isNum(it[0]) || typeof it[0] === 'string') &&
            (isNum(it[1]) || typeof it[1] === 'string'),
        ),
    )
  )
    return false;
  const gs = s['globalScripts'];
  return (
    Array.isArray(gs) &&
    gs.every(
      (g) => isObj(g) && typeof g['name'] === 'string' && isNum(g['repeat']) && isNum(g['acc']),
    )
  );
}

/** 17 flag filmow, kazda 0 albo 1. */
function validMovieFlags(v: unknown): boolean {
  return Array.isArray(v) && v.length === MOVIE_FLAG_COUNT && v.every((x) => x === 0 || x === 1);
}

function validCurrent(o: Record<string, unknown>): boolean {
  return (
    validBase(o) &&
    validMovieFlags(o['movieFlags']) &&
    typeof o['gameEnded'] === 'boolean' &&
    typeof o['radiationFlag'] === 'boolean' &&
    validParty(o['party']) &&
    validGvars(o['gvars']) &&
    validSfall(o['sfall'])
  );
}

function validBase(o: Record<string, unknown>): boolean {
  const w = o['world'];
  const meta = o['meta'];
  const rng = o['rng'];
  if (!validMeta(meta)) return false;
  if (!isObj(w) || !validPlayer(w['player'])) return false;
  const cm = w['currentMap'];
  if (!isObj(cm) || typeof cm['name'] !== 'string' || !isInt(cm['elevation'])) return false;
  if (cm['encounter'] !== undefined && typeof cm['encounter'] !== 'boolean') return false;
  const st = w['settings'];
  if (
    !isObj(st) ||
    !isNum(st['gameDifficulty']) ||
    !isNum(st['combatDifficulty']) ||
    !isNum(st['violence'])
  )
    return false;
  if (!isNumRecord(w['scriptTimers'])) return false;
  return (
    Array.isArray(o['maps']) &&
    o['maps'].every(validMap) &&
    Array.isArray(o['queue']) &&
    o['queue'].every(validEvent) &&
    isInt(o['clock']) &&
    (o['clock'] as number) >= 0 &&
    isObj(rng) &&
    isNum(rng['seed']) &&
    isNumRecord(o['globals']) &&
    isObj(o['modData'])
  );
}

/** Uzupelnia ammoPid:null w przedmiotach v1 (rekurencyjnie), bez nadpisywania istniejacych. */
function fillAmmoPid(items: unknown): void {
  if (!Array.isArray(items)) return;
  for (const i of items) {
    if (!isObj(i)) continue;
    if (i['ammoPid'] === undefined) i['ammoPid'] = null;
    fillAmmoPid(i['contents']);
  }
}

/** v1 -> v2: hp/radiation/poison gracza i ammoPid przedmiotow (tylko gdy brak). Mutuje kopie. */
function migrateV1toV2(o: Record<string, unknown>): void {
  const w = o['world'];
  if (isObj(w) && isObj(w['player'])) {
    const p = w['player'];
    fillAmmoPid(p['inventory']);
    if (p['hp'] === undefined) {
      const bs = p['baseStats'];
      const sb = p['statBonuses'];
      const max =
        Array.isArray(bs) && isNum(bs[MAX_HP_STAT])
          ? (bs[MAX_HP_STAT] as number) +
            (Array.isArray(sb) && isNum(sb[MAX_HP_STAT]) ? (sb[MAX_HP_STAT] as number) : 0)
          : 0;
      if (max > 0) p['hp'] = max;
      else {
        p['hp'] = 0;
        const todo = Array.isArray(p['migrationTodo']) ? (p['migrationTodo'] as string[]) : [];
        p['migrationTodo'] = [...todo, 'hp'];
      }
    }
    if (p['radiation'] === undefined) p['radiation'] = 0;
    if (p['poison'] === undefined) p['poison'] = 0;
  }
  if (Array.isArray(o['maps'])) {
    for (const m of o['maps']) {
      if (!isObj(m) || !Array.isArray(m['elevations'])) continue;
      for (const e of m['elevations'])
        if (isObj(e) && Array.isArray(e['objects']))
          for (const ob of e['objects']) if (isObj(ob)) fillAmmoPid(ob['inventory']);
    }
  }
  o['schemaVersion'] = 2;
}

/** v2 -> v3: druzyna i gvars (brak w v2 = null, nie nadpisuje istniejacych). Mutuje kopie. */
function migrateV2toV3(o: Record<string, unknown>): void {
  if (o['party'] === undefined) o['party'] = null;
  if (o['gvars'] === undefined) o['gvars'] = null;
  o['schemaVersion'] = 3;
}

/** v3 -> v4: progress.perkPending (brak = false, nie nadpisuje istniejacego). Mutuje kopie. */
function migrateV3toV4(o: Record<string, unknown>): void {
  const w = o['world'];
  if (isObj(w) && isObj(w['player']) && isObj(w['player']['progress'])) {
    const pr = w['player']['progress'];
    if (pr['perkPending'] === undefined) pr['perkPending'] = false;
  }
  o['schemaVersion'] = 4;
}

/** v4 -> v5: movieFlags (brak = 17 zer, nie nadpisuje istniejacych). Mutuje kopie. */
function migrateV4toV5(o: Record<string, unknown>): void {
  if (o['movieFlags'] === undefined) o['movieFlags'] = new Array<number>(MOVIE_FLAG_COUNT).fill(0);
  o['schemaVersion'] = 5;
}

/** v5 -> v6: gameEnded (brak = false, nie nadpisuje istniejacej). Mutuje kopie. */
function migrateV5toV6(o: Record<string, unknown>): void {
  if (o['gameEnded'] === undefined) o['gameEnded'] = false;
  o['schemaVersion'] = 6;
}

/** v6 -> v7: radiationFlag (brak = false, nie nadpisuje istniejacej). Mutuje kopie. */
function migrateV6toV7(o: Record<string, unknown>): void {
  if (o['radiationFlag'] === undefined) o['radiationFlag'] = false;
  o['schemaVersion'] = 7;
}

/** Przyjmuje obiekt lub tekst JSON; zwraca zapis v7 albo blad (nigdy stan czesciowy). */
export function migrate(input: unknown): SaveGameV7 | SaveError {
  let data = input;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { error: 'save-corrupt' };
    }
  }
  if (!isObj(data)) return { error: 'save-corrupt' };
  const v = data['schemaVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { error: 'save-corrupt' };
  if (v > SAVE_SCHEMA_VERSION) return { error: 'save-too-new' };
  if (v < SAVE_SCHEMA_VERSION) {
    data = structuredClone(data);
    if (v === 1) migrateV1toV2(data as Record<string, unknown>);
    if (v <= 2) migrateV2toV3(data as Record<string, unknown>);
    if (v <= 3) migrateV3toV4(data as Record<string, unknown>);
    if (v <= 4) migrateV4toV5(data as Record<string, unknown>);
    if (v <= 5) migrateV5toV6(data as Record<string, unknown>);
    migrateV6toV7(data as Record<string, unknown>);
  }
  try {
    if (!validCurrent(data as Record<string, unknown>)) return { error: 'save-corrupt' };
  } catch {
    // np. przepelnienie stosu przy patologicznie zagniezdzonym ekwipunku: to uszkodzony zapis, nie wyjatek importu
    return { error: 'save-corrupt' };
  }
  return data as unknown as SaveGameV7;
}
