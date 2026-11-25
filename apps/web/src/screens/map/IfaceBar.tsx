import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  ArtAt,
  ArtButton,
  ArtDigits,
  ArtStage,
  ExtrasPanel,
  useLayoutMode,
  useUiArt,
} from '@f2/ui';
import { t } from '../../i18n';
import './IfaceBar.css';

export interface IfaceBarProps {
  /** Wartosci bez zrodla w sesji (undefined) nie sa rysowane, zeby nie udawac zera. */
  hp?: number;
  hpMax?: number;
  ac?: number;
  ap?: number;
  apMax?: number;
  /** Przyciski bez handlera nie sa rysowane (ekran nie jest podpiety do mapy w tej wersji). */
  onInventory?(): void;
  onOptions?(): void;
  onMap?(): void;
  onCharacter?(): void;
  onPipboy?(): void;
  onSkills?(): void;
  /** Etykieta i testid przycisku OPT (np. gdy otwiera zapisy zamiast menu opcji). */
  optionsLabel?: string;
  optionsTestId?: string;
  messages: string[];
  /** Przyciski spoza oryginalu (zoom, pietro, handel) w panelu dodatkow. */
  extras?: ComponentChildren;
}

type Pos = { x: number; y: number; w: number; h: number };
/**
 * Pozycje w jednostkach grafiki IFACE (640x99). Zweryfikowane template-matchingiem sprajtow
 * FRM (invbutup/optiup/mapup/chaup/pipup/bigredup) na tle iface.png (wyniki < 6 = trafienie
 * dokladne) oraz krawedziami wneki na tle: prawa kolumna map/cha/pip = stos 41x19 w y 39/58/77.
 * Liczniki: wypalone cyfry podkladu (HP "036" w x 477/487/497, y=39; KP w y=75) plus komorka
 * znaku daja okno 4 komorek od x=468 (pierwsza rysowana cyfra trafia wtedy na 477).
 * Na dotyku (minTouch 44px) stos map/cha/pip dostaje wiekszy rozstep, zeby hitboxy sie nie
 * nakladaly (dodatek nasz, nie oryginalu).
 */
const POS: Record<string, Pos> = {
  inv: { x: 211, y: 40, w: 32, h: 21 }, // invbutup: dopasowanie 2.4 w (211,40)
  opts: { x: 210, y: 61, w: 34, h: 34 }, // optiup: dopasowanie 0.0 w (210,61)
  skills: { x: 218, y: 6, w: 22, h: 21 }, // bigredup: dopasowanie 0.0 w (218,6) - przycisk Skilldex
  map: { x: 526, y: 39, w: 41, h: 19 }, // mapup: 5.0 w (526,39)
  cha: { x: 526, y: 58, w: 41, h: 19 }, // chaup: 1.7 w (526,58)
  pip: { x: 526, y: 77, w: 41, h: 19 }, // pipup: 4.9 w (526,77); wszystkie trzy 41x19
  hp: { x: 468, y: 39, w: 36, h: 17 }, // wneka licznika HP: cyfry podkladu od x=477, y=39
  ac: { x: 468, y: 75, w: 36, h: 17 }, // wneka licznika KP: cyfry podkladu od x=477, y=75
  ap: { x: 316, y: 14, w: 60, h: 12 }, // NIEZWERYFIKOWANE na tle: pas PA nie ma wypalonych cyfr
  msg: { x: 23, y: 26, w: 165, h: 66 }, // wewnatrz wneki komunikatow (krawedzie x=23..191, y~23..93)
};

/** Cyfry licznikow: arkusz iface.digits, komorka 9x17 (numbers.frm 360x17 = 40 pasow). */
const DIGIT_W = 9;
/** Licznik HP/KP: komorka znaku + 3 cyfry z zerami wiodacymi; minus w komorce 12 arkusza (offset 108 px). */
const COUNTER_CELLS = 4;
const MINUS_CELL = 12;

/** Puste komorki licznika zaslaniajace wzorcowe cyfry z tla IFACE. */
function BlankCounter() {
  return (
    <span class="f2-iface__blank" data-testid="iface-counter-blank" aria-hidden="true">
      <ArtDigits value={0} sheet="iface.digits" digitWidth={DIGIT_W} cells={COUNTER_CELLS} blank />
    </span>
  );
}

type BtnKey = 'inv' | 'opts' | 'skills' | 'map' | 'cha' | 'pip';
const BTN: Record<
  BtnKey,
  { up: string; dn: string; label: string; testId: string; handler: keyof IfaceBarProps }
> = {
  inv: {
    up: 'iface.inv.up',
    dn: 'iface.inv.dn',
    label: 'iface.inventory',
    testId: 'iface-inv',
    handler: 'onInventory',
  },
  opts: {
    up: 'iface.opts.up',
    dn: 'iface.opts.dn',
    label: 'iface.options',
    testId: 'iface-opts',
    handler: 'onOptions',
  },
  skills: {
    up: 'iface.redbig.up',
    dn: 'iface.redbig.dn',
    label: 'iface.skills',
    testId: 'iface-skills',
    handler: 'onSkills',
  },
  map: {
    up: 'iface.map.up',
    dn: 'iface.map.dn',
    label: 'iface.map',
    testId: 'iface-map',
    handler: 'onMap',
  },
  cha: {
    up: 'iface.cha.up',
    dn: 'iface.cha.dn',
    label: 'iface.character',
    testId: 'iface-cha',
    handler: 'onCharacter',
  },
  pip: {
    up: 'iface.pip.up',
    dn: 'iface.pip.dn',
    label: 'iface.pipboy',
    testId: 'iface-pip',
    handler: 'onPipboy',
  },
};
const BTN_ORDER: BtnKey[] = ['inv', 'cha', 'pip', 'map', 'skills', 'opts'];

/** Zdarzenia wskaznika z paska nie moga dotrzec do mapy: tap w przycisk nie jest marszem ani menu radialnym. */
const stopPointer = (e: Event): void => e.stopPropagation();

export function IfaceBar(props: IfaceBarProps) {
  const bar = useUiArt('iface.bar');
  const layout = useLayoutMode();
  const [collapsed, setCollapsed] = useState(false);
  const touch = layout === 'touch';
  const last = props.messages.slice(-3);

  const hpText =
    props.hp !== undefined && props.hpMax !== undefined
      ? t('iface.hp', { hp: props.hp, max: props.hpMax })
      : null;
  const acText = props.ac !== undefined ? t('iface.ac', { ac: props.ac }) : null;
  const apText =
    props.ap !== undefined && props.apMax !== undefined
      ? t('iface.ap', { ap: props.ap, max: props.apMax })
      : null;

  const button = (k: BtnKey) => {
    const b = BTN[k];
    const onClick = props[b.handler] as (() => void) | undefined;
    if (!onClick) return null;
    const isOpts = k === 'opts';
    return (
      <ArtButton
        up={b.up}
        down={b.dn}
        label={isOpts && props.optionsLabel ? props.optionsLabel : t(b.label)}
        testId={isOpts && props.optionsTestId ? props.optionsTestId : b.testId}
        onClick={onClick}
      />
    );
  };

  const toggle = touch ? (
    <button
      type="button"
      class="f2-iface__toggle"
      data-testid="iface-toggle"
      aria-expanded={!collapsed}
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? t('iface.expand') : t('iface.collapse')}
    </button>
  ) : null;

  const extras = props.extras ? (
    <div class="f2-iface__extras" data-testid="iface-extras">
      <ExtrasPanel title={t('iface.extras')}>{props.extras}</ExtrasPanel>
    </div>
  ) : null;

  if (!bar) {
    return (
      <div
        class="f2-iface f2-iface--fallback"
        data-testid="iface-bar"
        onPointerDown={stopPointer}
        onPointerUp={stopPointer}
        onPointerMove={stopPointer}
      >
        {toggle}
        {!collapsed && (
          <div class="f2-iface__row">
            {hpText && <span data-testid="iface-hp">{hpText}</span>}
            {acText && <span data-testid="iface-ac">{acText}</span>}
            {apText && <span data-testid="iface-ap">{apText}</span>}
            {BTN_ORDER.map((k) => (
              <span key={k}>{button(k)}</span>
            ))}
          </div>
        )}
        {last.length > 0 && !collapsed && (
          <ul class="f2-iface__msgs" data-testid="iface-msgs">
            {last.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {extras}
      </div>
    );
  }

  /** Na dotyku map/cha/pip w siatce 2x2 (rozstep >= 32 jedn. = 44px na telefonie), zeby hitboxy
   * sie nie nakladaly. To celowy dodatek nasz: rozstep nie istnieje w oryginale (tam map/cha/pip
   * w jednym stosie stykaja sie w y 39/58/77). */
  const TOUCH_POS: Partial<Record<BtnKey, Pos>> = {
    map: { x: 526, y: 34, w: 41, h: 19 },
    cha: { x: 575, y: 34, w: 41, h: 19 },
    pip: { x: 526, y: 68, w: 41, h: 19 },
  };
  const posOf = (k: BtnKey): Pos => (touch ? TOUCH_POS[k] : undefined) ?? POS[k]!;

  return (
    <div
      class="f2-iface"
      data-testid="iface-bar"
      data-touch={touch ? '' : undefined}
      onPointerDown={stopPointer}
      onPointerUp={stopPointer}
      onPointerMove={stopPointer}
    >
      {toggle}
      {!collapsed && (
        <div
          class="f2-iface__art"
          style={{
            aspectRatio: `${bar.width} / ${bar.height}`,
            '--f2-art-ratio': String(bar.width / bar.height),
          }}
        >
          <ArtStage background="iface.bar" minTouch={touch}>
            {BTN_ORDER.map((k) => {
              const b = button(k);
              return b ? (
                <ArtAt key={k} {...posOf(k)}>
                  {b}
                </ArtAt>
              ) : null;
            })}
            {/* Tlo IFACE ma wzorcowe cyfry (036 / -258): bez wiarygodnej wartosci pole jest zaslaniane pustymi komorkami. */}
            <ArtAt {...POS.hp!}>
              {hpText ? (
                <span data-testid="iface-hp" aria-label={hpText}>
                  <ArtDigits
                    value={props.hp!}
                    sheet="iface.digits"
                    digitWidth={DIGIT_W}
                    cells={COUNTER_CELLS}
                    minusIndex={MINUS_CELL}
                  />
                </span>
              ) : (
                <BlankCounter />
              )}
            </ArtAt>
            <ArtAt {...POS.ac!}>
              {acText ? (
                <span data-testid="iface-ac" aria-label={acText}>
                  <ArtDigits
                    value={props.ac!}
                    sheet="iface.digits"
                    digitWidth={DIGIT_W}
                    cells={COUNTER_CELLS}
                    minusIndex={MINUS_CELL}
                  />
                </span>
              ) : (
                <BlankCounter />
              )}
            </ArtAt>
            {apText && (
              <ArtAt {...POS.ap!}>
                <span data-testid="iface-ap" aria-label={apText}>
                  <ArtDigits value={props.ap!} sheet="iface.digits" digitWidth={DIGIT_W} />
                </span>
              </ArtAt>
            )}
            <ArtAt {...POS.msg!}>
              <ul class="f2-iface__msgs" data-testid="iface-msgs">
                {last.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </ArtAt>
          </ArtStage>
        </div>
      )}
      {extras}
    </div>
  );
}
