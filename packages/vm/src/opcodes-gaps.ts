import type { ExecContext, OpHandler, ScriptInstance } from './interpreter.js';
import { int, str, toInt, type Value } from './stack.js';
import type { GameHooks } from './hooks.js';

/**
 * Opkody domykajace luki bramki kampanii (dokumentacja techniczna): art_anim, inven_unwield,
 * terminate_combat, inven_cmds, print (0x806b), sfx_build_char_name, sfx_build_weapon_name oraz
 * sfall get/set_critter_*_stat (0x815e-0x8161). Semantyka z deasemblacji silnik gry (specyfikacja formatu), patrz
 * `dokumentacja techniczna`, sekcja "Badania opkodow bramki kampanii". Wszystkie hooki sa opcjonalne:
 * gdy host ich nie dostarcza, opkod zdejmuje argumenty i zglasza `hooks.unsupported` (jak zastepnik),
 * wiec stos pozostaje poprawny.
 */
export interface GapHooks {
  /**
   * inven_unwield (0x812c, 0x45b0a8): zdejmuje przedmiot z reki self_obj. Reka: dla gracza aktywna reka
   * interfejsu (0 = lewa, 1 = prawa), dla pozostalych zawsze prawa (1). Wybor reki robi host.
   */
  invenUnwield(instance: ScriptInstance): void;
  /**
   * terminate_combat (0x8153, 0x45ca84): gdy trwa walka, ustawia flage 0x5186cc i dla self_obj-krytera:
   * maneuver |= 2, whoHitMe = 0, ostatni cel = 0.
   */
  terminateCombat(instance: ScriptInstance): void;
  /** inven_cmds(obj, 13, index) (0x8109): przedmiot na pozycji `index` ekwipunku (0x472740), -1 gdy brak. */
  invenIndexPtr(who: number, index: number): number;
  /** print (0x806b, 0x46213c): tekst kierowany do okna skryptowego interpretera (poza grafika gry). */
  printText(text: string): void;
  /** sfx_build_char_name(obj, anim, extra) (0x45b9c4 -> 0x451604): nazwa pliku dzwieku krytera. */
  sfxBuildCharName(obj: number, anim: number, extra: number): string;
  /** sfx_build_weapon_name(effectType, weapon, hitMode, target) (0x45bcac -> 0x451760). */
  sfxBuildWeaponName(effectType: number, weapon: number, hitMode: number, target: number): string;
}

type Maybe = Partial<GapHooks>;
const gh = (c: ExecContext): Maybe => c.hooks as unknown as Maybe;
const gm = (c: ExecContext): GameHooks => c.hooks as unknown as GameHooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();

/** Maska typu animacji w FID: bity 16..23 (0x45c5f8: and 0xff0000, shr 16). */
export const FID_ANIM_MASK = 0xff0000;
/** Numer komendy inven_cmds zwracajacy wskaznik przedmiotu (0x459215: cmp [esp+4], 0xd). */
export const INVEN_CMD_INDEX_PTR = 13;

const h = new Map<number, OpHandler>();

// art_anim(fid) -> kod animacji z FID
h.set(0x814a, (c) => {
  const fid = popInt(c);
  c.stack.push(int((fid & FID_ANIM_MASK) >>> 16));
});

// inven_unwield()
h.set(0x812c, (c) => {
  const f = gh(c).invenUnwield;
  if (f) f(c.instance);
  else gm(c).unsupported('inven_unwield', []);
});

// terminate_combat()
h.set(0x8153, (c) => {
  const f = gh(c).terminateCombat;
  if (f) f(c.instance);
  else gm(c).unsupported('terminate_combat', []);
});

// inven_cmds(obj, cmd, index): tylko cmd 13 zwraca przedmiot, reszta 0; brak obiektu = ostrzezenie i 0
h.set(0x8109, (c) => {
  const index = popInt(c);
  const cmd = popInt(c);
  const who = popObj(c);
  let result: Value = int(0);
  if (who !== -1 && cmd === INVEN_CMD_INDEX_PTR) {
    const id = gh(c).invenIndexPtr?.(who, index) ?? -1;
    // oryginal: wskaznik albo 0; "brak" jako null, bo id 0 moze byc prawdziwym obiektem
    result = id === -1 ? { t: 'null' } : { t: 'obj', v: id };
  }
  c.stack.push(result);
});

// print(string) (0x806b)
h.set(0x806b, (c) => {
  const text = c.stack.popStr();
  const f = gh(c).printText;
  if (f) f(text);
});

// sfx_build_char_name(obj, anim, extra) -> string; brak obiektu = ostrzezenie i pusty string
h.set(0x813d, (c) => {
  const extra = popInt(c);
  const anim = popInt(c);
  const obj = popObj(c);
  const name = obj === -1 ? '' : (gh(c).sfxBuildCharName?.(obj, anim, extra) ?? '');
  c.stack.push(str(name));
});

// sfx_build_weapon_name(effectType, weapon, hitMode, target) -> string
h.set(0x8141, (c) => {
  const target = popObj(c);
  const hitMode = popInt(c);
  const weapon = popObj(c);
  const effect = popInt(c);
  c.stack.push(str(gh(c).sfxBuildWeaponName?.(effect, weapon, hitMode, target) ?? ''));
});

// sfall/patch 0x815e-0x8161: staty dowolnego krytera (wzorzec uzycia w nhmyron.int, kolejnosc jak 0x815a-0x815d)
h.set(0x815e, (c) => {
  const v = popInt(c);
  const stat = popInt(c);
  gm(c).setCritterStat(popObj(c), stat, v);
});
h.set(0x815f, (c) => {
  const v = popInt(c);
  const stat = popInt(c);
  gm(c).unsupported('set_critter_extra_stat', [int(popObj(c)), int(stat), int(v)]);
});
h.set(0x8160, (c) => {
  const stat = popInt(c);
  c.stack.push(int(gm(c).getCritterStat(popObj(c), stat)));
});
h.set(0x8161, (c) => {
  const stat = popInt(c);
  c.stack.push(gm(c).unsupported('get_critter_extra_stat', [int(popObj(c)), int(stat)]));
});

export const gapHandlers: ReadonlyMap<number, OpHandler> = h;
