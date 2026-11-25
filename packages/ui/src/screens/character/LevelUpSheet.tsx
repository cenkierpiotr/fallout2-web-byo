import { Button } from '../../components/Button';
import { t, tn } from '../../i18n';
import { ResponsiveDialog } from './ResponsiveDialog';
import type { PlayerView } from './types';

export interface LevelUpSheetProps {
  open: boolean;
  player: PlayerView;
  onConfirm: () => void;
  onClose: () => void;
  /** Skorka FRM: zielona ramka i cele min 44px. */
  art?: boolean;
}

/** Podsumowanie awansu: na dotyku jako bottom sheet, na desktopie jako modal. */
export const LevelUpSheet = ({
  open,
  player,
  onConfirm,
  onClose,
  art = false,
}: LevelUpSheetProps) => (
  <ResponsiveDialog
    open={open}
    title={t('character.levelUp.title', { level: player.level })}
    onClose={onClose}
  >
    <div class={`f2-char__levelup${art ? ' f2-char__dialog--art' : ''}`} data-testid="levelup">
      <ul>
        <li>{t('character.levelUp.hp', { hp: player.hpMax })}</li>
        <li>{tn('character.levelUp.skillPoints', player.skillPoints)}</li>
        {player.unspentPerks > 0 && <li>{t('character.levelUp.perk')}</li>}
      </ul>
      <div class="f2-char__actions">
        <Button variant="secondary" onPress={onClose}>
          {t('character.levelUp.later')}
        </Button>
        <Button variant="primary" onPress={onConfirm}>
          {t('character.levelUp.confirm')}
        </Button>
      </div>
    </div>
  </ResponsiveDialog>
);
