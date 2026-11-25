import { useEffect, useMemo, useState } from 'preact/hooks';
import { client } from '../../state/game-folder';
import { t } from '../../i18n';
import { ensureAudio, audioError, type AudioBundle } from '../../audio/audio-state';
import { FrmList, type FrmItem } from '../asset-browser/FrmList';

const label = (key: string): string => key.replace(/^sound\//, '').toUpperCase();

/** Lokalne odtwarzanie ACM z master.dat: lista, podglad z synchronizacja ust (dla mowy). */
export function SoundBrowser() {
  const c = client.value;
  const [bundle, setBundle] = useState<AudioBundle | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!c) return;
    let dead = false;
    ensureAudio(c).then(
      (b) => {
        if (!dead) setBundle(b);
      },
      (e: unknown) => {
        audioError.value = e instanceof Error ? e.message : String(e);
      },
    );
    return () => {
      dead = true;
      bundle?.dialog.close();
    };
  }, [c]);

  const all = useMemo<FrmItem[]>(
    () =>
      (bundle?.rvfs.keys('sound/') ?? [])
        .filter((k) => k.endsWith('.acm'))
        .sort()
        .map((k) => ({ label: label(k), path: k })),
    [bundle],
  );
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((x) => x.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  if (!c) return null;
  const d = bundle?.dialog;
  const play = (path: string): void => {
    setSelected(path);
    if (!bundle) return;
    void bundle.system.resume();
    const lip = path.replace(/\.acm$/, '.lip');
    void bundle.dialog.show({
      speechPath: path,
      ...(bundle.rvfs.has(lip) ? { lipPath: lip } : {}),
      subtitle: label(path),
    });
  };
  const state = d?.speaking.value ? 'playing' : 'stopped';
  return (
    <div class="browser sound-browser">
      <aside class="list-pane">
        <input
          type="search"
          placeholder={t('browser.search')}
          aria-label={t('browser.search')}
          data-testid="sound-search"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        {audioError.value && (
          <p class="error">{t('error.generic', { message: audioError.value })}</p>
        )}
        <FrmList items={items} selected={selected} onSelect={play} />
      </aside>
      <section class="stage" role="status">
        <p data-testid="sound-count">{t('sound.count', { count: items.length })}</p>
        <p data-testid="sound-state" data-state={state}>
          {t(`sound.${state}`)}
        </p>
        {d && (
          <>
            <p data-testid="sound-duration">
              {t('sound.duration', { ms: Math.round(d.durationMs.value) })}
            </p>
            <p data-testid="sound-lip" data-has-lip={d.hasLip.value}>
              {t('sound.mouth', { frame: d.mouth.value })}
            </p>
            {d.error.value && (
              <p class="error" data-testid="sound-error">
                {d.error.value}
              </p>
            )}
            <button type="button" data-testid="sound-stop" onClick={() => d.close()}>
              {t('sound.stop')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
