import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { parseFrm, parsePal } from '@f2/formats';
import type { DecodeClient } from '@f2/assets';
import { UiArtProvider, type LayoutMode } from '@f2/ui';
import { canvasToUrl } from '../game/icon-sprites';
import { createUiArt, type UiArtSource } from '../game/ui-art';
import { parseLst } from '../game/worldmap/worldmap-art';
import { settings, type Settings } from '../settings';
import { client } from '../state/game-folder';
import { createRemoteVfs } from '../screens/map/remote-vfs';
import { resolveArtPath } from './art-manifest';

/** Zrodlo grafik interfejsu z plikow gry (palette + intrface.lst); blad = null (UI zostaje w trybie bez grafik). */
export async function buildUiArtSource(c: DecodeClient): Promise<UiArtSource | null> {
  try {
    const rvfs = await createRemoteVfs(c);
    const read = (p: string): Promise<Uint8Array> => c.read(rvfs.canonical(p) ?? p);
    const palette = parsePal(await read('color.pal')).rgba;
    const lst = parseLst(new TextDecoder().decode(await read('art/intrface/intrface.lst')));
    return createUiArt({
      pathFor: (key) => resolveArtPath(lst, key),
      loadFrm: async (p) => parseFrm(await read(p)),
      paletteRgba: palette,
      toUrl: canvasToUrl,
    });
  } catch {
    return null;
  }
}

/**
 * Wariant ukladu grafik wg ustawienia "Input" (settings.inputProfile): jawne 'touch'/'desktop'
 * wymusza uklad dotykowy/pc; kazda inna wartosc ('auto', 'hybrid') zostawia autodetekcje
 * (pointer: coarse albo szerokosc <= 900 => touch). Funkcja czysta, latwa do testu.
 */
export function layoutFromSettings(s: Pick<Settings, 'inputProfile'>): LayoutMode | undefined {
  if (s.inputProfile === 'touch') return 'touch';
  if (s.inputProfile === 'desktop') return 'pc';
  return undefined;
}

/** Provider grafik interfejsu dla calej aplikacji; source = null bez danych gry (fallback 1:1). */
export function GameUiArt(props: { children?: ComponentChildren }) {
  const c = client.value;
  // Uklad: jawny wybor "Input" z opcji wygrywa z autodetekcja (uzytkownik wie lepiej).
  const layout = layoutFromSettings({ inputProfile: settings.value.inputProfile });
  const [source, setSource] = useState<UiArtSource | null>(null);
  useEffect(() => {
    let dead = false;
    setSource(null);
    if (c) void buildUiArtSource(c).then((s) => !dead && setSource(s));
    return () => {
      dead = true;
    };
  }, [c]);
  return (
    <UiArtProvider source={source} {...(layout ? { layout } : {})}>
      {props.children}
    </UiArtProvider>
  );
}
