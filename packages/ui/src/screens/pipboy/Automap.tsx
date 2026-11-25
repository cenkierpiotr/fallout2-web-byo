import { useEffect, useMemo, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { countRevealed, isTileRevealed } from './adapter';
import type { PipboyAutomapView } from './types';

const CELL = 4;

/** Automapa: odkryte kafle rysowane na canvasie (bitmapa 1 bit na kafel). */
export function AutomapTab({ automap }: { automap: PipboyAutomapView | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const revealed = useMemo(() => (automap ? countRevealed(automap.bits) : 0), [automap]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !automap) return;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    ctx.fillStyle = '#05140a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3cff7a';
    for (let y = 0; y < automap.height; y++)
      for (let x = 0; x < automap.width; x++)
        if (isTileRevealed(automap.bits, automap.width, x, y))
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }, [automap]);

  if (!automap) {
    return (
      <p class="f2-pipboy__placeholder" data-testid="pipboy-placeholder-map">
        {t('pipboy.placeholder.map')}
      </p>
    );
  }
  return (
    <figure class="f2-pipboy__automap" data-testid="pipboy-automap" data-revealed={revealed}>
      <canvas
        ref={ref}
        width={automap.width * CELL}
        height={automap.height * CELL}
        role="img"
        aria-label={t('pipboy.map.alt', { count: revealed })}
      />
      <figcaption>
        {automap.mapName ?? ''} {t('pipboy.map.elevation', { level: (automap.elevation ?? 0) + 1 })}
      </figcaption>
    </figure>
  );
}
