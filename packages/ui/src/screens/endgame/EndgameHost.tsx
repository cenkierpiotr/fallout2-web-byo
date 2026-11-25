import type { ReadonlySignal } from '@preact/signals';
import { CreditsScreen } from './CreditsScreen';
import { DeathScreen } from './DeathScreen';
import { EndgameScreen } from './EndgameScreen';
import { MainMenuScreen } from './MainMenuScreen';
import type { ArtUrl, EndgameCommands, EndgameView } from './types';

export interface EndgameHostProps {
  view: ReadonlySignal<EndgameView>;
  commands: EndgameCommands;
  artUrl?: ArtUrl;
  version?: string;
  canQuit?: boolean;
}

/** Wybiera ekran wg `view.screen`; ekran 'game' nie renderuje nic (gra pod spodem). */
export function EndgameHost({ view, commands, artUrl, version, canQuit }: EndgameHostProps) {
  switch (view.value.screen) {
    case 'endgame':
      return <EndgameScreen view={view} commands={commands} {...(artUrl ? { artUrl } : {})} />;
    case 'death':
      return <DeathScreen view={view} commands={commands} {...(artUrl ? { artUrl } : {})} />;
    case 'credits':
      return <CreditsScreen view={view} commands={commands} />;
    case 'main-menu':
      return (
        <MainMenuScreen
          view={view}
          commands={commands}
          {...(version ? { version } : {})}
          {...(canQuit !== undefined ? { canQuit } : {})}
        />
      );
    default:
      return null;
  }
}
