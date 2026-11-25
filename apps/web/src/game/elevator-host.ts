import { signal } from '@preact/signals';
import {
  ELEVATOR_EXITS,
  elevatorDestination,
  elevatorStartButton,
  type ElevatorDestination,
} from '@f2/engine-core';

/** Zapytanie o poziom windy (okno 0x43f324), pokazywane przez `ElevatorDialog`. */
export interface ElevatorPrompt {
  type: number;
  /** Poczatkowo zaznaczony przycisk (0x43ef5c). */
  start: number;
  /** Cele przyciskow 0..n-1 (n = tabela 0x43ea1c). */
  buttons: readonly ElevatorDestination[];
  onChoose(button: number): void;
  onCancel(): void;
}
export const elevatorPrompt = signal<ElevatorPrompt | null>(null);

/** Cele wszystkich przyciskow danego typu windy (pusta lista dla typu spoza 0..23). */
export function elevatorButtons(type: number): ElevatorDestination[] {
  const rows = ELEVATOR_EXITS[type] ?? [];
  const out: ElevatorDestination[] = [];
  for (let i = 0; i < rows.length; i++) {
    const d = elevatorDestination(type, i);
    if (d) out.push(d);
  }
  return out;
}

export interface ElevatorRequest {
  type: number;
  level: number;
}

export interface ElevatorHostDeps {
  currentMapIndex(): number;
  /** Wykonanie przejscia: ta sama mapa => zmiana kafla/kondygnacji, inna => ladowanie mapy. */
  go(dest: ElevatorDestination, sameMap: boolean): void;
}

/**
 * Otwiera okno windy dla zgloszenia ze skryptu (metarule 15). Typ spoza tabeli (0x43ef5c zwraca -1)
 * nie otwiera okna. Wybor przycisku => `go`; Esc zostawia wyjscie bez zmian (D).
 */
export function openElevatorPrompt(req: ElevatorRequest, deps: ElevatorHostDeps): boolean {
  const buttons = elevatorButtons(req.type);
  if (buttons.length === 0) return false;
  const here = deps.currentMapIndex();
  elevatorPrompt.value = {
    type: req.type,
    start: elevatorStartButton(req.type, here, req.level),
    buttons,
    onChoose: (n) => {
      const dest = buttons[n];
      elevatorPrompt.value = null;
      if (dest) deps.go(dest, dest.map === here);
    },
    onCancel: () => {
      elevatorPrompt.value = null;
    },
  };
  return true;
}
