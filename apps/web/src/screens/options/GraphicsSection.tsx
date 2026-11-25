import { useRef, useState } from 'preact/hooks';
import { folderFromFileList } from '@f2/vfs/browser';
import { t } from '../../i18n';
import { hdPack, hdPackFromFiles } from '../../state/hd-pack';
import { settings, updateSettings, type Settings } from '../../settings';
import { detectQualityEnv, planGraphics, previewKeys } from '../map/graphics';

const PRESETS: Settings['graphicsPreset'][] = [
  'auto',
  'niski',
  'sredni',
  'wysoki',
  'ultra',
  'retro',
];

const HD_MODES: Settings['hdMode'][] = ['original', 'base', 'hd'];

/** Wybor grafiki HD: tryb, sciezka RGBA, kafle i paczka HD (folder z assets-hd) wskazana przez gracza. */
export function HdControls() {
  const s = settings.value;
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const pack = hdPack.value;
  const onPick = async (list: FileList): Promise<void> => {
    setErr(null);
    const first = list[0];
    const root = (first?.webkitRelativePath ?? '').split('/')[0] || 'HD';
    const p = await hdPackFromFiles(folderFromFileList(list).files, root);
    if (!p) {
      setErr(t('gfx.hd.packInvalid'));
      return;
    }
    hdPack.value = p;
    // wybor paczki wlacza HD, jesli gracz go jeszcze nie wlaczyl
    if (settings.value.hdMode === 'original') {
      updateSettings({ hdMode: 'hd', hdRgba: true, hdTiles: true });
    }
  };
  return (
    <fieldset class="options-hd" data-testid="options-hd">
      <legend>{t('gfx.hd.title')}</legend>
      <label>
        <span>{t('gfx.hd.mode')}</span>
        <select
          data-testid="gfx-hd-mode"
          value={s.hdMode}
          onChange={(e) => {
            const hdMode = (e.currentTarget as HTMLSelectElement).value as Settings['hdMode'];
            updateSettings(hdMode === 'original' ? { hdMode } : { hdMode, hdRgba: true });
          }}
        >
          {HD_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`gfx.hd.mode.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="gfx-hd-tiles"
          checked={s.hdTiles}
          onChange={(e) =>
            updateSettings({ hdTiles: (e.currentTarget as HTMLInputElement).checked })
          }
        />{' '}
        {t('gfx.hd.tiles')}
      </label>
      <p data-testid="gfx-hd-source">
        {pack
          ? t('gfx.hd.packLoaded', { name: pack.name, hd: pack.hdEntries, total: pack.entries })
          : t('gfx.hd.fromGame')}
      </p>
      <button type="button" data-testid="gfx-hd-pick" onClick={() => input.current?.click()}>
        {t('gfx.hd.pick')}
      </button>
      {pack && (
        <button type="button" data-testid="gfx-hd-clear" onClick={() => (hdPack.value = null)}>
          {t('gfx.hd.clear')}
        </button>
      )}
      <input
        ref={input}
        type="file"
        // @ts-expect-error webkitdirectory nie jest w typach preact
        webkitdirectory={true}
        multiple
        hidden
        data-testid="gfx-hd-input"
        onChange={(e) => {
          const list = e.currentTarget.files;
          if (list && list.length > 0) void onPick(list);
          e.currentTarget.value = '';
        }}
      />
      {err && (
        <p class="status error" role="alert" data-testid="gfx-hd-error">
          {err}
        </p>
      )}
      <p class="hint">{t('gfx.hd.hint')}</p>
    </fieldset>
  );
}

/** Sekcja "Grafika" w ustawieniach: preset, post-processing, oswietlenie 2.5D i podglad skutku. */
export function GraphicsSection() {
  const s = settings.value;
  const env = detectQualityEnv(window);
  const plan = planGraphics(s, env);
  const fx = previewKeys(plan);
  return (
    <section class="options-graphics" data-testid="options-graphics" aria-label={t('gfx.title')}>
      <h3>{t('gfx.title')}</h3>
      <label>
        <span>{t('gfx.preset')}</span>
        <select
          data-testid="gfx-preset"
          value={s.graphicsPreset}
          onChange={(e) =>
            updateSettings({
              graphicsPreset: (e.currentTarget as HTMLSelectElement)
                .value as Settings['graphicsPreset'],
            })
          }
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`gfx.preset.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="gfx-postfx"
          checked={s.postFx}
          onChange={(e) =>
            updateSettings({ postFx: (e.currentTarget as HTMLInputElement).checked })
          }
        />{' '}
        {t('gfx.postFx')}
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="gfx-lighting"
          checked={s.lighting}
          onChange={(e) =>
            updateSettings({ lighting: (e.currentTarget as HTMLInputElement).checked })
          }
        />{' '}
        {t('gfx.lighting')}
      </label>
      <HdControls />
      <p data-testid="gfx-preview">
        {t('gfx.preview')}: {t('gfx.preview.resolved')} {t(`gfx.preset.${plan.preset}`)}
        {' | '}
        {fx.length === 0 ? t('gfx.preview.none') : fx.map((k) => t(k)).join(', ')}
      </p>
    </section>
  );
}
