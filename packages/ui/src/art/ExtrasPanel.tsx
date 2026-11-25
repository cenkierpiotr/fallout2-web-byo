import type { ComponentChildren } from 'preact';
import './art.css';

export function ExtrasPanel(props: { title: string; children?: ComponentChildren }) {
  return (
    <section class="f2-art-extras">
      <h3 class="f2-art-extras__title">{props.title}</h3>
      <div class="f2-art-extras__body">{props.children}</div>
    </section>
  );
}
