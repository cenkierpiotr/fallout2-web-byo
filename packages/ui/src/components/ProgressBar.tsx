export type ProgressBarTone = 'hp' | 'ap' | 'weight' | 'neutral';

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  tone: ProgressBarTone;
}

export const ProgressBar = ({ value, max, label, tone }: ProgressBarProps) => {
  const v = Math.min(Math.max(value, 0), max);
  const percent = max <= 0 ? 0 : (v / max) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={v}
      class={`f2-progress f2-progress--${tone}`}
    >
      <div class="f2-progress__fill" style={{ width: `${percent}%` }} />
      <span class="f2-progress__text">{`${v} / ${max}`}</span>
    </div>
  );
};
