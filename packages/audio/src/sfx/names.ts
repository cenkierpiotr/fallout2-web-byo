/**
 * Generatory nazw efektow dzwiekowych sound/sfx/*.acm (spec: dokumentacja techniczna).
 * Reguly nazewnictwa pochodza z silnik gry (D); semantyka na poziomie skryptow bywa Z.
 */

export const sfxPath = (name: string): string => `sound/sfx/${name}.acm`.toLowerCase();

const A = (c: number): string => String.fromCharCode(c);

/** Litery (anim, bron) z funkcji 0x419314. null = brak dzwieku (exe zwraca -1). */
export function animLetters(anim: number, weapon: number): [string, string] | null {
  if (anim < 0 || weapon < 0 || weapon > 10) return null;
  if (anim >= 0x26 && anim <= 0x2f) return weapon === 0 ? null : [A(anim + 0x3d), A(weapon + 0x63)];
  if (anim === 0x24) return ['h', 'c'];
  if (anim === 0x25) return ['j', 'c'];
  if (anim === 0x40) return ['a', 'n'];
  if (anim >= 0x30) return [A(anim + 0x31), 'r'];
  if (anim >= 0x14) return [A(anim + 0x4d), 'b'];
  if (anim === 0x12) return weapon === 1 ? ['m', 'd'] : weapon === 4 ? ['m', 'g'] : ['s', 'a'];
  if (anim === 0x0d) return weapon > 0 ? ['e', A(weapon + 0x63)] : ['n', 'a'];
  return [A(0x61 + anim), anim <= 1 && weapon > 0 ? A(weapon + 0x63) : 'a'];
}

/** Nazwa efektu postaci: base(6 znakow z listy art krytera) + litera broni + litera animacji. */
export function charSfxName(base: string, anim: number, weapon: number, extra = 0): string | null {
  const w = anim === 0x26 ? extra : weapon;
  const l = animLetters(anim, w);
  if (!l) return null;
  const a = l[0];
  let wc = l[1];
  if ((anim === 0x14 || anim === 0x15) && extra === 2) wc = 'Y';
  else if ((anim === 0x14 || anim === 0x15) && extra === 3) wc = 'Z';
  else if ((anim === 0x10 || anim === 0x11) && extra === 4) wc = 'Z';
  return (base + wc + a).toUpperCase();
}

/**
 * Lancuch prob nazw (loader 0x451160..0x451430): nazwa, potem aliasy H?XXXX / MAMTNT.
 * gender: plec krytera ('M'|'F'), uzywana tylko dla prefiksu 'HA'/'NA'.
 */
export function resolveCharSfxCandidates(name: string, gender: 'M' | 'F'): string[] {
  const out = [name];
  const p = name[0];
  const g0 = name[1];
  if ((p === 'H' || p === 'N') && (g0 === 'A' || g0 === 'F' || g0 === 'M')) {
    const g = g0 === 'A' ? gender : g0;
    const tail = name.slice(6);
    out.push(`${p}${g}XXXX${tail}`);
    if (g === 'F') out.push(`${p}MXXXX${tail}`);
  } else if (name.startsWith('MALIEU') || name.startsWith('MAMTN2')) {
    out.push(`MAMTNT${name.slice(6)}`);
  }
  return out;
}

/** Tablica 0x518e60 (10 liter; indeksy 5..9 to druga tablica 0x518e65 `OCLNU`, czytana dalej w tym samym bloku, D). */
const WEAPON_ACTION = 'RAOFHOCLNU';
const ACT = 'OCLNU';

/** Material celu -> litera (D z 0x451760; mapowanie id materialu na nazwe Z). */
export function materialSfxChar(material: number): 'M' | 'W' | 'S' | 'F' {
  if (material >= 0 && material <= 2) return 'M';
  if (material === 3) return 'W';
  if (material >= 4 && material <= 6) return 'S';
  return 'F';
}

export interface WeaponSfxInput {
  /** Indeks akcji 0..9 -> R,A,O,F,H,O,C,L,N,U (znaczenie liter Z). */
  action: number;
  /** Bajt proto+0x64 broni jako znak; '' gdy brak broni. */
  weaponChar: string;
  hitMode: number;
  /** Material celu (tylko dla akcji H). */
  material?: number;
  /** Typ obrazen broni; 3, 5, 6 pomijaja material. */
  damageType?: number;
}

/** `W<akcja><bron><tryb><mat>XX1`; null gdy brak broni lub akcji. */
export function weaponSfxName(i: WeaponSfxInput): string | null {
  const action = WEAPON_ACTION[i.action];
  if (!action || !i.weaponChar) return null;
  // tylko dla indeksu 4 ('H') exe sprawdza material celu; liczy sie litera, nie indeks
  const mode =
    i.action === 0 || i.action === 2
      ? 1
      : i.hitMode === 0 || i.hitMode === 2 || i.hitMode === 4
        ? 1
        : 2;
  let mat = 'X';
  if (action === 'H' && i.material !== undefined && ![3, 5, 6].includes(i.damageType ?? -1)) {
    mat = materialSfxChar(i.material);
  }
  return `W${action}${i.weaponChar}${mode}${mat}XX1`.toUpperCase();
}

/** Drzwi/scenery: `S<akcja>DOORS<wariant>` (0x4518dc, typ 2). */
export function sceneryDoorName(act: number, variant = 'A'): string | null {
  const a = ACT[act];
  return a ? `S${a}DOORS${variant}` : null;
}
export const doorSfxName = sceneryDoorName;

/** Pojemniki: `I<akcja>CNTNR<wariant>` (0x4518dc, typ != 2). */
export function containerSfxName(act: number, variant: string): string | null {
  const a = ACT[act];
  return a ? `I${a}CNTNR${variant}` : null;
}

/** Scenery (0x451898): `S<A|P><O|C|L|N|U><nazwa 4 zn.>1`. */
export function scenerySfxName(passive: boolean, act: number, name4: string): string | null {
  const a = ACT[act];
  return a ? `S${passive ? 'P' : 'A'}${a}${name4.slice(0, 4).padEnd(4)}1`.toUpperCase() : null;
}

/** `A%6s1` i `N%6s1` (0x4516f0, 0x451718); Z: powiazanie ze skryptami. */
export const ambientSfxName = (name: string): string => `A${name.slice(0, 6)}1`.toUpperCase();
export const interfaceSfxName = (name: string): string => `N${name.slice(0, 6)}1`.toUpperCase();

const BUTTONS = ['ib1p1xx1', 'ib1lu1x1', 'toggle', 'ib2p1xx1', 'ib2lu1x1', 'ib3p1xx1', 'ib3lu1x1'];
/** Przyciski interfejsu (tablica 0x503e14, kolejnosc kodu 0..6; wybor Z). */
export const buttonSfxName = (i: number): string | null => BUTTONS[i] ?? null;

export interface SndListEntry {
  name: string;
  a: number;
  b: number;
  id: number;
}

/** sndlist.lst: linia 1 = liczba, potem 4 linie na wpis: NAZWA.ACM, a, b, id (znaczenie a,b: Z). */
export function parseSndList(text: string): SndListEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const count = Number(lines[0]);
  if (!Number.isInteger(count) || count < 0) throw new Error('sndlist: zly naglowek');
  if (lines.length < 1 + count * 4) throw new Error('sndlist: niepelny wpis');
  const out: SndListEntry[] = [];
  for (let i = 0; i < count; i++) {
    const o = 1 + i * 4;
    out.push({
      name: (lines[o] ?? '').replace(/\.acm$/i, ''),
      a: Number(lines[o + 1]),
      b: Number(lines[o + 2]),
      id: Number(lines[o + 3]),
    });
  }
  return out;
}

export interface AmbientSfx {
  name: string;
  chance: number;
}

/** `ambient_sfx=nazwa:szansa, ...` z maps.txt. Max 6 wpisow (exe 0x4bf678). Szansa jako waga: Z. */
export function parseAmbientSfx(value: string): AmbientSfx[] {
  const out: AmbientSfx[] = [];
  for (const part of value.split(',')) {
    const m = /^\s*([^\s:,]+)\s*:\s*(\d+)/.exec(part);
    if (m?.[1] && m[2]) out.push({ name: m[1], chance: Number(m[2]) });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Wybor efektu otoczenia mapy (Z: semantyka `chance` jako waga wzgledna; exe 0x452634 nie rozkodowane).
 * `rand` w [0,1). Pusta lista lub suma wag 0: undefined.
 */
export function pickAmbient(
  list: readonly AmbientSfx[],
  rand: () => number,
): AmbientSfx | undefined {
  const total = list.reduce((s, a) => s + a.chance, 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const a of list) {
    r -= a.chance;
    if (r < 0) return a;
  }
  return list[list.length - 1];
}
