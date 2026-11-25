export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, label, disabled }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    class="f2-toggle"
  >
    <span class="f2-toggle__track">
      <span class="f2-toggle__thumb" />
    </span>
    <span class="f2-toggle__label">{label}</span>
  </button>
);
