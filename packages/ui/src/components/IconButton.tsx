import { Icon, type IconName } from '../icons';
import { Button, type ButtonProps } from './Button';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: ButtonProps['size'];
}

export const IconButton = ({ icon, label, onPress, size }: IconButtonProps) => (
  <Button variant="icon" onPress={onPress} aria-label={label} size={size}>
    <Icon name={icon} />
  </Button>
);
