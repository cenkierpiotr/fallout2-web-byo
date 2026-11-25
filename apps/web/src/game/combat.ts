import {
  attackApCost,
  moveStepCost,
  spendMoveAp,
  standUp,
  SOLAR_SCORCHER_PID,
  solarScorcherReady,
  freeMoveAp,
  FREE_MOVE_PERK,
  Perk,
  Trait,
  BodyPart,
  DamageType,
  EXPLOSION_MAX_RADIUS,
  addExplosionExtra,
  explosionRingTiles,
  apAtTurnStart,
  chooseBestWeapon,
  acceptableToHit,
  chooseTarget,
  combatShouldEnd,
  createRng,
  isExplosionVictimEligible,
  mayApproach,
  mayUseAreaWeapon,
  allyFireCheck,
  classPreferred,
  aiMayPickInventoryWeapon,
  ANIM_FIRE_BURST,
  aiSecondaryModeChoice,
  selectDeathAnim,
  shouldFlee,
  chemShouldHeal,
  tauntMsgId,
  turnOrder,
  type AiMsgKind,
  type AiPacket,
  type Rng,
  type WeaponCandidate,
} from '@f2/rules';

/**
 * Sesja walki turowej na silniku z `@f2/rules` (kolejnosc tur, AP, toHit, obrazenia, krytyki, serie,
 * eksplozje, animacje smierci, wybor broni AI, warunek konca). Same wzory sa w `combat-rules.ts`
 * (resolver); tu jest stan tury, koszty AP i sterowanie AI.
 * Z (dokumentacja techniczna): koszt AP ataku i ruchu, +1 AP za celowanie, geometria serii/eksplozji.
 */

/** Perk 0x65 (0x41060c): progi animacji smierci 1/1 przy obrazeniach ognia. */
const DEATH_PYROMANIAC_PERK = 0x65;
/** Flaga proto krytera 0x1000 (D 0x41060c/0x42e6ac, pole proto+0x20). */
const CRITTER_FLAG_SPECIAL_DEATH = 0x1000;

/** Opis broni uczestnika (z proto lub domyslna piesc). */
export interface WeaponSpec {
  name: string;
  pid: number;
  minDmg: number;
  maxDmg: number;
  /** Koszt AP jednego ataku (Z). */
  apCost: number;
  /** Koszt AP drugiego trybu (proto+0x48 = data[9], D 0x478c68); brak = jak apCost. */
  apCost2?: number;
  /** Zasieg w heksach (1 = wrecz). */
  range: number;
  /** Drugi tryb ataku broni (proto: nibble extFlags >> 4, data[5], data[9]); brak = bron ma jeden tryb. */
  secondary?: WeaponAltMode;
  /** Wartosc skilla broni (0..300). */
  skill: number;
  /** Liczba pociskow serii (1 = strzal pojedynczy). */
  burst: number;
  /** Obrazenia obszarowe (granat, rakieta); geometria pierscieni Z, promien 1 hex. */
  explosive?: boolean;
  damageType: DamageType;
  ammoMult?: number;
  ammoDiv?: number;
  ammoDrMod?: number;
  /** Klasa broni dla AI (1 piesc, 2 melee, 3 rzut, 4 dystans); patrz ATTACK_MODE_CLASS. */
  cls: 1 | 2 | 3 | 4;
  /** Kod animacji ataku (Z: numeracja), do wyboru animacji smierci. */
  attackAnim?: number;
  /** Min ST broni (`proto+0x40` = data[7]), D: kara 20 skilla za kazdy brakujacy punkt. */
  minSt?: number;
  /** Bron dwureczna (`proto+0x18 & 0x200`, extFlags), D: cecha One Hander gracza. */
  twoHanded?: boolean;
  /** Perk broni (`proto+0x50` = data[11]): 0x3a Long Range, 0x40 Scope Range, 0x3b Accurate (D). */
  weaponPerk?: number;
  /** Korekta AC amunicji (`ammo proto+0x2c`); Z: powiazanie z zaladowana amunicja nie jest podpiete. */
  ammoAcMod?: number;
}

/** Cechy drugiego trybu ataku (koszt AP to `apCost2` broni, D 0x478b24). */
export interface WeaponAltMode {
  range: number;
  burst: number;
  cls: 1 | 2 | 3 | 4;
  explosive?: boolean;
}

/** Tryb ataku broni: 0 = podstawowy, 1 = drugi (data[9]). */
export type AttackMode = 0 | 1;

/**
 * Bron widziana w danym trybie: tryb 1 nadpisuje zasieg, serie i klase cechami drugiego trybu, a koszt AP bierze z `apCost2`.
 * Bez drugiego trybu (albo tryb 0) zwraca te sama bron.
 */
export function weaponInMode(w: WeaponSpec, mode: AttackMode): WeaponSpec {
  if (mode === 0 || !w.secondary) return w;
  const { secondary, apCost2, ...rest } = w;
  const m: WeaponSpec = {
    ...rest,
    apCost: apCost2 ?? w.apCost,
    range: secondary.range,
    burst: secondary.burst,
    cls: secondary.cls,
  };
  if (secondary.explosive !== undefined) m.explosive = secondary.explosive;
  else delete m.explosive;
  return m;
}

export const FISTS: WeaponSpec = {
  name: 'fists',
  pid: 0,
  minDmg: 1,
  maxDmg: 2,
  apCost: 3,
  range: 1,
  skill: 55,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 1,
};

export interface Combatant {
  id: number;
  team: number;
  hp: number;
  maxAp: number;
  sequence: number;
  agility: number;
  hex: number;
  ap: number;
  isPlayer: boolean;
  /** pid obiektu (obj+0x64); wyjatek 0x10001e0 w kontroli ognia do sojusznikow (0x4213fc). */
  pid?: number;
  /** Druzyna ostatniego, ktory trafil uczestnika. */
  whoHitMeTeam?: number;
  /** Id ostatniego atakujacego (attack_who = whomever_attacking_me). */
  whoHitMeId?: number;
  /** Pakiet AI z AI.TXT (brak = proste AI: najblizszy cel, bez ucieczki i taunta). */
  ai?: AiPacket;
  name?: string;
  maxHp?: number;
  luck?: number;
  perception?: number;
  /** SPECIAL (indeks statu 0..6: ST PE EN CH IN AG LK); test statu krytyka i kara za sile. */
  special?: readonly number[];
  /** Uszkodzone oczy (`+0x44` bit 0x40): kara -25 do trafienia, D. */
  eyesCrippled?: boolean;
  /** Cel multihex (`+0x25 & 8`): +15 do trafienia, D. */
  multihex?: boolean;
  /** Darmowe punkty ruchu tury (Bonus Move, perk 3; D 0x42299c); zuzywane przed AP, zerowane na koncu tury. */
  freeMove?: number;
  /** Klasa pancerza (stat 9). */
  ac?: number;
  /** DT i DR% per typ obrazen (indeks = DamageType). */
  dt?: readonly number[];
  dr?: readonly number[];
  /** Szansa krytyka (stat 15) i Better Criticals (stat 16). */
  critChance?: number;
  /** Wartosc statu 16 (Better Criticals): dodawana do rzutu na poziom krytyka (D; perk = +20). */
  betterCriticals?: number;
  /** Typ ofiary dla tablicy krytykow NPC. */
  killType?: number;
  /** Plec zenska (stat 0x22 = 1); wariant tekstow walki 550/700. */
  female?: boolean;
  weapons?: readonly WeaponSpec[];
  /** `body_type` proto krytera (+0x184, D 0x42ddc4); brak = 0 (biped). Bramka 0x4299a0 (`aiMayPickInventoryWeapon`). */
  bodyType?: number;
  /** Flagi nog: +0x44 obiektu krytera (flagi obrazen, extra.raw[3]; bity 0x4/0x8 = okaleczone nogi) dla kosztu ruchu; brak = 1 AP/heks. */
  legFlags?: number;
  /** Flagi proto krytera (`proto+0x20`, 0x42e6ac); bit 0x1000 = smierc specjalna (anim 0x1f, D 0x41060c). */
  critterFlags?: number;
  /** Surowy best_weapon z AI.TXT (-1 brak). */
  aiBestWeapon?: number;
  prone?: boolean;
  /** Sloty traitow gracza (-1 = pusty); Fast Shot (7) obniza koszt AP broni dystansowej. */
  traits?: readonly number[];
  /** Rangi perkow wg id (@f2/rules Perk); Bonus HtH Attacks (1) i Bonus Rate of Fire (5) obnizaja koszt AP. */
  perks?: Readonly<Record<number, number>>;
  /** Skradanie aktywne (bit 0 flag +0x20 protokolu gracza, 0x42e2f8); Silent Death (perk 25). */
  sneaking?: boolean;
  /** Obrot 0..5; Silent Death sprawdza atak od tylu (0x412bc4). */
  rotation?: number;
}

export interface CriticalInfo {
  level: number;
  multiplier: number;
  msgId: number;
  flags: number;
}

export interface AttackOutcome {
  hit: boolean;
  damage: number;
  part?: BodyPart;
  /** Trafienie krytyczne. */
  critical?: CriticalInfo;
  /** Poziom krytycznego pudla (0..4); efekty tablicy 0x517fa0 sa Z (tylko komunikat). */
  critMiss?: number;
  rounds?: number;
  hitRounds?: number;
  /** Szansa trafienia uzyta w rzucie. */
  chance?: number;
  /** Cel powalony/ogluszony (flagi krytyka & 3 albo Enhanced Knockout 0x75); wstaje kosztem AP w swojej turze. */
  knockedDown?: boolean;
  /** Odrzut po Stonewall celu-gracza (dmg/10, 0 gdy anulowany); ruch odrzutu nie jest odtwarzany na mapie. */
  knockback?: number;
}

export interface AttackContext {
  part: BodyPart;
  weapon: WeaponSpec;
  distance: number;
  /** Obrazenia obszarowe wokol celu: bez rzutu, bez krytyka. */
  splash?: boolean;
  /**
   * Opt-in: rozklad serii po liniach (resolveBurstSpread, 0x423488). Dostaje szanse trafienia i rng,
   * zwraca trafienia glownego celu; bez niego dziala dotychczasowy resolveBurst.
   */
  burstSpread?: (chance: number, rng: Rng) => number;
  /**
   * Liczba trafionych pociskow narzucona z zewnatrz (dodatkowy cel serii, 0x423488): bez rzutu na trafienie
   * i bez krytyka, obrazenia jak dla zwyklych trafien.
   */
  forcedHits?: number;
}

export type AttackResolver = (
  attacker: Combatant,
  target: Combatant,
  ctx: AttackContext,
) => AttackOutcome;

export type CombatEvent =
  | { kind: 'turn'; id: number }
  | {
      kind: 'attack';
      attacker: number;
      target: number;
      hit: boolean;
      damage: number;
      part?: BodyPart;
      critical?: boolean;
      critMiss?: boolean;
      knockedDown?: boolean;
      splash?: boolean;
      /** Typ obrazen broni (DamageType); trafienie podaje go do damage_p_proc celu (metarule 49). */
      damageType?: DamageType;
      /** Plec zenska atakujacego / celu (stat 0x22 = 1); wybor wariantu komunikatu combat.msg. */
      attackerFemale?: boolean;
      targetFemale?: boolean;
    }
  | { kind: 'death'; id: number; anim: number }
  | { kind: 'move'; id: number; hex: number }
  | { kind: 'taunt'; id: number; msgId: number }
  | { kind: 'flee'; id: number }
  | { kind: 'end'; playerAlive: boolean };

export interface CombatEnv {
  /** Sciezka od uczestnika do heksa (bez heksa startowego); null = brak. */
  path?: (c: Combatant, to: number) => number[] | null;
  /** Wywolywane po kazdym przesunieciu uczestnika (synchronizacja ze swiatem). */
  onMove?: (c: Combatant, path: readonly number[]) => void;
  /** Zrodlo losowosci AI (wybor broni, cel, taunty). */
  rng?: Rng;
  /** Szansa trafienia (0..100) do progu `min_to_hit` pakietu AI; brak = bez progu. */
  hitChance?: (a: Combatant, t: Combatant, w: WeaponSpec, distance: number) => number;
  /** Sciezka ucieczki od `from` (bez heksa startowego); brak = prosta linia od wroga. */
  flee?: (c: Combatant, from: Combatant, maxSteps: number) => number[] | null;
  /**
   * Leczenie lekiem z ekwipunku krytera (D: AI uzywa leku gdy `chemShouldHeal`, koszt 2 AP wg 0x428480).
   * Zwraca true gdy lek znaleziono i zuzyto (hook podnosi `c.hp`); brak hooka = AI nie leczy sie lekami.
   */
  useHealingChem?: (c: Combatant) => boolean;
  /** Sasiad heksa w kierunku 0..5 (0x4b1a6c, krok 1; <0 poza siatka); wlacza pierscienie eksplozji 1..3 (D). */
  neighbor?: (hex: number, dir: number) => number;
  /**
   * Zadanie walki exe (0x4a45d4 -> 0x422d2c): atakujacy otwiera kolejke tur (0x42243c), a kazdy uczestnik dostaje
   * jako whoHitMe najblizszego zywego z przeciwnej druzyny (0x429210/0x428c3c); atakujacy i cel wskazuja siebie nawzajem.
   */
  request?: { attacker: number; defender: number };
  /**
   * Rozklad celow serii (0x423488): zwraca trafienia glownego celu i dopisuje do `extras` trafienia innych
   * krytterow na liniach serii. Brak hooka = stary resolveBurst (jeden cel).
   */
  burstSpread?: (
    a: Combatant,
    t: Combatant,
    w: WeaponSpec,
    chance: number,
    rng: Rng,
    extras: { id: number; hits: number }[],
  ) => number;
  /**
   * Id krytterow na torach serii `w` z `a` w `t` (0x4243a8, wejscie burstVictims w allyFireCheck 0x4213e8).
   * Brak hooka = tory nieznane (kontrola sojusznikow tylko dla broni obszarowej).
   */
  burstVictims?: (a: Combatant, t: Combatant, w: WeaponSpec) => readonly number[];
  /** Swiatlo otoczenia 0x4000..0x10000 (Solar Scorcher, 0x478874); brak = bez ograniczenia. */
  ambientLight?: () => number;
}

/** Dynamiczny stan uczestnika walki do zapisu (reszta powstaje z proto przy odbudowie walki). */
export interface CombatantSave {
  id: number;
  hp: number;
  ap: number;
  maxAp: number;
  hex: number;
  maxHp?: number;
  prone?: boolean;
  legFlags?: number;
  freeMove?: number;
  whoHitMeTeam?: number;
  whoHitMeId?: number;
}

/** Zapis trwajacej walki: kolejnosc tur, indeks biezacej tury, stan uczestnikow (Zadanie 43). */
export interface CombatSessionSave {
  version: 1;
  order: CombatantSave[];
  idx: number;
  ended: boolean;
  playerAlive: boolean;
}

export interface AttackOptions {
  part?: BodyPart;
  weapon?: WeaponSpec;
  /** Tryb ataku (0 podstawowy, 1 drugi); domyslnie 0. */
  mode?: AttackMode;
}

export class CombatSession {
  readonly events: CombatEvent[] = [];
  private order: Combatant[];
  private idx = 0;
  ended = false;
  playerAlive = true;
  private readonly rng: Rng;

  constructor(
    participants: readonly Omit<Combatant, 'ap'>[],
    private readonly resolve: AttackResolver,
    private readonly distance: (a: number, b: number) => number = (a, b) => Math.abs(a - b),
    private readonly env: CombatEnv = {},
  ) {
    this.rng = env.rng ?? createRng(1);
    this.order = turnOrder(participants.map((p) => ({ ...p, ap: 0 })));
    if (env.request) this.applyRequest(env.request);
    this.beginTurn();
  }

  private applyRequest(req: { attacker: number; defender: number }): void {
    const att = this.order.find((c) => c.id === req.attacker);
    const def = this.order.find((c) => c.id === req.defender);
    if (!att || !def) return;
    for (const c of this.order) {
      let best: Combatant | undefined;
      for (const o of this.order)
        if (
          o.team !== c.team &&
          o.hp > 0 &&
          (!best || this.distance(c.hex, o.hex) < this.distance(c.hex, best.hex))
        )
          best = o;
      if (best) {
        c.whoHitMeId = best.id;
        c.whoHitMeTeam = best.team;
      }
    }
    att.whoHitMeId = def.id;
    att.whoHitMeTeam = def.team;
    def.whoHitMeId = att.id;
    def.whoHitMeTeam = att.team;
    this.order = [att, ...this.order.filter((c) => c !== att)];
  }

  /** Stan do zapisu (JSON-owalny). */
  snapshot(): CombatSessionSave {
    return {
      version: 1,
      order: this.order.map((c) => {
        const o: CombatantSave = { id: c.id, hp: c.hp, ap: c.ap, maxAp: c.maxAp, hex: c.hex };
        if (c.maxHp !== undefined) o.maxHp = c.maxHp;
        if (c.prone !== undefined) o.prone = c.prone;
        if (c.legFlags !== undefined) o.legFlags = c.legFlags;
        if (c.freeMove) o.freeMove = c.freeMove;
        if (c.whoHitMeTeam !== undefined) o.whoHitMeTeam = c.whoHitMeTeam;
        if (c.whoHitMeId !== undefined) o.whoHitMeId = c.whoHitMeId;
        return o;
      }),
      idx: this.idx,
      ended: this.ended,
      playerAlive: this.playerAlive,
    };
  }

  /**
   * Nakłada zapis na sesje zbudowana z tych samych uczestnikow (po id): przywraca kolejnosc, indeks tury i
   * dynamiczne pola. Uczestnicy spoza zapisu zostaja na koncu; zapisani bez odpowiednika sa pomijani.
   */
  restore(s: CombatSessionSave): void {
    if (s.version !== 1) throw new Error('CombatSession: nieznana wersja zapisu');
    const byId = new Map(this.order.map((c) => [c.id, c]));
    const next: Combatant[] = [];
    for (const sv of s.order) {
      const c = byId.get(sv.id);
      if (!c) continue;
      byId.delete(sv.id);
      c.hp = sv.hp;
      c.ap = sv.ap;
      c.maxAp = sv.maxAp;
      c.hex = sv.hex;
      if (sv.maxHp !== undefined) c.maxHp = sv.maxHp;
      if (sv.prone !== undefined) c.prone = sv.prone;
      if (sv.legFlags !== undefined) c.legFlags = sv.legFlags;
      c.freeMove = sv.freeMove ?? 0;
      if (sv.whoHitMeTeam !== undefined) c.whoHitMeTeam = sv.whoHitMeTeam;
      if (sv.whoHitMeId !== undefined) c.whoHitMeId = sv.whoHitMeId;
      next.push(c);
    }
    this.order = [...next, ...byId.values()];
    this.idx = Math.min(Math.max(0, s.idx), Math.max(0, this.order.length - 1));
    this.ended = s.ended;
    this.playerAlive = s.playerAlive;
    this.events.length = 0;
  }

  get all(): readonly Combatant[] {
    return this.order;
  }
  get current(): Combatant {
    return this.order[this.idx] as Combatant;
  }
  private alive(): Combatant[] {
    return this.order.filter((c) => c.hp > 0);
  }

  weaponOf(c: Combatant): WeaponSpec {
    return c.weapons?.[0] ?? FISTS;
  }

  dist(a: Combatant, b: Combatant): number {
    return this.distance(a.hex, b.hex);
  }

  /** Czy atakujacy moze celowac w czesc ciala: Fast Shot (atut 7) odbiera celowane strzaly bronia dystansowa (zasieg > 2). */
  canAim(a: Combatant, w: WeaponSpec): boolean {
    return !((a.traits?.includes(Trait.FastShot) ?? false) && w.range > 2);
  }

  /** Koszt AP ataku w tej konfiguracji (item_w_ap_cost 0x478b24 z @f2/rules; celowanie +1). */
  attackCost(w: WeaponSpec, part: BodyPart, attacker?: Combatant, mode: AttackMode = 0): number {
    return attackApCost({
      mode: w.pid === FISTS.pid ? 1 : mode,
      hasWeapon: w.pid !== FISTS.pid,
      protoPrimaryAp: w.apCost,
      protoSecondaryAp: w.apCost2 ?? w.apCost,
      isPlayer: attacker?.isPlayer ?? false,
      fastShot: attacker?.traits?.includes(Trait.FastShot) ?? false,
      perk1: attacker?.perks?.[Perk.BonusHtHAttacks] ?? 0,
      perk5: attacker?.perks?.[Perk.BonusRateOfFire] ?? 0,
      weaponRange: w.range,
      weaponClass: w.cls,
      aimed: part !== BodyPart.Uncalled,
    });
  }

  /**
   * Pobranie AP za czynnosc poza atakiem i ruchem (uzycie chemii, D: AI 2 AP). false = za malo AP
   * albo to nie jest tura uczestnika.
   */
  spendAp(id: number, cost: number): boolean {
    const c = this.current;
    if (this.ended || c.id !== id || c.hp <= 0 || c.ap < cost) return false;
    c.ap -= cost;
    return true;
  }

  private beginTurn(): void {
    const c = this.current;
    c.ap = apAtTurnStart(c.maxAp);
    // D (0x425fbc): powalony wstaje na poczatku swojej tury kosztem 3 AP (gracz z Quick Recovery 1 AP)
    if (c.prone) {
      c.ap = standUp(c.ap, c.isPlayer, c.perks?.[Perk.QuickRecovery] ?? 0);
      c.prone = false;
    }
    // D (0x42299c): tylko gracz dostaje darmowe punkty ruchu = 2 * ranga Bonus Move
    c.freeMove = c.isPlayer ? freeMoveAp(c.perks?.[FREE_MOVE_PERK] ?? 0) : 0;
    this.events.push({ kind: 'turn', id: c.id });
  }

  /** Czy walka powinna sie zakonczyc (przeciwnicy martwi albo gracz padl). */
  private checkEnd(): boolean {
    const players = this.order.filter((c) => c.isPlayer);
    const playerPresent = players.some((p) => p.hp > 0);
    const live = this.alive();
    const team = players[0]?.team ?? 0;
    const done = combatShouldEnd({
      playerPresent,
      playerTeam: team,
      participants: live.map((c) => ({
        team: c.team,
        whoHitMeTeam: c.whoHitMeTeam,
      })),
    });
    if (done) {
      this.ended = true;
      this.playerAlive = playerPresent;
      this.events.push({ kind: 'end', playerAlive: playerPresent });
    }
    return done;
  }

  /**
   * terminate_combat (0x8153, 0x45ca84): konczy walke na zadanie skryptu. Exe ustawia flage 0x5186cc, a dla krytera
   * skryptu `maneuver |= 2`, whoHitMe = 0, ostatni cel = 0; tu: ten uczestnik zapomina napastnika, a walka konczy sie
   * od razu (moment zamkniecia petli tur w exe = Z). Bez efektu, gdy walka juz sie skonczyla.
   */
  terminate(selfId?: number): void {
    if (this.ended) return;
    const me = this.order.find((c) => c.id === selfId);
    if (me) {
      delete me.whoHitMeId;
      delete me.whoHitMeTeam;
    }
    const playerPresent = this.order.some((c) => c.isPlayer && c.hp > 0);
    this.ended = true;
    this.playerAlive = playerPresent;
    this.events.push({ kind: 'end', playerAlive: playerPresent });
  }

  /** Sciezka (bez startu) do heksa wg env.path albo prostej linii. */
  pathTo(c: Combatant, hex: number): number[] | null {
    return this.pathOf(c, hex);
  }

  private pathOf(c: Combatant, hex: number): number[] | null {
    if (this.env.path) return this.env.path(c, hex);
    const out: number[] = [];
    let h = c.hex;
    while (h !== hex) {
      h += Math.sign(hex - h);
      out.push(h);
    }
    return out;
  }

  /** Ruch po sciezce do `hex`; koszt wg moveStepCost (0x42e62c, flagi nog). Bez czesciowego ruchu. */
  move(id: number, hex: number): boolean {
    const c = this.current;
    if (this.ended || c.id !== id || hex === c.hex) return false;
    const path = this.pathOf(c, hex);
    if (!path || path.length === 0) return false;
    return this.walk(c, path);
  }

  private walk(c: Combatant, path: number[]): boolean {
    const cost = moveStepCost(true, c.legFlags ?? 0, path.length);
    const free = c.freeMove ?? 0;
    if (cost <= 0 || cost > c.ap + free) return false;
    const left = spendMoveAp(free, c.ap, cost);
    c.freeMove = left.free;
    c.ap = left.ap;
    c.hex = path[path.length - 1] as number;
    this.env.onMove?.(c, path);
    this.events.push({ kind: 'move', id: c.id, hex: c.hex });
    return true;
  }

  private die(t: Combatant, a: Combatant, w: WeaponSpec, damage: number): void {
    const anim = selectDeathAnim({
      attackerIsPlayer: a.isPlayer,
      bloodyMess: a.isPlayer && (a.traits?.includes(Trait.BloodyMess) ?? false),
      pyromaniac: (a.perks?.[DEATH_PYROMANIAC_PERK] ?? 0) > 0,
      victimSkipsDeathAnim: ((t.critterFlags ?? 0) & CRITTER_FLAG_SPECIAL_DEATH) !== 0,
      weaponPid: w.pid,
      weaponKind43: w.weaponPerk === 0x43,
      damageType: w.damageType,
      violence: 3,
      attackAnim: w.attackAnim ?? (w.range > 1 ? 0x10 : 0x2d),
      damage,
      fallingBack: true,
      probeAnim: (x) => x,
    });
    this.events.push({ kind: 'death', id: t.id, anim: anim.anim });
  }

  private applyHit(
    t: Combatant,
    a: Combatant,
    w: WeaponSpec,
    damage: number,
    knockedDown = false,
  ): void {
    const was = t.hp;
    t.hp = Math.max(0, t.hp - damage);
    if (knockedDown && t.hp > 0) t.prone = true;
    t.whoHitMeTeam = a.team;
    t.whoHitMeId = a.id;
    if (was > 0 && t.hp <= 0) this.die(t, a, w, damage);
  }

  attack(attackerId: number, targetId: number, opts: AttackOptions = {}): AttackOutcome | null {
    const a = this.current;
    const t = this.order.find((c) => c.id === targetId);
    if (this.ended || a.id !== attackerId || !t || t.hp <= 0 || t.team === a.team) return null;
    const base = opts.weapon ?? this.weaponOf(a);
    const mode: AttackMode = opts.mode === 1 && base.secondary ? 1 : 0;
    const w = weaponInMode(base, mode);
    const part = this.canAim(a, w) ? (opts.part ?? BodyPart.Uncalled) : BodyPart.Uncalled;
    const distance = this.dist(a, t);
    if (distance > w.range) return null;
    // D (0x478874): Solar Scorcher strzela tylko przy swietle otoczenia > 0xf333
    if (w.pid === SOLAR_SCORCHER_PID) {
      const light = this.env.ambientLight?.();
      if (light !== undefined && !solarScorcherReady(light)) return null;
    }
    const cost = this.attackCost(w, part, a, mode);
    if (a.ap < cost) return null;
    a.ap -= cost;
    const extras: { id: number; hits: number }[] = [];
    const burstSpread =
      w.burst > 1 && this.env.burstSpread
        ? (chance: number, rng: Rng): number =>
            (this.env.burstSpread as NonNullable<CombatEnv['burstSpread']>)(
              a,
              t,
              w,
              chance,
              rng,
              extras,
            )
        : undefined;
    const out = this.resolve(a, t, {
      part,
      weapon: w,
      distance,
      ...(burstSpread ? { burstSpread } : {}),
    });
    if (out.hit) this.applyHit(t, a, w, out.damage, out.knockedDown ?? false);
    this.events.push({
      kind: 'attack',
      attacker: a.id,
      target: t.id,
      hit: out.hit,
      damage: out.damage,
      part,
      damageType: w.damageType,
      ...(a.female ? { attackerFemale: true } : {}),
      ...(t.female ? { targetFemale: true } : {}),
      ...(out.knockedDown ? { knockedDown: true } : {}),
      ...(out.critical ? { critical: true } : {}),
      ...(out.critMiss !== undefined ? { critMiss: true } : {}),
    });
    this.burstExtras(a, w, extras);
    if (w.explosive) this.splash(a, t, w);
    this.checkEnd();
    return out;
  }

  /** Trafienia innych krytterow na liniach serii (0x423488): obrazenia bez rzutu, osobne zdarzenie ataku. */
  private burstExtras(
    a: Combatant,
    w: WeaponSpec,
    extras: readonly { id: number; hits: number }[],
  ): void {
    for (const ex of extras) {
      const v = this.order.find((c) => c.id === ex.id);
      if (!v || v.hp <= 0 || v === a) continue;
      const o = this.resolve(a, v, {
        part: BodyPart.Torso,
        weapon: w,
        distance: this.dist(a, v),
        forcedHits: ex.hits,
      });
      if (o.hit) this.applyHit(v, a, w, o.damage);
      this.events.push({
        kind: 'attack',
        attacker: a.id,
        target: v.id,
        hit: o.hit,
        damage: o.damage,
        part: BodyPart.Torso,
        damageType: w.damageType,
        ...(a.female ? { attackerFemale: true } : {}),
        ...(v.female ? { targetFemale: true } : {}),
      });
    }
  }

  /**
   * Dodatkowe cele eksplozji (0x423c10, D): pierscienie 1..3 wokol celu w kolejnosci `explosionRingTiles`,
   * pierwszy kryter na kaflu, limit 6. Bez `env.neighbor` zostaje stare przyblizenie (promien 1, kolejnosc tury).
   */
  private splash(a: Combatant, center: Combatant, w: WeaponSpec): void {
    let extras: number[] = [];
    const eligible = (c: Combatant): boolean =>
      c !== center &&
      isExplosionVictimEligible({
        isCritter: true,
        dead: c.hp <= 0,
        hidden: false,
        blocked: false,
      });
    if (this.env.neighbor) {
      for (const tile of explosionRingTiles(center.hex, EXPLOSION_MAX_RADIUS, this.env.neighbor)) {
        for (const c of this.order)
          if (c.hex === tile && eligible(c)) extras = addExplosionExtra(extras, c.id);
      }
    } else {
      for (const c of this.order) {
        if (eligible(c) && this.distance(c.hex, center.hex) <= 1)
          extras = addExplosionExtra(extras, c.id);
      }
    }
    for (const id of extras) {
      const v = this.order.find((c) => c.id === id) as Combatant;
      const o = this.resolve(a, v, { part: BodyPart.Torso, weapon: w, distance: 1, splash: true });
      if (o.hit) this.applyHit(v, a, w, o.damage);
      this.events.push({
        kind: 'attack',
        attacker: a.id,
        target: v.id,
        hit: o.hit,
        damage: o.damage,
        splash: true,
        damageType: w.damageType,
        ...(a.female ? { attackerFemale: true } : {}),
        ...(v.female ? { targetFemale: true } : {}),
      });
    }
  }

  endTurn(): void {
    if (this.ended) return;
    this.current.freeMove = 0;
    for (let n = 0; n < this.order.length; n++) {
      this.idx = (this.idx + 1) % this.order.length;
      if (this.current.hp > 0) break;
    }
    this.beginTurn();
  }

  /** AI wybiera bron z puli (chooseBestWeapon wg best_weapon z AI.TXT); jedna bron = ta bron. */
  private aiWeapon(me: Combatant): WeaponSpec {
    const ws = me.weapons ?? [];
    if (ws.length === 0) return FISTS;
    if (ws.length < 2 && !me.ai) return ws[0] as WeaponSpec;
    const cand = (w: WeaponSpec): WeaponCandidate & { w: WeaponSpec } => ({
      w,
      cls: w.cls,
      damage: Math.abs(w.maxDmg - w.minDmg) / 2,
      cost: w.apCost,
      pid: w.pid,
    });
    const pick = chooseBestWeapon(
      me.aiBestWeapon ?? me.ai?.bestWeapon ?? -1,
      cand(ws[0] as WeaponSpec),
      // D 0x4299a0: przeglad ekwipunku (kandydat B) tylko dla body_type 0/2 albo Dogmeata
      ws[1] && aiMayPickInventoryWeapon(me.bodyType ?? 0, me.pid ?? 0) ? cand(ws[1]) : null,
      () => this.rng.int(1, 100),
      { unarmedInRange: true },
    ) as (WeaponCandidate & { w: WeaponSpec }) | null;
    return pick?.w ?? FISTS;
  }

  private rand100 = (): number => this.rng.int(1, 100);

  /** Taunt NPC z pakietu AI (combatai.msg); zdarzenie `taunt` niesie numer wiersza. */
  private taunt(c: Combatant, kind: AiMsgKind): void {
    if (!c.ai || c.isPlayer || c.hp <= 0) return;
    const id = tauntMsgId(c.ai, kind, this.rand100, (lo, hi) => this.rng.int(lo, hi));
    if (id !== null) this.events.push({ kind: 'taunt', id: c.id, msgId: id });
  }

  private static readonly HIT_KIND: Record<number, AiMsgKind> = {
    [BodyPart.Head]: 'hitHead',
    [BodyPart.LeftArm]: 'hitLeftArm',
    [BodyPart.RightArm]: 'hitRightArm',
    [BodyPart.Torso]: 'hitTorso',
    [BodyPart.RightLeg]: 'hitRightLeg',
    [BodyPart.LeftLeg]: 'hitLeftLeg',
    [BodyPart.Eyes]: 'hitEyes',
    [BodyPart.Groin]: 'hitGroin',
    [BodyPart.Uncalled]: 'hitTorso',
  };

  /** Atak AI: taunt atakujacego, wynik, reakcja ofiary (miss albo trafienie w czesc ciala). */
  private aiAttack(me: Combatant, foe: Combatant, w: WeaponSpec, mode: AttackMode = 0): boolean {
    this.taunt(me, 'attack');
    const out = this.attack(me.id, foe.id, { weapon: w, mode });
    if (!out) return false;
    if (!out.hit) this.taunt(foe, 'miss');
    else if (foe.hp > 0)
      this.taunt(foe, CombatSession.HIT_KIND[out.part ?? BodyPart.Torso] ?? 'hitTorso');
    return true;
  }

  /** Ucieczka: ruch od najblizszego wroga na tyle heksow, na ile starcza AP. */
  private flee(me: Combatant, from: Combatant): boolean {
    let path: number[] | null;
    if (this.env.flee) path = this.env.flee(me, from, me.ap);
    else {
      path = [];
      let h = me.hex;
      const dir = me.hex >= from.hex ? 1 : -1;
      for (let i = 0; i < me.ap; i++) {
        h += dir;
        path.push(h);
      }
    }
    if (!path || path.length === 0) return false;
    this.events.push({ kind: 'flee', id: me.id });
    this.taunt(me, 'run');
    return this.walk(me, path.slice(0, me.ap));
  }

  /** Tura AI wg pakietu z AI.TXT (ucieczka, cel `attack_who`, `distance`, `min_to_hit`, bron obszarowa, taunty). */
  autoTurn(): void {
    const me = this.current;
    if (this.ended || me.isPlayer) return;
    const ai = me.ai;
    const live = this.alive().filter((c) => c.team !== me.team);
    let foe: Combatant | undefined;
    if (ai) {
      const t = chooseTarget(
        ai,
        live.map((c) => ({ id: c.id, hp: c.hp, distance: this.dist(me, c) })),
        me.whoHitMeId,
        (n) => this.rng.int(0, n - 1),
      );
      foe = t ? live.find((c) => c.id === t.id) : undefined;
      if (
        this.env.useHealingChem &&
        chemShouldHeal(ai.chemUse, me.hp, me.maxHp ?? me.hp, me.ap) &&
        this.env.useHealingChem(me)
      ) {
        this.spendAp(me.id, 2);
      }
      const nearest = [...live].sort((x, y) => this.dist(me, x) - this.dist(me, y))[0];
      if (nearest && shouldFlee(ai, { hp: me.hp, maxHp: me.maxHp ?? me.hp })) {
        // przyparty do muru (brak ruchu) walczy dalej
        if (this.flee(me, nearest)) {
          this.endTurn();
          return;
        }
      }
    } else {
      live.sort((x, y) => this.dist(me, x) - this.dist(me, y));
      foe = live[0];
    }
    let w = this.aiWeapon(me);
    let mode: AttackMode = 0;
    if (ai && w.secondary && foe) {
      // 0x429db4: wybor trybu glownego (2) / wtornego (3) po fladze obszaru i preferencji klasy (D: tablica 0x518158, 0x42938c)
      const sec = w.secondary;
      const choice = aiSecondaryModeChoice({
        hasWeapon: true,
        isWeaponType: true,
        classOfSecondary: sec.cls,
        usable: true,
        areaFlag: ai.areaMode !== 'always' || sec.burst > 1 || !!sec.explosive,
        classPreferred: classPreferred(me.aiBestWeapon ?? ai.bestWeapon ?? -1, sec.cls),
      });
      if (choice === 3 && this.areaAllowed(me, foe, weaponInMode(w, 1), ai)) mode = 1;
    }
    if (ai && foe) {
      const wm = weaponInMode(w, mode);
      if (wm.explosive && !this.areaAllowed(me, foe, wm, ai)) {
        const alt = (me.weapons ?? []).find((x) => !x.explosive);
        if (mode === 1 && w.secondary && !w.explosive) mode = 0;
        else {
          w = alt ?? FISTS;
          mode = 0;
        }
      } else if (wm.burst > 1 && this.allyBlocked(me, foe, wm)) {
        // sojusznik na torze serii: tryb jednostrzalowy, gdy jest (0x4293bc: skipTable)
        if (mode === 1 && w.burst <= 1) mode = 0;
        else if (mode === 0 && w.secondary && w.secondary.burst <= 1) mode = 1;
      }
    }
    let guard = 0;
    let announced = false;
    while (foe && !this.ended && foe.hp > 0 && guard++ < 40) {
      // 0x42a61e (D): gdy zaden tryb nie przechodzi, koszt AP trybu (0x478b24) > biezace AP => -1, AI rezygnuje
      // z ataku; brak cofania do trybu 1 (0x42ad91 to porownanie szansy trafienia z min_to_hit, nie test AP)
      const wm = weaponInMode(w, mode);
      const d = this.dist(me, foe);
      const inRange = d <= wm.range;
      const chanceOk =
        !ai ||
        !this.env.hitChance ||
        !inRange ||
        acceptableToHit(ai, this.env.hitChance(me, foe, wm, d));
      if (!inRange || (!chanceOk && d > 1)) {
        if (ai && !mayApproach(ai, me.whoHitMeId !== undefined, d, wm.range)) break;
        if (!announced) {
          this.taunt(me, 'move');
          announced = true;
        }
        if (!this.approach(me, foe, wm)) break;
      } else if (!chanceOk) break;
      else if (!this.aiAttack(me, foe, w, mode)) break;
    }
    this.endTurn();
  }

  /** 0x4213e8 dla ataku `me` -> `foe` bronia `w`: true = sojusznik oberwie (blokada). */
  private allyBlocked(me: Combatant, foe: Combatant, w: WeaponSpec): boolean {
    const radius = w.explosive ? 1 : 0;
    const damageType = w.damageType;
    const res = allyFireCheck({
      attackerId: me.id,
      attackerPid: me.pid ?? 0,
      attackerTeam: me.team,
      intelligence: me.special?.[4] ?? 5,
      targetId: foe.id,
      radius,
      attackAnim: w.burst > 1 ? ANIM_FIRE_BURST : 0,
      maxDamage: w.maxDmg,
      damageType,
      critters: this.all.map((c) => ({
        id: c.id,
        team: c.team,
        dead: c.hp <= 0,
        whoHitMeId: c.whoHitMeId,
        dt: (t: number) => c.dt?.[t] ?? 0,
        dr: (t: number) => c.dr?.[t] ?? 100,
      })),
      distance: (a, b) => {
        const x = this.all.find((c) => c.id === a);
        const y = this.all.find((c) => c.id === b);
        return x && y ? this.distance(x.hex, y.hex) : 99;
      },
      ...(this.env.burstVictims
        ? { burstVictims: () => this.env.burstVictims?.(me, foe, w) ?? [] }
        : {}),
    });
    return res.result === 1;
  }

  /** Bron obszarowa wg area_attack_mode, z kontrola sojusznikow 0x4213e8 (friendsInBlast = wynik kontroli). */
  private areaAllowed(me: Combatant, foe: Combatant, w: WeaponSpec, ai: AiPacket): boolean {
    return mayUseAreaWeapon(
      ai,
      {
        friendsInBlast: w.explosive && this.allyBlocked(me, foe, w) ? 1 : 0,
        toHit: this.env.hitChance?.(me, foe, w, this.dist(me, foe)),
        targetDistance: this.dist(me, foe),
        intelligence: me.special?.[4],
      },
      (lo, hi) => this.rng.int(lo, hi),
    );
  }

  /** Podchodzi do `foe` az na zasieg `w` (w granicach AP). */
  private approach(me: Combatant, foe: Combatant, w: WeaponSpec): boolean {
    const full = this.pathOf(me, foe.hex);
    if (!full || full.length < 2) return false;
    // ostatni heks sciezki to heks celu (zajety)
    const steps = full.slice(0, -1);
    let upto = steps.findIndex((h) => this.distance(h, foe.hex) <= w.range);
    upto = upto < 0 ? steps.length : upto + 1;
    const n = Math.min(upto, me.ap);
    if (n <= 0) return false;
    return this.walk(me, steps.slice(0, n));
  }
}
