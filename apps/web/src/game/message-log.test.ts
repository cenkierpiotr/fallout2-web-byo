import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LOG_MAX,
  MessageLog,
  fillPrintf,
  formatCombatEvent,
  partMsgBase,
} from './message-log';
import type { CombatEvent } from './combat';

const MSG = new Map<number, string>([
  [506, 'Ty'],
  [511, '%s został trafiony krytycznie w %s za %d punktów życia'],
  [512, '%s został trafiony w %s za %d punktów życia'],
  [513, '%s został trafiony za %d punktów życia'],
  [515, '%s nie trafił'],
  [514, '%s chybiono krytycznie'],
  [523, '%s został trafiony za 1 punkt życia'],
  [527, '%s został trafiony bez obrażeń'],
  [612, '%s został trafiony w %s za %d punktów życia'],
  [615, '%s chybił'],
  [562, '%s została trafiona w %s za %d punktów życia'],
  [565, '%s nie trafiła'],
  [712, '%s została trafiona w %s za %d punktów życia (F)'],
  [715, '%s chybiła'],
  [1110, 'głowę'],
  [1113, 'tułów'],
]);
const names: Record<number, string> = { 1: 'Ty', 2: 'Gekon' };
const env = {
  msg: MSG,
  nameOf: (id: number) => names[id] ?? `#${id}`,
  playerId: 1,
  t: (k: string, p?: Record<string, string | number>) => `${k}:${JSON.stringify(p ?? {})}`,
};
const atk = (o: Partial<Extract<CombatEvent, { kind: 'attack' }>>): CombatEvent => ({
  kind: 'attack',
  attacker: 1,
  target: 2,
  hit: true,
  damage: 7,
  ...o,
});

describe('formatCombatEvent', () => {
  it('trafienie w glowe za N obrazen (cel NPC: baza 600)', () => {
    expect(formatCombatEvent(atk({ part: 0 }), env)).toBe(
      'Gekon został trafiony w głowę za 7 punktów życia',
    );
  });
  it('czesc ciala wg bazy celu (quadruped 1150) z partMsgBase', () => {
    const m = new Map(MSG).set(1150, 'łeb');
    const e2 = { ...env, msg: m, partBase: () => partMsgBase('dogmet,15,1') };
    expect(formatCombatEvent(atk({ part: 0 }), e2)).toBe(
      'Gekon został trafiony w łeb za 7 punktów życia',
    );
    expect(partMsgBase('hmwarr,11,1')).toBe(1110);
    expect(partMsgBase('hapowr,21,1')).toBe(1210);
    expect(partMsgBase('reserv')).toBeUndefined();
  });
  it('trafienie krytyczne z czescia ciala', () => {
    expect(formatCombatEvent(atk({ part: 3, critical: true, target: 1, attacker: 2 }), env)).toBe(
      'Ty został trafiony krytycznie w tułów za 7 punktów życia',
    );
  });
  it('bez celowania i bez wzorca: fallback i18n, 1 pkt i 0 obrazen', () => {
    expect(formatCombatEvent(atk({ target: 1, attacker: 2, damage: 1 }), env)).toBe(
      'Ty został trafiony za 1 punkt życia',
    );
    expect(formatCombatEvent(atk({ target: 1, attacker: 2, damage: 0 }), env)).toBe(
      'Ty został trafiony bez obrażeń',
    );
    expect(formatCombatEvent(atk({ damage: 4 }), env)).toMatch(/^log\.hit:/);
  });
  it('pudlo i krytyczne pudlo z nazwa atakujacego', () => {
    expect(formatCombatEvent(atk({ hit: false, damage: 0 }), env)).toBe('Ty nie trafił');
    expect(formatCombatEvent(atk({ hit: false, damage: 0, critMiss: true }), env)).toBe(
      'Ty chybiono krytycznie',
    );
    expect(formatCombatEvent(atk({ hit: false, damage: 0, attacker: 2, target: 1 }), env)).toBe(
      'Gekon chybił',
    );
  });
  it('smierc i ucieczka przez i18n, tury/ruch pomijane', () => {
    expect(formatCombatEvent({ kind: 'death', id: 2, anim: 0 }, env)).toBe(
      'log.death:{"name":"Gekon"}',
    );
    expect(formatCombatEvent({ kind: 'turn', id: 1 }, env)).toBeNull();
    expect(formatCombatEvent({ kind: 'move', id: 1, hex: 3 }, env)).toBeNull();
  });
  it('brak pliku combat.msg: wszystko przez i18n', () => {
    expect(formatCombatEvent(atk({ part: 0 }), { ...env, msg: new Map() })).toMatch(/^log\.hit:/);
  });
});

describe('MessageLog', () => {
  it('dodaje, powiadamia, przycina do limitu i czysci', () => {
    const log = new MessageLog();
    const seen: number[] = [];
    log.subscribe((l) => seen.push(l.length));
    log.add('a');
    log.add('   ');
    for (let i = 0; i < MESSAGE_LOG_MAX + 5; i++) log.add(`m${i}`);
    expect(log.lines().length).toBe(MESSAGE_LOG_MAX);
    expect(log.lines().at(-1)).toBe(`m${MESSAGE_LOG_MAX + 4}`);
    log.clear();
    expect(log.lines()).toEqual([]);
    expect(seen[0]).toBe(1);
  });
  it('fillPrintf', () => {
    expect(fillPrintf('%s: %d', 'x', 3)).toBe('x: 3');
  });

  it('wariant zenski: cel gracz kobieta uzywa bazy 550', () => {
    expect(
      formatCombatEvent(atk({ attacker: 2, target: 1, part: 3, targetFemale: true }), env),
    ).toBe('Ty została trafiona w tułów za 7 punktów życia');
  });
  it('wariant zenski: cel NPC kobieta uzywa bazy 700, mezczyzna nadal 600', () => {
    expect(formatCombatEvent(atk({ part: 3, targetFemale: true }), env)).toBe(
      'Gekon została trafiona w tułów za 7 punktów życia (F)',
    );
    expect(formatCombatEvent(atk({ part: 3 }), env)).toBe(
      'Gekon został trafiony w tułów za 7 punktów życia',
    );
  });
  it('wariant zenski: pudlo wg plci atakujacego, brak wpisu wariantu = meski', () => {
    expect(
      formatCombatEvent(atk({ attacker: 2, target: 1, hit: false, attackerFemale: true }), env),
    ).toBe('Gekon chybiła');
    expect(formatCombatEvent(atk({ attacker: 1, hit: false, attackerFemale: true }), env)).toBe(
      'Ty nie trafiła',
    );
    // brak 5xx/7xx dla krytycznego pudla: fallback na meski 514
    expect(
      formatCombatEvent(
        atk({ attacker: 1, hit: false, critMiss: true, attackerFemale: true }),
        env,
      ),
    ).toBe('Ty chybiono krytycznie');
  });
  it('"Ty" dla gracza-kobiety: wpis 556 zamiast 506 (D, exe 0x425243), inaczej 506', () => {
    const m = new Map(MSG).set(556, 'Ty (F)');
    const e = { ...env, msg: m, nameOf: (id: number) => names[id] ?? `#${id}` };
    expect(
      formatCombatEvent(atk({ attacker: 2, target: 1, part: 3, targetFemale: true }), e),
    ).toContain('Ty (F)');
    expect(formatCombatEvent(atk({ attacker: 2, target: 1, part: 3 }), e)).toContain('Ty ');
    expect(formatCombatEvent(atk({ attacker: 2, target: 1, part: 3 }), e)).not.toContain('(F)');
  });
});
