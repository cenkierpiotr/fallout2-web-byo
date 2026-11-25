import { fireEvent, render, screen, within } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { BarterScreen } from '../../../src/screens/barter/BarterScreen';
import { createMockBarter, sampleBarter, SAMPLE_IDS as I } from '../../../playground/barter-mock';

beforeEach(() => setLocale('pl'));

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});
const BG: Record<string, [number, number]> = {
  'barter.bg': [640, 191],
  'barter.bg.party': [640, 190],
};

function setup(source?: UiArtSource, layout?: 'pc' | 'touch', party?: boolean) {
  const mock = createMockBarter(sampleBarter());
  if (party) mock.view.value = { ...mock.view.value, party: true };
  render(
    <ThemeProvider>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>
          <BarterScreen
            view={mock.view}
            commands={mock.commands}
            sprite={() => undefined}
            compact={false}
          />
        </ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );
  return mock;
}
const row = (col: string, id: number) =>
  within(screen.getByTestId(col))
    .getAllByTestId('barter-item')
    .find((e) => e.getAttribute('data-item-id') === String(id))!;

describe('BarterScreen - skorka FRM', () => {
  it('bez sztuki: fallback bez sceny', () => {
    setup();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getByTestId('barter-skill')).toBeTruthy();
    expect(document.querySelector('.f2-panel__title')).toBeTruthy();
  });

  it('PC: tlo 640/191, 4 obszarow ArtAt, dodatki w panelu Extras, handel dziala', () => {
    const m = setup(sourceOf(BG), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('640/191');
    expect(stage.style.backgroundImage).toContain('barter.bg.png');
    expect(document.querySelectorAll('[data-art-at]').length).toBe(4);
    expect(document.querySelector('.f2-panel__title')).toBeNull();
    // skill i kategorie w Extras
    const extras = document.querySelector('.f2-art-extras')!;
    expect(extras.querySelector('[data-testid=barter-skill]')).toBeTruthy();
    expect(extras.querySelector('[role=tablist]')).toBeTruthy();
    // te same testidy
    expect(screen.getByTestId('barter-summary')).toBeTruthy();
    expect(screen.getByTestId('barter-offer')).toBeTruthy();
    expect(screen.getByTestId('barter-status')).toBeTruthy();
    // przeniesienie przedmiotu na stol
    fireEvent.click(row('barter-player-inv', I.pistol));
    expect(m.view.value.tablePlayer.length).toBe(1);
  });

  it('dotyk: nakladka z kolumnami i celami 44px, bez ArtAt', () => {
    setup(sourceOf(BG), 'touch');
    const overlay = document.querySelector('.f2-barter__touch')!;
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('[data-testid=barter-summary]')).toBeTruthy();
    expect(document.querySelectorAll('[data-art-at]').length).toBe(0);
    expect(document.querySelector('.f2-art-extras')).toBeNull();
    // skill kupca widoczny takze na dotyku (w nakladce)
    expect(overlay.querySelector('[data-testid=barter-skill]')).toBeTruthy();
  });

  it('party: handel z druzyna uzywa tla barter.bg.party (trade.frm)', () => {
    setup(sourceOf(BG), 'pc', true);
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.backgroundImage).toContain('barter.bg.party.png');
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('640/190');
    // te same testidy i uklad co zwykly handel
    expect(document.querySelectorAll('[data-art-at]').length).toBe(4);
    expect(screen.getByTestId('barter-summary')).toBeTruthy();
  });

  it('bez flagi party: zwykle tlo barter.bg, wariant party nieuzywany', () => {
    setup(sourceOf(BG), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.backgroundImage).toContain('barter.bg.png');
    expect(stage.style.backgroundImage).not.toContain('party');
  });

  it('party bez grafiki wariantu: fallback do tla barter.bg, nie do fallbacku 1:1', () => {
    // zrodlo ma tylko zwykle tlo: klient bez danych gry dla trade.frm nadal dostaje skorka
    const onlyMain = sourceOf({ 'barter.bg': [640, 191] });
    setup(onlyMain, 'pc', true);
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.backgroundImage).toContain('barter.bg.png');
    expect(stage.style.backgroundImage).not.toContain('party');
    expect(document.querySelectorAll('[data-art-at]').length).toBe(4);
  });

  it('party bez grafiki wariantu: ArtStage dostaje klucz tla, ktore istnieje (nie "party")', () => {
    // stageKey musi wskazywac dostepne tlo; gownym dowodem jest render sceny art
    // (ArtStage zwraca f2-art-fallback, gdy useUiArt(stageKey) nic nie znajdzie)
    const onlyMain = sourceOf({ 'barter.bg': [640, 191] });
    setup(onlyMain, 'pc', true);
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    const fallback = document.querySelector('.f2-art-fallback');
    expect(stage).toBeTruthy();
    expect(fallback).toBeNull();
  });
});
