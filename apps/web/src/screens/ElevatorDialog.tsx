import { Button, Modal } from '@f2/ui';
import { t } from '../i18n';
import { elevatorPrompt } from '../game/elevator-host';

/** Okno wyboru poziomu windy (przyciski 500+n w oryginale; klawiatura: cyfry 1-4, Esc anuluje). */
export function ElevatorDialog() {
  const prompt = elevatorPrompt.value;
  return (
    <Modal open={!!prompt} title={t('elevator.title')} onClose={() => prompt?.onCancel()}>
      <div
        class="f2-elevator"
        data-testid="elevator"
        onKeyDown={(e) => {
          const n = Number(e.key);
          if (prompt && Number.isInteger(n) && n >= 1 && n <= prompt.buttons.length) {
            e.preventDefault();
            prompt.onChoose(n - 1);
          }
        }}
      >
        <p>{t('elevator.hint')}</p>
        {prompt?.buttons.map((b, i) => (
          <Button
            key={i}
            variant={i === prompt.start ? 'primary' : 'secondary'}
            onPress={() => prompt.onChoose(i)}
          >
            <span data-testid={`elevator-btn-${i}`}>
              {t('elevator.floor', { n: i + 1, level: b.elevation + 1 })}
            </span>
          </Button>
        ))}
        <Button variant="secondary" onPress={() => prompt?.onCancel()}>
          {t('elevator.cancel')}
        </Button>
      </div>
    </Modal>
  );
}
