import type { ComponentChildren } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant: ButtonVariant;
  size?: ButtonSize | undefined;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
  onPress: () => void;
  children?: ComponentChildren;
}

export const Button = ({
  variant,
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel,
  'data-testid': testId,
  onPress,
  children,
}: ButtonProps) => {
  if (import.meta.env.DEV && variant === 'icon' && !ariaLabel) {
    throw new Error('Button variant="icon" requires aria-label');
  }
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={() => {
        if (!disabled) onPress();
      }}
      class={`f2-button f2-button--${variant} f2-button--${size}`}
    >
      {children}
    </button>
  );
};
