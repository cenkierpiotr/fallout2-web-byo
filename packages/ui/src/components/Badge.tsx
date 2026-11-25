import type { ComponentChildren } from 'preact';

export type BadgeTone = 'neutral' | 'ok' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children?: ComponentChildren;
}

export const Badge = ({ tone = 'neutral', children }: BadgeProps) => (
  <span class={`f2-badge f2-badge--${tone}`}>{children}</span>
);
