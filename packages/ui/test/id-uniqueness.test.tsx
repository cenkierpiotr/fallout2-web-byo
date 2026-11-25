// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs } from '../src/components';
import { UiArtProvider } from '../src/art/context';
import { OptionsScreen, type OptionsFixItem, type OptionsValues } from '../src';

const values: OptionsValues = {
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 70,
  speechVolume: 90,
  language: 'pl',
  gameTextLanguage: 'auto',
  gameDifficulty: 1,
  combatDifficulty: 1,
  gameSpeed: 'normal',
  profile: 'auto',
  classicMode: false,
};
const fixes: OptionsFixItem[] = [];

/** Zrodlo z opts.bg, ze OptionsScreen renderowal skorce FRM z wlasna kolumna zakladek. */
const artSource = {
  get: (name: string) =>
    name === 'opts.bg'
      ? { url: 'opts.bg.png', width: 164, height: 217 }
      : name === 'opts.tab.up'
        ? { url: 'up.png', width: 137, height: 34 }
        : name === 'opts.tab.dn'
          ? { url: 'dn.png', width: 137, height: 34 }
          : null,
  subscribe: () => () => {},
};

describe('kolizja id zakladek (aria)', () => {
  afterEach(cleanup);

  it('Tabs domyslnie generuje f2-tab-<id>, idPrefix nadpisuje prefiks', () => {
    const { unmount } = render(
      <Tabs
        items={[{ id: 'sound', label: 'A' }]}
        value="sound"
        placement="top"
        onChange={() => {}}
      />,
    );
    expect(document.getElementById('f2-tab-sound')).toBeTruthy();
    unmount();

    render(
      <Tabs
        items={[{ id: 'sound', label: 'A' }]}
        value="sound"
        placement="top"
        idPrefix="f2-opts"
        onChange={() => {}}
      />,
    );
    expect(document.getElementById('f2-tab-sound')).toBeNull();
    expect(document.getElementById('f2-opts-tab-sound')).toBeTruthy();
  });

  it('OptionsScreen i Pipboy/Tabs w jednym DOM nie maja duplikatow id', () => {
    render(
      <Tabs
        items={[{ id: 'sound', label: 'A' }, { id: 'map', label: 'B' }]}
        value="sound"
        placement="top"
        onChange={() => {}}
      />,
    );
    render(
      <UiArtProvider source={artSource}>
        <OptionsScreen
          values={values}
          fixes={fixes}
          detected="desktop"
          onChange={() => {}}
          onFixChange={() => {}}
        />
      </UiArtProvider>,
    );
    // Skorka FRM: Options generuje f2-opts-tab-*, Tabs f2-tab-* — zaden id sie nie powtarza.
    const ids = [...document.querySelectorAll('[role="tab"]')].map((el) => el.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toContain('f2-opts-tab-sound');
    expect(ids).toContain('f2-tab-map');
    // aria-labelledby tabpanelu wskazuje na istniejace, unikalne id zakladki.
    const panel = document.querySelector('[role="tabpanel"]') as HTMLElement;
    const labelled = panel.getAttribute('aria-labelledby')!;
    expect(labelled.startsWith('f2-opts-tab-')).toBe(true);
    expect(document.getElementById(labelled)?.id).toBe(labelled);
  });

  it('fallback Options (bez grafik) tez uzywa prefiksu f2-opts', () => {
    render(
      <OptionsScreen
        values={values}
        fixes={fixes}
        detected="desktop"
        onChange={() => {}}
        onFixChange={() => {}}
      />,
    );
    const ids = [...document.querySelectorAll('[role="tab"]')].map((el) => el.id);
    expect(ids).toContain('f2-opts-tab-sound');
  });
});
