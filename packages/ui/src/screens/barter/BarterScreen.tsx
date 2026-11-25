import './barter.css';
import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Button, Panel, Tabs } from '../../components';
import { ArtAt, ArtStage, ExtrasPanel, useLayoutMode, useUiArt } from '../../art';
import { dictionaries, locale, t } from '../../i18n';
import type { SpriteUrl } from '../inventory/types';
import { ITEM_CATEGORIES } from '../inventory/types';
import { filterByCategory, type BarterCategoryFilter } from './model';
import { OfferColumn, type ColumnKind, type RowDrag } from './OfferColumn';
import { QuantitySheet } from './QuantitySheet';
import type { BarterCommands, BarterItem, BarterResult, BarterSide, BarterView } from './types';

export interface BarterScreenProps {
  view: ReadonlySignal<BarterView>;
  commands: BarterCommands;
  sprite: SpriteUrl;
  /** Uklad jednokolumnowy; domyslnie wg szerokosci okna (<= 900px). */
  compact?: boolean;
}

interface Pending {
  side: BarterSide;
  item: BarterItem;
  to: 'table' | 'inventory';
}

interface Status {
  kind: 'ok' | 'error';
  text: string;
}

function errorMessage(reason: string): string {
  const key = `barter.error.${reason}`;
  return dictionaries[locale.value][key] !== undefined ? t(key) : t('barter.error.unknown');
}

const NARROW_QUERY = '(max-width: 900px)';

function useNarrow(): boolean {
  const mq = () => (typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : null);
  const [narrow, setNarrow] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/* Uklad okna handlu wg barter.frm 640x191 (zmierzone na zrzucie tla): lewy panel inwentarza gracza,
 * dwie polowy drewnianego stolu (oferta gracza i oferta kupca), prawy panel inwentarza kupca. Waskie panele
 * przy krawedziach (przy OFFER i TALK) zostaja puste. Podsumowanie, status i przyciski leza pod scena. */
const ART_COL_PLAYER_INV = { x: 100, y: 22, w: 80, h: 152 };
const ART_COL_PLAYER_TABLE = { x: 240, y: 8, w: 78, h: 174 };
const ART_COL_MERCHANT_TABLE = { x: 322, y: 8, w: 78, h: 174 };
const ART_COL_MERCHANT_INV = { x: 460, y: 22, w: 80, h: 152 };

export function BarterScreen({ view, commands, sprite, compact: compactProp }: BarterScreenProps) {
  const narrow = useNarrow();
  // Skorka FRM: hooki bezwarunkowo (oba warianty tla, jak dlg.subwin/dlg.subwin.party); brak
  // tla => fallback 1:1. Handlu z czlonkiem druzyna uzywa tla party (trade.frm, id 421); gdy
  // danych gry brakuje dla wariantu party, scena spada na zwykle tlo (i odwrotnie).
  const bgMain = useUiArt('barter.bg');
  const bgParty = useUiArt('barter.bg.party');
  const mode = useLayoutMode();
  const v = view.value;
  const party = v.party === true;
  const bg = party ? bgParty ?? bgMain : bgMain ?? bgParty;
  const stageKey = party
    ? bgParty
      ? 'barter.bg.party'
      : 'barter.bg'
    : bgMain
      ? 'barter.bg'
      : 'barter.bg.party';
  const compact = compactProp ?? narrow;
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const [category, setCategory] = useState<BarterCategoryFilter>('all');
  const totals = v.totals;
  const diff = totals.offer - totals.wanted;
  const playerInv = useMemo(() => filterByCategory(v.player, category), [v.player, category]);
  const merchantInv = useMemo(() => filterByCategory(v.merchant, category), [v.merchant, category]);

  const run = (res: BarterResult): boolean => {
    if (res.ok) setStatus(null);
    else setStatus({ kind: 'error', text: errorMessage(res.reason) });
    return res.ok;
  };

  const direct = (side: BarterSide, item: BarterItem, kind: ColumnKind, count: number) =>
    run(commands.move(side, item.id, count, kind === 'inv' ? 'table' : 'inventory'));

  /** Tap/Enter: pojedynczy przedmiot od razu, stos przez wybor ilosci. */
  const activate = (side: BarterSide, kind: ColumnKind) => (item: BarterItem) => {
    if (item.count > 1) setPending({ side, item, to: kind === 'inv' ? 'table' : 'inventory' });
    else direct(side, item, kind, 1);
  };

  const drag: RowDrag = {
    onHover: setHover,
    onDrop: (target, item, side, kind) => {
      setHover(null);
      if (target === null) return;
      const wantKind =
        target === `${side}:table` ? 'table' : target === `${side}:inv` ? 'inv' : null;
      // upuszczenie na wlasna kolumne albo na kolumne drugiej strony nic nie robi
      if (wantKind === null || wantKind === kind) return;
      direct(side, item, kind, item.count);
    },
  };

  const accept = () => {
    if (run(commands.accept())) setStatus({ kind: 'ok', text: t('barter.done') });
  };

  const balance = () => {
    if (run(commands.balance())) setStatus({ kind: 'ok', text: t('barter.balanced') });
  };

  const col = (title: string, side: BarterSide, kind: ColumnKind, items: BarterItem[]) => (
    <OfferColumn
      title={title}
      side={side}
      kind={kind}
      items={items}
      sprite={sprite}
      drag={drag}
      highlighted={hover === `${side}:${kind}`}
      onActivate={activate(side, kind)}
    />
  );

  const diffText =
    diff >= 0
      ? t('barter.summary.surplus', { value: diff })
      : t('barter.summary.shortfall', { value: -diff });
  const container = v.containerMode;
  const skillText = t('barter.skill', {
    merchant: v.params.merchantBarter,
    party: v.params.partyBestBarter,
    mod: v.params.barterMod,
    master: v.params.masterTrader ? t('barter.skill.master') : '',
  }).trim();
  const canBalance = !container && v.tableMerchant.length > 0 && !totals.balanced;

  const tabsEl = (
    <Tabs
      placement="top"
      value={category}
      onChange={(id) => setCategory(id as BarterCategoryFilter)}
      items={[
        { id: 'all', label: t('inventory.category.all') },
        ...ITEM_CATEGORIES.map((c) => ({ id: c, label: t(`inventory.category.${c}`) })),
      ]}
    />
  );

  const summaryEl = (
    <div
      class={`f2-barter-summary${container || totals.balanced ? ' f2-barter-summary--ok' : ' f2-barter-summary--short'}`}
      data-testid="barter-summary"
    >
      <dl>
        <div>
          <dt>{container ? t('barter.summary.offerWeight') : t('barter.summary.offer')}</dt>
          <dd data-testid="barter-offer">{totals.offer}</dd>
        </div>
        {!container && (
          <div>
            <dt>{t('barter.summary.wanted')}</dt>
            <dd data-testid="barter-wanted">{totals.wanted}</dd>
          </div>
        )}
      </dl>
      {!container && (
        <p class="f2-barter-summary__state" data-testid="barter-balance">
          {totals.balanced
            ? t('barter.summary.balanced')
            : v.tableMerchant.length === 0
              ? t('barter.summary.noTarget')
              : t('barter.summary.unbalanced')}
          {v.tableMerchant.length > 0 && ` (${diffText})`}
        </p>
      )}
      {!container && !bg && (
        <p class="f2-barter-skill" data-testid="barter-skill" title={skillText}>
          {skillText}
        </p>
      )}
    </div>
  );

  const statusEl = (
    <p
      class={`f2-barter-status${status ? ` f2-barter-status--${status.kind}` : ''}`}
      role="status"
      aria-live="polite"
      data-testid="barter-status"
    >
      {status?.text ?? ''}
    </p>
  );

  const actionsEl = (
    <div class="f2-barter-actions">
      <Button variant="primary" onPress={accept}>
        {t('barter.action.trade')}
      </Button>
      {!container && (
        <Button variant="secondary" disabled={!canBalance} onPress={balance}>
          {t('barter.action.balance')}
        </Button>
      )}
      <Button variant="secondary" onPress={() => commands.cancel()}>
        {t('barter.action.close')}
      </Button>
    </div>
  );

  const quantity = pending && (
    <QuantitySheet
      open
      art={!!bg}
      name={pending.item.name}
      max={pending.item.count}
      toTable={pending.to === 'table'}
      onClose={() => setPending(null)}
      onConfirm={(count) => {
        const p = pending;
        setPending(null);
        run(commands.move(p.side, p.item.id, count, p.to));
      }}
    />
  );

  if (bg) {
    const touch = mode === 'touch';
    const skillEl = !container && (
      <p class="f2-barter-skill" data-testid="barter-skill" title={skillText}>
        {skillText}
      </p>
    );
    return (
      <div class="f2-barter-screen f2-barter-screen--art" data-testid="barter-screen">
        <h2 class="f2-barter__sr-title">{t('barter.title', { name: v.merchantName })}</h2>
        <div class="f2-barter__scene">
          <ArtStage background={stageKey} minTouch={touch}>
            {!touch && (
              <>
                <ArtAt {...ART_COL_PLAYER_INV}>
                  {col(t('barter.col.yourItems'), 'player', 'inv', playerInv)}
                </ArtAt>
                <ArtAt {...ART_COL_PLAYER_TABLE}>
                  {col(t('barter.col.yourOffer'), 'player', 'table', v.tablePlayer)}
                </ArtAt>
                <ArtAt {...ART_COL_MERCHANT_TABLE}>
                  {col(t('barter.col.theirOffer'), 'merchant', 'table', v.tableMerchant)}
                </ArtAt>
                <ArtAt {...ART_COL_MERCHANT_INV}>
                  {col(
                    t('barter.col.theirItems', { name: v.merchantName }),
                    'merchant',
                    'inv',
                    merchantInv,
                  )}
                </ArtAt>
              </>
            )}
          </ArtStage>
        </div>
        {touch && (
          <div class="f2-barter__touch">
            {tabsEl}
            <div class="f2-barter-grid f2-barter-grid--art">
              {col(t('barter.col.yourItems'), 'player', 'inv', playerInv)}
              {col(t('barter.col.yourOffer'), 'player', 'table', v.tablePlayer)}
              {col(t('barter.col.theirOffer'), 'merchant', 'table', v.tableMerchant)}
              {col(
                t('barter.col.theirItems', { name: v.merchantName }),
                'merchant',
                'inv',
                merchantInv,
              )}
            </div>
            {summaryEl}
            {skillEl}
            {statusEl}
            {actionsEl}
          </div>
        )}
        {!touch && (
          <div class="f2-barter__below">
            {summaryEl}
            {statusEl}
            {actionsEl}
          </div>
        )}
        {/* Filtr kategorii i skill to nasze dodatki bez odpowiednika w oryginale. */}
        {!touch && (
          <ExtrasPanel title={t('barter.extras')}>
            {tabsEl}
            {skillEl}
          </ExtrasPanel>
        )}
        {quantity}
      </div>
    );
  }

  return (
    <div
      class={`f2-barter-screen${compact ? ' f2-barter-screen--compact' : ''}`}
      data-testid="barter-screen"
    >
      <Panel title={t('barter.title', { name: v.merchantName })}>
        {tabsEl}
        <div class="f2-barter-grid">
          {col(t('barter.col.yourItems'), 'player', 'inv', playerInv)}
          {col(t('barter.col.yourOffer'), 'player', 'table', v.tablePlayer)}
          {col(t('barter.col.theirOffer'), 'merchant', 'table', v.tableMerchant)}
          {col(
            t('barter.col.theirItems', { name: v.merchantName }),
            'merchant',
            'inv',
            merchantInv,
          )}
        </div>
        {summaryEl}
        {statusEl}
        {actionsEl}
      </Panel>

      {quantity}
    </div>
  );
}
