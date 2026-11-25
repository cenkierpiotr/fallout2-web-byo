import { fireEvent, render, screen, within } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { setLocale } from '../../../src/i18n';
import { CreatorScreen, createMockCreatorStore } from '../../../src/screens/creator';
import type { CreatorCommands } from '../../../src/screens/creator/types';
import type { CreatorView } from '../../../src/screens/creator/types';

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren, source?: UiArtSource | null, layout?: 'pc' | 'touch') =>
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        {ui}
      </UiArtProvider>
    </ThemeProvider>,
  );

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});

/** Pelny zestaw grafik kreatora: tlo EDTRCRTE + cyfry + przyciski (rozmiary z prawdziwych FRM). */
const CREATOR_ART: Record<string, [number, number]> = {
  'creator.bg': [640, 480],
  'creator.digits': [336, 24],
  'creator.stat.plus.up': [16, 12],
  'creator.stat.plus.dn': [16, 12],
  'creator.stat.minus.up': [16, 12],
  'creator.stat.minus.dn': [16, 12],
  'creator.skill.tag.up': [17, 11],
  'creator.skill.tag.dn': [17, 11],
  'creator.btn.name.up': [145, 35],
  'creator.btn.name.dn': [145, 35],
  'creator.btn.age.up': [81, 32],
  'creator.btn.age.dn': [81, 32],
  'creator.btn.sex.up': [80, 32],
  'creator.btn.sex.dn': [80, 32],
  'creator.btn.done.up': [137, 34],
  'creator.btn.done.dn': [137, 34],
  'creator.btn.cancel.up': [15, 16],
  'creator.btn.cancel.dn': [15, 16],
};

/** Komendy-zapis: sprawdzamy wiazanie, nie logike magazynu. */
const recording = (commands: CreatorCommands) => {
  const calls: string[] = [];
  const { applyPreset, adjustStat, toggleTag, toggleTrait, finish, setAge, setGender, setName } =
    commands;
  const wrapped: CreatorCommands = {
    ...commands,
    setName: (n) => {
      calls.push(`setName:${n}`);
      return setName(n);
    },
    setAge: (a) => {
      calls.push(`setAge:${a}`);
      return setAge(a);
    },
    setGender: (g) => {
      calls.push(`setGender:${g}`);
      return setGender(g);
    },
    applyPreset: (id) => {
      calls.push(`applyPreset:${id}`);
      return applyPreset(id);
    },
    adjustStat: (id, d) => {
      calls.push(`adjustStat:${id}:${d}`);
      return adjustStat(id, d);
    },
    toggleTag: (id) => {
      calls.push(`toggleTag:${id}`);
      return toggleTag(id);
    },
    toggleTrait: (id) => {
      calls.push(`toggleTrait:${id}`);
      return toggleTrait(id);
    },
    finish: () => {
      calls.push('finish');
      return finish();
    },
  };
  return Object.assign(wrapped, { calls });
};

const KEY_TESTIDS = [
  'creator-name',
  'points-left-stats',
  'stat-description',
  'skill-list',
  'tags-counter',
  'trait-picker',
  'traits-counter',
  'creator-summary',
  'points-left',
] as const;

const viewOf = (view: CreatorView): CreatorView => view;

describe('CreatorScreen - skorka FRM', () => {
  it('bez sztuki i bez providera: struktura fallback bez zmian', () => {
    const store = createMockCreatorStore();
    wrap(<CreatorScreen view={viewOf(store.getView())} commands={store.commands} />);
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    const presetBtn = screen.getByRole('button', { name: 'Wybierz postać: Narg' });
    fireEvent.click(presetBtn);
    expect(store.getView().presetId).toBe('combat');
    expect(screen.getByTestId('points-left-stats')).toBeTruthy();
    expect(screen.getByTestId('skill-list')).toBeTruthy();
    expect(screen.getByTestId('trait-picker')).toBeTruthy();
    expect(screen.getByTestId('creator-summary')).toBeTruthy();
  });

  it('bez sztuki z nullem w key dye: fallback identyczny jak bez providera', () => {
    const store = createMockCreatorStore();
    wrap(<CreatorScreen view={viewOf(store.getView())} commands={store.commands} />, sourceOf({}));
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getByTestId('creator-name')).toBeTruthy();
  });

  it('z sztuka (PC): tlo 640/480, te same testidy, komendy wiazane', () => {
    const store = createMockCreatorStore();
    const cmd = recording(store.commands);
    const renderCount = wrap(
      <CreatorScreen
        view={viewOf({ ...store.getView(), canFinish: true, reasons: [] })}
        commands={cmd}
      />,
      sourceOf(CREATOR_ART),
      'pc',
    );
    const stage = document.querySelector('[data-art-stage]') as HTMLElement | null;
    expect(stage).toBeTruthy();
    expect(stage!.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    expect(stage!.style.backgroundImage).toContain('creator.bg.png');

    // Wszystkie kluczowe testidy we wlasnym MVP z grafika.
    for (const id of KEY_TESTIDS)
      expect(within(stage as HTMLElement).queryByTestId(id)).toBeTruthy();

    // Preset (wybor gotowej postaci): przycisk z aria-label dziala.
    // (gotowe postacie sa w panelu dodatkow pod scena)
    const presetBtn = screen.getByRole('button', { name: 'Wybierz postać: Narg' });
    fireEvent.click(presetBtn);
    expect(cmd.calls).toContain('applyPreset:combat');

    // +/- atrybutu dzialaja (najpierw wzmocnij pierwszy stat).
    const plus = within(stage as HTMLElement).getByRole('button', { name: 'Zwiększ: Siła' });
    fireEvent.click(plus);
    expect(cmd.calls).toContain('adjustStat:0:1');

    // Zakonczenie wiazane z finish().
    const finishBtn = within(stage as HTMLElement).getByRole('button', {
      name: 'Zakończ i zacznij grę',
    });
    expect(finishBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(finishBtn);
    expect(cmd.calls).toContain('finish');

    // Toolbar PC: przelacznik pelnego ekranu i zwijanie postaci
    const fsToggle = screen.getByTestId('creator-fullscreen-toggle');
    expect(fsToggle).toBeTruthy();
    expect(fsToggle.textContent).toContain('Pełny ekran');

    const extrasToggle = screen.getByTestId('creator-extras-toggle');
    expect(extrasToggle).toBeTruthy();
    expect(extrasToggle.textContent).toContain('Postać');
    fireEvent.click(extrasToggle);
    expect(extrasToggle.getAttribute('aria-expanded')).toBe('true');

    renderCount.unmount();
  });

  it('z sztuka (PC): opis atrybutu reaguje na wybor', () => {
    const store = createMockCreatorStore();
    wrap(
      <CreatorScreen view={viewOf(store.getView())} commands={store.commands} />,
      sourceOf(CREATOR_ART),
      'pc',
    );
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(within(stage).queryByTestId('stat-description')).toBeTruthy();
    expect(within(stage).getByTestId('stat-description').textContent).toContain('Siła');
    const minus = within(stage).getByRole('button', { name: 'Zmniejsz: Percepcja' });
    fireEvent.mouseEnter(minus.parentElement as HTMLElement);
    expect(within(stage).getByTestId('stat-description').textContent).toContain('Percepcja');
  });

  it('z sztuka (touch): kroki jak dotad, cele dotykowe min 44px', () => {
    const store = createMockCreatorStore();
    wrap(
      <CreatorScreen view={viewOf(store.getView())} commands={store.commands} />,
      sourceOf(CREATOR_ART),
      'touch',
    );
    // Kroki nadal istnieja + testidy widoczne na biezacym kroku.
    expect(document.querySelector('.f2-creator__step')).toBeTruthy();
    expect(screen.queryByTestId('creator-name')).toBeTruthy();

    const assert44 = (root: HTMLElement) => {
      const buttons = [...root.querySelectorAll('button:not([disabled])')] as HTMLElement[];
      for (const btn of buttons) {
        expect(btn.style.minHeight).toBe('44px');
        expect(btn.style.minWidth).toBe('44px');
      }
    };
    assert44(screen.getByTestId('creator-screen') as HTMLElement);

    // Przejdz przez kroki: na kazdym wszystkie aktywne przyciski >= 44px.
    for (const tabName of ['SPECIAL', 'Umiejętności', 'Cechy', 'Podsumowanie']) {
      fireEvent.click(screen.getByRole('tab', { name: tabName }));
      const step = document.querySelector('.f2-creator__step') as HTMLElement;
      assert44(screen.getByTestId('creator-screen') as HTMLElement);
      expect(step).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Zakończ i zacznij grę' })).toBeTruthy();
  });

  it('z sztuka (touch): przelaczenie atrybutow i tagow dziala', () => {
    const store = createMockCreatorStore();
    const cmd = recording(store.commands);
    wrap(
      <CreatorScreen view={viewOf(store.getView())} commands={cmd} />,
      sourceOf(CREATOR_ART),
      'touch',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'SPECIAL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zwiększ: Siła' }));
    expect(cmd.calls).toContain('adjustStat:0:1');
    fireEvent.click(screen.getByRole('tab', { name: 'Umiejętności' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wybierz umiejętność: Broń palna' }));
    expect(cmd.calls).toContain('toggleTag:0');
  });
});

describe('CreatorScreen - stany przyciskow FRM', () => {
  const art: Record<string, [number, number]> = {
    ...CREATOR_ART,
  };
  const withNames = (): UiArtSource => ({
    get: (name) =>
      art[name] ? { url: `${name}.png`, width: art[name]![0], height: art[name]![1] } : null,
    subscribe: () => () => {},
  });

  it('w spoczynku pokazuje grafike up, po wcisnieciu dn', () => {
    const store = createMockCreatorStore();
    wrap(<CreatorScreen view={store.getView()} commands={store.commands} />, withNames(), 'pc');
    const plus = screen.getByRole('button', { name: 'Zwiększ: Siła' });
    expect(plus.querySelector('img')!.getAttribute('src')).toBe('creator.stat.plus.up.png');
    fireEvent.pointerDown(plus);
    expect(plus.querySelector('img')!.getAttribute('src')).toBe('creator.stat.plus.dn.png');
  });

  it('PC: polskie nazwy atrybutow tylko dla czytnikow', () => {
    const store = createMockCreatorStore();
    wrap(<CreatorScreen view={store.getView()} commands={store.commands} />, withNames(), 'pc');
    expect(document.querySelector('.f2-creator__stat-name')!.className).toContain('f2-creator__sr');
  });
});
