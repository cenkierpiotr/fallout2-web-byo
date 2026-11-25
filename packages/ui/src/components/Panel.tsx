import type { ComponentChildren } from 'preact';

export interface PanelProps {
  title?: string;
  class?: string;
  children?: ComponentChildren;
}

export const Panel = ({ title, class: className = '', children }: PanelProps) => (
  <section class={`f2-panel ${className}`.trim()}>
    {title && <h2 class="f2-panel__title">{title}</h2>}
    {children}
  </section>
);
