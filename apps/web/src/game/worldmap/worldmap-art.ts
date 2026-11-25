import type { ArtFrame } from '../../screens/map/map-screen';

/** Grafika z gry zamieniona na zrodlo dla canvas (tylko w pamieci przegladarki, nic nie trafia do repo). */
export interface ArtImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

export interface WorldmapArt {
  /** WRLDMP00..19 (350x300), indeks kafla wiersz po wierszu. */
  tiles: (ArtImage | null)[];
  /** WRLDSPR0/1/2: kola miast Small/Medium/Large. */
  city: Record<'Small' | 'Medium' | 'Large', ArtImage | null>;
  /** WMAPTARG: znacznik celu. */
  target: ArtImage | null;
  /** WMAPLOC: znacznik pozycji gracza. */
  loc: ArtImage | null;
  /** WMCARMVE: klatki animacji samochodu (93x73). */
  car: ArtImage[];
  /** WMAPBOX: ramka ekranu 640x480 (okno widoku jest w niej przezroczyste). */
  frame?: ArtImage | null;
  /** WMDIAL: 24 klatki tarczy czasu (godzina doby). */
  dial?: ArtImage[];
  /** WMGLOBE: tablica/glob obok tarczy. */
  globe?: ArtImage | null;
  /** WM_*: etykiety miast (klucz = indeks obszaru z city.txt, wg townmap_label_art_idx). */
  labels?: Map<number, ArtImage>;
  /** WMSCREEN (117x95): nakladka panelu samochodu na (499,330), rysowana przezroczyscie nad WMCARMVE. */
  screen?: ArtImage | null;
  /** Kolory miernika paliwa (indeksy palety 0x0e i 0xc4 jako 'rgb(r,g,b)'); bez nich kolory domyslne. */
  gaugeColors?: { empty: string; full: string };
  /**
   * Ikony spotkan: WMRNDEN2/3 (znacznik spotkania) i WMAPFGT0/1 (walka). `icons` = tablica z exe
   * [WMAPFGT1, WMAPFGT0, WMRNDEN2, WMRNDEN3] (indeks = numer klatki migania, D 0x4c41ec).
   */
  encounter?: { rnd: ArtImage[]; fgt: ArtImage[]; icons?: (ArtImage | null)[] };
  /** TWNxxx: mapa miasta/obszaru (townmap_art_idx), ladowana leniwie i cache'owana; null = brak pliku. */
  townmap?: (areaIndex: number) => Promise<ArtImage | null>;
}

/** Fragment AreaDef potrzebny do grafik (obszary z city.txt). */
export interface ArtArea {
  townmapArtIdx: number;
  townmapLabelArtIdx: number;
}

export interface WorldmapArtOptions {
  doc?: Document;
  /** Odczyt tekstu z gry (np. art/intrface/intrface.lst); bez niego nie ma etykiet i map miast. */
  readText?: (path: string) => Promise<string>;
  areas?: readonly ArtArea[];
  /** Kolor palety gry (indeks 0..255) jako [r,g,b]; do miernika paliwa. */
  paletteColor?: (index: number) => readonly [number, number, number];
}

/** intrface.lst: indeks FID -> nazwa pliku (pierwszy token linii, komentarz po ';'). -1/poza zakresem = undefined. */
export function lstName(lst: readonly string[], idx: number): string | undefined {
  if (!Number.isInteger(idx) || idx < 0) return undefined;
  const name = lst[idx]?.split(';')[0]?.trim().split(/\s+/)[0];
  return name ? name.toLowerCase() : undefined;
}

export const parseLst = (text: string): string[] => text.split(/\r?\n/);

export type ArtLoader = (path: string) => Promise<ArtFrame[] | null>;

export function frameToImage(f: ArtFrame, doc: Document = document): ArtImage | null {
  const cv = doc.createElement('canvas');
  cv.width = f.width;
  cv.height = f.height;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const data = new ImageData(new Uint8ClampedArray(f.rgba), f.width, f.height);
  ctx.putImageData(data, 0, 0);
  return { width: f.width, height: f.height, source: cv };
}

const ART_DIR = 'art/intrface/';
/** Indeksy palety miernika paliwa (D 0x4c3c10): pusty 0x0e, pelny 0xc4. */
const GAUGE_EMPTY_IDX = 0x0e;
const GAUGE_FULL_IDX = 0xc4;

/** Laduje grafiki mapy swiata; brakujace pliki daja null/puste (widok wraca do kolorow). */
export async function loadWorldmapArt(
  load: ArtLoader,
  docOrOpts?: Document | WorldmapArtOptions,
): Promise<WorldmapArt> {
  const opts: WorldmapArtOptions =
    docOrOpts && 'createElement' in docOrOpts ? { doc: docOrOpts } : (docOrOpts ?? {});
  const doc = opts.doc;
  const one = async (name: string): Promise<ArtImage | null> => {
    const fr = (await load(`${ART_DIR}${name}.frm`).catch(() => null)) ?? [];
    return fr[0] ? frameToImage(fr[0], doc) : null;
  };
  const tiles = await Promise.all(
    Array.from({ length: 20 }, (_, i) => one(`wrldmp${String(i).padStart(2, '0')}`)),
  );
  const [small, medium, large, target, loc] = await Promise.all(
    ['wrldspr0', 'wrldspr1', 'wrldspr2', 'wmaptarg', 'wmaploc'].map(one),
  );
  const carFrames = (await load(`${ART_DIR}wmcarmve.frm`).catch(() => null)) ?? [];
  const car = carFrames.map((f) => frameToImage(f, doc)).filter((x): x is ArtImage => x !== null);
  const frames = async (name: string): Promise<ArtImage[]> =>
    ((await load(`${ART_DIR}${name}.frm`).catch(() => null)) ?? [])
      .map((f) => frameToImage(f, doc))
      .filter((x): x is ArtImage => x !== null);
  const [frame, globe, screen, dial, rnd2, rnd3, fgt0, fgt1] = await Promise.all([
    one('wmapbox'),
    one('wmglobe'),
    one('wmscreen'),
    frames('wmdial'),
    one('wmrnden2'),
    one('wmrnden3'),
    one('wmapfgt0'),
    one('wmapfgt1'),
  ]);
  const nn = (xs: (ArtImage | null)[]): ArtImage[] => xs.filter((x): x is ArtImage => x !== null);
  const labels = new Map<number, ArtImage>();
  let townmap: WorldmapArt['townmap'];
  if (opts.readText && opts.areas) {
    const lst = parseLst(await opts.readText(`${ART_DIR}intrface.lst`).catch(() => ''));
    const areas = opts.areas;
    await Promise.all(
      areas.map(async (a, i) => {
        const n = lstName(lst, a.townmapLabelArtIdx);
        const img = n ? await one(n.replace(/\.frm$/, '')) : null;
        if (img) labels.set(i, img);
      }),
    );
    const cache = new Map<number, Promise<ArtImage | null>>();
    townmap = (i) => {
      let p = cache.get(i);
      if (!p) {
        const a = areas[i];
        const n = a ? lstName(lst, a.townmapArtIdx) : undefined;
        p = n ? one(n.replace(/\.frm$/, '')) : Promise.resolve(null);
        cache.set(i, p);
      }
      return p;
    };
  }
  return {
    frame,
    globe,
    dial,
    labels,
    screen,
    ...(opts.paletteColor
      ? {
          gaugeColors: {
            empty: `rgb(${opts.paletteColor(GAUGE_EMPTY_IDX).join(',')})`,
            full: `rgb(${opts.paletteColor(GAUGE_FULL_IDX).join(',')})`,
          },
        }
      : {}),
    encounter: { rnd: nn([rnd2, rnd3]), fgt: nn([fgt0, fgt1]), icons: [fgt1, fgt0, rnd2, rnd3] },
    ...(townmap ? { townmap } : {}),
    tiles,
    city: { Small: small ?? null, Medium: medium ?? null, Large: large ?? null },
    target: target ?? null,
    loc: loc ?? null,
    car,
  };
}
