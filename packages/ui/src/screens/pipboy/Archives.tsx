import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { paginateHolodisk } from './adapter';
import type { PipboyHolodisk, PipboyView } from './types';

export interface ArchivesTabProps {
  holodisks: PipboyHolodisk[] | undefined;
  karma: PipboyView['karma'];
}

/** Archiwa: lista holodyskow, czytnik stronicowany (35 wierszy), tytuly karmy. */
export function ArchivesTab({ holodisks, karma }: ArchivesTabProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const disk = holodisks?.find((h) => h.id === openId);

  if (disk) {
    const pages = paginateHolodisk(disk.text);
    return (
      <div class="f2-pipboy__reader" data-testid="pipboy-holodisk">
        <h3 class="f2-pipboy__heading">{disk.title}</h3>
        <pre class="f2-pipboy__page" data-testid="pipboy-holodisk-page">
          {pages[page] ?? ''}
        </pre>
        <div class="f2-pipboy__pager" data-testid="pipboy-holodisk-pager">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('pipboy.archives.prev')}
          </button>
          {pages.length > 1 ? <span>{`${page + 1}/${pages.length}`}</span> : null}
          <button
            type="button"
            disabled={page >= pages.length - 1}
            onClick={() => setPage(page + 1)}
          >
            {t('pipboy.archives.next')}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenId(null);
              setPage(0);
            }}
          >
            {t('pipboy.archives.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="f2-pipboy__archives" data-testid="pipboy-archives">
      {holodisks && holodisks.length > 0 ? (
        <ul class="f2-pipboy__list">
          {holodisks.map((h) => (
            <li key={h.id}>
              <button type="button" class="f2-pipboy__link" onClick={() => setOpenId(h.id)}>
                {h.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p class="f2-pipboy__placeholder" data-testid="pipboy-placeholder-archives">
          {t('pipboy.placeholder.archives')}
        </p>
      )}
      {karma ? (
        <section data-testid="pipboy-karma">
          <h3 class="f2-pipboy__heading">{t('pipboy.karma.title', { value: karma.value })}</h3>
          <ul class="f2-pipboy__list">
            {karma.titles.map((k, i) => (
              <li key={i}>
                <strong>{k.name}</strong>: {k.description}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
