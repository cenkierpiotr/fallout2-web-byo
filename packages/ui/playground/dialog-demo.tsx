import { useMemo } from 'preact/hooks';
import { DialogScreen, createMockDialog, sampleDialog } from '../src';

const params = new URLSearchParams(location.search);

/** Widok ?view=dialog[&percent=1&reactions=1&profile=touch] na atrapie magazynu; log komend w window.__dialogLog. */
export function DialogDemo() {
  const mock = useMemo(() => createMockDialog(sampleDialog()), []);
  (window as unknown as { __dialogLog: string[] }).__dialogLog = mock.log;
  const profile = params.get('profile') === 'touch' ? 'touch' : 'desktop';
  return (
    <div style={{ position: 'relative', height: '100vh' }} data-testid="dialog-stage">
      <DialogScreen
        view={{ dialog: mock.dialog }}
        commands={mock.commands}
        profile={profile}
        showSkillCheckPercent={params.get('percent') === '1'}
        showReactions={params.get('reactions') === '1'}
      />
    </div>
  );
}
