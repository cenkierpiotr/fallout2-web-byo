import { useRef } from 'preact/hooks';
import { t } from '../../i18n';
import type { ViewState } from '../../state/view';

export function PreviewControls({ view }: { view: ViewState }) {
  const dirsRef = useRef<HTMLDivElement>(null);

  const dirFromPointer = (e: PointerEvent) => {
    const el = dirsRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * 6);
    view.dir.value = Math.min(5, Math.max(0, i));
  };

  return (
    <div class="controls">
      <div
        class="dirs"
        ref={dirsRef}
        role="group"
        aria-label={t('browser.direction')}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dirFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) dirFromPointer(e);
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((d) => (
          <button
            type="button"
            key={d}
            data-testid={`dir-${d}`}
            aria-pressed={view.dir.value === d}
            aria-label={`${t('browser.direction')} ${d}`}
            onClick={() => (view.dir.value = d)}
          >
            {d}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={view.playing.value}
        onClick={() => (view.playing.value = !view.playing.value)}
      >
        {view.playing.value ? t('browser.pause') : t('browser.play')}
      </button>
      <label>
        {t('browser.zoom')}
        <input
          type="range"
          data-testid="zoom-slider"
          min="0.5"
          max="4"
          step="0.1"
          value={view.zoom.value}
          onInput={(e) => (view.zoom.value = Number(e.currentTarget.value))}
        />
        <span>{view.zoom.value.toFixed(1)}x</span>
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="integer-zoom"
          checked={view.integerZoom.value}
          onChange={(e) => (view.integerZoom.value = e.currentTarget.checked)}
        />
        {t('browser.integerZoom')}
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="color-cycle"
          checked={view.colorCycle.value}
          onChange={(e) => (view.colorCycle.value = e.currentTarget.checked)}
        />
        {t('browser.colorCycle')}
      </label>
      <span class="muted" data-testid="frame-counter">
        {t('browser.frame', { frame: view.frame.value + 1, frames: view.frames.value })}
      </span>
      <span class="muted">{t('browser.fps', { fps: view.fps.value })}</span>
      {import.meta.env.DEV && (
        <label>
          <input
            type="checkbox"
            data-testid="stress-100"
            checked={view.stress.value}
            onChange={(e) => (view.stress.value = e.currentTarget.checked)}
          />
          x100
        </label>
      )}
    </div>
  );
}
