// @vitest-environment jsdom
import { signal } from '@preact/signals';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiArtProvider, type UiArtSource } from '@f2/ui';
import { client } from '../../state/game-folder';
import { setLocale } from '../../i18n';

const fakeScreen = () => ({
  maps: [],
  ui: signal(null),
  notes: signal<string[]>([]),
  logLines: signal<string[]>([]),
  elevation: signal(0),
  mapName: signal('arroyo'),
  fps: signal(60),
  loading: signal(false),
  menu: signal(null),
  steal: signal(null),
  view: {},
  dialog: {},
  stop: vi.fn(),
  dispose: vi.fn(),
  open: vi.fn(async () => {}),
  trade: vi.fn(() => false),
});

vi.mock('./map-screen', () => ({ createMapScreen: async () => fakeScreen() }));
vi.mock('../dialog/DialogScreen', () => ({ DialogScreen: () => null }));

import { MapView } from './MapView';

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

afterEach(() => {
  cleanup();
  client.value = null;
  setLocale('pl');
});

async function mount(source: UiArtSource | null) {
  client.value = {} as never;
  render(
    <UiArtProvider source={source}>
      <MapView autoOpen="arroyo" />
    </UiArtProvider>,
  );
  await screen.findByTestId('map-back');
}

describe('MapView: skorka IFACE', () => {
  it('bez grafik zostaje stary HUD z tymi samymi testid', async () => {
    await mount(null);
    for (const id of [
      'open-saves',
      'open-trade',
      'zoom-in',
      'zoom-out',
      'elevation-up',
      'elevation-down',
    ])
      expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('iface-bar')).toBeNull();
    expect(screen.getByTestId('map-stage').hasAttribute('data-skin')).toBe(false);
  });

  it('z grafika pasek IFACE, a handel i zoom w panelu dodatkow; zapisy pod OPT z testid open-saves', async () => {
    await mount(sourceOf({ 'iface.bar': [640, 100], 'iface.opts.up': [34, 34] }));
    expect(screen.getByTestId('map-stage').hasAttribute('data-skin')).toBe(true);
    const extras = screen.getByTestId('iface-extras');
    for (const id of ['open-trade', 'zoom-in', 'zoom-out', 'elevation-up', 'elevation-down'])
      expect(extras.contains(screen.getByTestId(id))).toBe(true);
    expect(screen.getAllByTestId('open-saves')).toHaveLength(1);
    expect(extras.contains(screen.getByTestId('open-saves'))).toBe(false);
    expect(screen.queryByTestId('iface-hp')).toBeNull();
  });
});
