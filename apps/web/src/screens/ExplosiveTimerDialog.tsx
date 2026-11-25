import { useEffect, useState } from 'preact/hooks';
import { Button, Modal } from '@f2/ui';
import { t } from '../i18n';
import {
  FUSE_DEFAULT_SECONDS,
  FUSE_MAX_SECONDS,
  FUSE_MIN_SECONDS,
  clampFuseSeconds,
  fusePrompt,
} from '../game/explosive-host';

const PRESETS = [5, 10, 30, 60];

/** Prosty dialog wyboru czasu zapalnika (klawiatura: strzalki/cyfry/Enter/Esc, dotyk: duze przyciski). */
export function ExplosiveTimerDialog() {
  const prompt = fusePrompt.value;
  const [seconds, setSeconds] = useState(FUSE_DEFAULT_SECONDS);
  useEffect(() => {
    if (prompt) setSeconds(FUSE_DEFAULT_SECONDS);
  }, [prompt]);
  const close = () => {
    fusePrompt.value = null;
  };
  const confirm = () => prompt?.onConfirm(clampFuseSeconds(seconds));
  const step = (d: number) => setSeconds((s) => clampFuseSeconds(s + d));
  return (
    <Modal open={!!prompt} title={t('explosive.title')} onClose={close}>
      <div
        class="f2-explosive-timer"
        data-testid="explosive-timer"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirm();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      >
        <p>{t('explosive.hint', { min: FUSE_MIN_SECONDS, max: FUSE_MAX_SECONDS })}</p>
        <div class="f2-explosive-timer__row">
          <Button variant="secondary" onPress={() => step(-1)}>
            {'-'}
          </Button>
          <input
            type="number"
            data-testid="explosive-seconds"
            aria-label={t('explosive.seconds')}
            min={FUSE_MIN_SECONDS}
            max={FUSE_MAX_SECONDS}
            value={seconds}
            onInput={(e) => setSeconds(Number((e.currentTarget as HTMLInputElement).value))}
          />
          <Button variant="secondary" onPress={() => step(1)}>
            {'+'}
          </Button>
          <span>{t('explosive.unit')}</span>
        </div>
        <div class="f2-explosive-timer__row">
          {PRESETS.map((p) => (
            <Button key={p} variant="secondary" onPress={() => setSeconds(p)}>
              {t('explosive.preset', { s: p })}
            </Button>
          ))}
        </div>
        <div class="f2-explosive-timer__row">
          <Button variant="primary" onPress={confirm}>
            {t('explosive.confirm')}
          </Button>
          <Button variant="secondary" onPress={close}>
            {t('explosive.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
