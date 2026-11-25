/**
 * Animacje krytterow: kody animacji, nazwy plikow FRM (R2, f2_critter_anim_chars 0x419314, D)
 * i odtwarzanie klipow (czas z fps naglowka FRM, klatka akcji). Nazwy kodow 0..47 i 64 sa
 * zgodne z konwencja skryptow (ANIM_*); 48..63 to animacje smierci SF (pliki R*), nazwy Z.
 */
export const Anim = {
  Stand: 0,
  Walk: 1,
  JumpBegin: 2,
  JumpEnd: 3,
  ClimbLadder: 4,
  Falling: 5,
  UpStairsRight: 6,
  UpStairsLeft: 7,
  DownStairsRight: 8,
  DownStairsLeft: 9,
  MagicHandsGround: 10,
  MagicHandsMiddle: 11,
  MagicHandsUp: 12,
  Dodge: 13,
  HitFromFront: 14,
  HitFromBack: 15,
  ThrowPunch: 16,
  KickLeg: 17,
  Throw: 18,
  Running: 19,
  FallBack: 20,
  FallFront: 21,
  BadLanding: 22,
  BigHole: 23,
  CharredBody: 24,
  ChunksOfFlesh: 25,
  DancingAutofire: 26,
  Electrify: 27,
  SlicedInHalf: 28,
  BurnedToNothing: 29,
  ElectrifiedToNothing: 30,
  ExplodedToNothing: 31,
  MeltedToNothing: 32,
  FireDance: 33,
  FallBackBlood: 34,
  FallFrontBlood: 35,
  ProneToStanding: 36,
  BackToStanding: 37,
  TakeOut: 38,
  PutAway: 39,
  Parry: 40,
  Thrust: 41,
  Swing: 42,
  Point: 43,
  Unpoint: 44,
  FireSingle: 45,
  FireBurst: 46,
  FireContinuous: 47,
  /** Pierwsza animacja smierci SF (pliki R*), 48..63 (Z: nazwy). */
  SfDeathFirst: 48,
  SfDeathLast: 63,
  CalledShotPic: 64,
} as const;

export const ANIM_MAX = 64;

/** Maks. kod broni w nazwie pliku (0 = bez broni, 1..10 = klasy broni). */
export const WEAPON_CODE_MAX = 10;

const A = 'a'.charCodeAt(0);

/**
 * Dwa znaki nazwy pliku `<baza><znaki>.frm` dla animacji `anim` i kodu broni `weapon` (0..10);
 * undefined gdy kombinacja jest niepoprawna (jak 0xffffffff w exe): bron poza 0..10, albo
 * animacje 38..47 (wyjmowanie, strzaly) bez broni.
 * Kolejnosc if-ow wg dekompilacji (EBX = pierwszy znak, ECX = drugi).
 */
export function animFileChars(anim: number, weapon: number): string | undefined {
  if (!Number.isInteger(anim) || !Number.isInteger(weapon) || weapon < 0 || weapon > 10) {
    return undefined;
  }
  const ch = String.fromCharCode;
  if (anim > 0x25 && anim < 0x30) {
    if (weapon === 0) return undefined;
    return ch('c'.charCodeAt(0) + weapon) + ch(anim + '='.charCodeAt(0));
  }
  if (anim === 0x24) return 'ch';
  if (anim === 0x25) return 'cj';
  if (anim === 0x40) return 'na';
  if (anim > 0x2f) return 'r' + ch(anim + '1'.charCodeAt(0));
  if (anim > 0x13) return 'b' + ch(anim + 'M'.charCodeAt(0));
  if (anim === 0x12) {
    if (weapon === 1) return 'dm';
    if (weapon === 4) return 'gm';
    return 'as';
  }
  if (anim === 0x0d) {
    return weapon > 0 ? ch('c'.charCodeAt(0) + weapon) + 'e' : 'an';
  }
  if (anim < 0 || anim > 0x13) return undefined;
  const second = ch(anim + A);
  if (anim < 2 && weapon > 0) return ch('c'.charCodeAt(0) + weapon) + second;
  return 'a' + second;
}

/** Animacje, ktore sa smiercia (krytter zostaje na ostatniej klatce). */
export function isDeathAnim(anim: number): boolean {
  return (
    (anim >= Anim.FallBack && anim <= Anim.FallFrontBlood && anim !== Anim.BadLanding) ||
    (anim >= Anim.SfDeathFirst && anim <= Anim.SfDeathLast)
  );
}

/** Animacje zapetlone (stoi, chod, bieg); reszta gra raz. */
export function isLoopingAnim(anim: number): boolean {
  return anim === Anim.Stand || anim === Anim.Walk || anim === Anim.Running;
}

export interface AnimClipInfo {
  /** Liczba klatek w kierunku. */
  frames: number;
  /** fps z naglowka FRM; 0 = domyslne 10 (Z). */
  fps: number;
  /** Klatka akcji (trafienie/strzal), 0-indeksowana. */
  actionFrame: number;
}

export const DEFAULT_FPS = 10;

/** Odtwarzacz jednego klipu: klatka zalezy od czasu; zdarzenie akcji odpala sie raz. */
export class ClipPlayer {
  private elapsed = 0;
  private actionDone = false;
  private readonly frameMs: number;

  constructor(
    readonly info: AnimClipInfo,
    readonly loop: boolean,
  ) {
    const fps = info.fps > 0 ? info.fps : DEFAULT_FPS;
    this.frameMs = 1000 / fps;
  }

  get frame(): number {
    const last = Math.max(0, this.info.frames - 1);
    const f = Math.floor(this.elapsed / this.frameMs);
    if (this.loop) return this.info.frames > 0 ? f % this.info.frames : 0;
    return Math.min(f, last);
  }

  /** Czas calego klipu w ms. */
  get durationMs(): number {
    return this.info.frames * this.frameMs;
  }

  get done(): boolean {
    return !this.loop && this.elapsed >= this.durationMs;
  }

  /** Przesuwa czas; zwraca true, jesli w tym kroku osiagnieto klatke akcji. */
  advance(dtMs: number): boolean {
    if (dtMs > 0) this.elapsed += dtMs;
    if (this.actionDone) return false;
    const reached = Math.floor(this.elapsed / this.frameMs) >= this.info.actionFrame;
    if (reached) this.actionDone = true;
    return reached && this.info.frames > 0;
  }
}

export interface AnimStep {
  anim: number;
  weapon?: number;
  /** Domyslnie wg isLoopingAnim. */
  loop?: boolean;
  /** Wolane w klatce akcji. */
  onAction?: () => void;
  /** Wolane po zakonczeniu klipu (nie dla zapetlonych). */
  onEnd?: () => void;
}

export interface AnimView {
  anim: number;
  weapon: number;
  frame: number;
}

interface Active {
  step: AnimStep;
  weapon: number;
  player: ClipPlayer;
}

/**
 * Animacje krytterow po id obiektu: kolejka klipow na krytter, po smierci ostatnia klatka
 * zostaje na stale (`hold`), po zwyklym klipie krytter wraca do stania (brak widoku).
 * `info(id, anim, weapon)` zwraca parametry klipu z FRM (undefined = brak pliku, klip pomijany).
 */
export class AnimDirector {
  private readonly active = new Map<number, Active>();
  private readonly queues = new Map<number, AnimStep[]>();
  private readonly held = new Map<number, AnimView>();

  constructor(
    private readonly info: (id: number, anim: number, weapon: number) => AnimClipInfo | undefined,
  ) {}

  /** Zastepuje biezaca animacje (i czysci kolejke i zatrzymana smierc). */
  play(id: number, step: AnimStep): void {
    this.queues.delete(id);
    this.held.delete(id);
    this.active.delete(id);
    this.start(id, step);
  }

  /** Dolacza klip na koniec kolejki (gra po biezacym). */
  queue(id: number, step: AnimStep): void {
    if (!this.active.has(id) && !this.held.has(id)) {
      this.start(id, step);
      return;
    }
    const q = this.queues.get(id) ?? [];
    q.push(step);
    this.queues.set(id, q);
  }

  /** Czysci wszystko dla krytera (np. wskrzeszenie, zmiana mapy). */
  clear(id: number): void {
    this.active.delete(id);
    this.queues.delete(id);
    this.held.delete(id);
  }

  clearAll(): void {
    this.active.clear();
    this.queues.clear();
    this.held.clear();
  }

  isBusy(id: number): boolean {
    return this.active.has(id);
  }

  /** Aktualna animacja do pokazania; undefined = krytter stoi (wybor sprite'a po stronie wywolujacego). */
  view(id: number): AnimView | undefined {
    const a = this.active.get(id);
    if (a) return { anim: a.step.anim, weapon: a.weapon, frame: a.player.frame };
    return this.held.get(id);
  }

  update(dtMs: number): void {
    for (const [id, a] of [...this.active]) {
      if (a.player.advance(dtMs)) a.step.onAction?.();
      if (!a.player.done) continue;
      this.active.delete(id);
      if (isDeathAnim(a.step.anim)) {
        this.held.set(id, {
          anim: a.step.anim,
          weapon: a.weapon,
          frame: Math.max(0, a.player.info.frames - 1),
        });
      }
      a.step.onEnd?.();
      if (this.active.has(id)) continue; // onEnd zagral cos nowego
      const q = this.queues.get(id);
      const next = q?.shift();
      if (q && q.length === 0) this.queues.delete(id);
      if (next) this.start(id, next);
    }
  }

  private start(id: number, step: AnimStep): void {
    const weapon = step.weapon ?? 0;
    const info = this.info(id, step.anim, weapon);
    if (!info || info.frames <= 0) {
      // brak pliku: pomin klip, ale odpal zdarzenia, zeby logika gry nie utknela
      step.onAction?.();
      step.onEnd?.();
      const next = this.queues.get(id)?.shift();
      if (next) this.start(id, next);
      return;
    }
    const loop = step.loop ?? isLoopingAnim(step.anim);
    this.active.set(id, { step, weapon, player: new ClipPlayer(info, loop) });
  }
}
