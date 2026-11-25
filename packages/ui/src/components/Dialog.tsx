import { useEffect, useRef } from 'preact/hooks';

export interface DialogOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface DialogProps {
  speaker: string;
  text: string;
  options: DialogOption[];
  onChoose: (id: string) => void;
}

export const Dialog = ({ speaker, text, options, onChoose }: DialogProps) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!/^[1-9]$/.test(e.key)) return;
    const option = options[Number(e.key) - 1];
    if (option && !option.disabled) onChoose(option.id);
  };

  return (
    <section role="region" aria-label={speaker} class="f2-dialog" ref={ref} onKeyDown={onKeyDown}>
      <h2 class="f2-dialog__speaker">{speaker}</h2>
      <p class="f2-dialog__text">{text}</p>
      <ol class="f2-dialog__options">
        {options.map((option, index) => (
          <li key={option.id}>
            <button
              type="button"
              class="f2-dialog__option"
              disabled={option.disabled}
              onClick={() => !option.disabled && onChoose(option.id)}
            >
              {index + 1}. {option.label}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
