import type { ComponentChildren } from 'preact';
import { Modal } from '../../components/Modal';
import { Sheet } from '../../components/Sheet';
import { useTheme } from '../../theme/ThemeProvider';

export interface ResponsiveDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ComponentChildren;
}

/** Profil dotykowy: arkusz od dolu (bottom sheet); desktop: okno modalne. */
export const ResponsiveDialog = ({ open, title, onClose, children }: ResponsiveDialogProps) => {
  const { profile } = useTheme();
  if (profile === 'touch') {
    return (
      <Sheet open={open} onClose={onClose} snap="full">
        <h2 class="f2-char__dialog-title">{title}</h2>
        {children}
      </Sheet>
    );
  }
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {children}
    </Modal>
  );
};
