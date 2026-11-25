import { useStageInfo } from './ArtStage';
import { useUiArt } from './context';
import './art.css';

/** Cyfry z arkusza (0-9 w poziomym pasie), pozostale znaki czcionka pikselowa. */
export function ArtDigits(props: {
  value: number | string;
  sheet: string;
  digitWidth: number;
  /**
   * Licznik o stalej liczbie komorek (jak w oryginale): komorka znaku + cyfry dopelnione zerami, wartosc
   * obcieta do zakresu. Nadpisuje wzorcowe cyfry zapisane w tle IFACE. Wymaga arkusza (bez niego tekst).
   */
  cells?: number;
  /** Numer komorki znaku minus w arkuszu (w NUMBERS.FRM: 12, offset 108 px). */
  minusIndex?: number;
  /** Same puste komorki (zaslania wzorcowe cyfry tla, gdy nie ma wiarygodnej wartosci). */
  blank?: boolean;
}) {
  const img = useUiArt(props.sheet);
  const stage = useStageInfo();
  const text =
    props.blank && props.cells
      ? img
        ? ' '.repeat(props.cells)
        : ''
      : img && props.cells
        ? fixedCells(props.value, props.cells)
        : String(props.value);
  const count = img ? Math.max(1, Math.round(img.width / props.digitWidth)) : 10;
  return (
    <span class="f2-art-digits">
      {[...text].map((ch, i) =>
        img && (ch === ' ' || ch === '-') && props.cells ? (
          <span
            key={i}
            class={ch === ' ' ? 'f2-art-digit f2-art-digit--blank' : 'f2-art-digit'}
            data-digit={ch === ' ' ? 'blank' : ''}
            style={cellStyle(
              img,
              stage,
              props.digitWidth,
              ch === '-' ? (props.minusIndex ?? 12) : null,
              count,
            )}
          >
            {ch === ' ' ? '' : ch}
          </span>
        ) : img && ch >= '0' && ch <= '9' ? (
          <span
            key={i}
            data-digit=""
            class="f2-art-digit"
            style={{
              ...(stage
                ? {
                    '--f2-art-w': String((props.digitWidth / stage.w) * 100),
                    '--f2-art-h': String((img.height / stage.w) * 100),
                    width: 'calc(var(--f2-art-w) * 1cqw)',
                    height: 'calc(var(--f2-art-h) * 1cqw)',
                  }
                : { width: `${props.digitWidth}px`, height: `${img.height}px` }),
              backgroundImage: `url(${img.url})`,
              backgroundSize: `${count * 100}% 100%`,
              backgroundPosition: `${count > 1 ? (Number(ch) / (count - 1)) * 100 : 0}% 0%`,
            }}
          >
            {ch}
          </span>
        ) : (
          <span key={i} class="f2-art-glyph">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

/** Komorki: pierwsza na znak (spacja lub minus), reszta cyfr dopelnionych zerami; poza zakresem obcinane. */
export function fixedCells(value: number | string, cells: number): string {
  const n = Math.trunc(Number(value));
  const digits = Math.max(1, cells - 1);
  const max = 10 ** digits - 1;
  const clamped = Math.max(-max, Math.min(max, Number.isFinite(n) ? n : 0));
  return (clamped < 0 ? '-' : ' ') + String(Math.abs(clamped)).padStart(digits, '0');
}

function cellStyle(
  img: { url: string; width: number; height: number },
  stage: ReturnType<typeof useStageInfo>,
  digitWidth: number,
  index: number | null,
  count: number,
): Record<string, string | number> {
  const size: Record<string, string | number> = stage
    ? {
        '--f2-art-w': String((digitWidth / stage.w) * 100),
        '--f2-art-h': String((img.height / stage.w) * 100),
        width: 'calc(var(--f2-art-w) * 1cqw)',
        height: 'calc(var(--f2-art-h) * 1cqw)',
      }
    : { width: `${digitWidth}px`, height: `${img.height}px` };
  if (index === null) return size;
  return {
    ...size,
    backgroundImage: `url(${img.url})`,
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: `${count > 1 ? (index / (count - 1)) * 100 : 0}% 0%`,
  };
}
