import { describe, expect, it } from 'vitest';
import { elevatorButtons, elevatorPrompt, openElevatorPrompt } from './elevator-host';

describe('elevator-host', () => {
  it('przyciski wg tabeli 0x43ea1c: typ 0 ma 4, typ 1 ma 2, typ spoza tabeli 0', () => {
    expect(elevatorButtons(0)).toHaveLength(4);
    expect(elevatorButtons(1)).toHaveLength(2);
    expect(elevatorButtons(99)).toHaveLength(0);
  });
  it('wybor przycisku wola go z celem i flaga tej samej mapy', () => {
    const calls: unknown[] = [];
    const ok = openElevatorPrompt(
      { type: 0, level: 0 },
      { currentMapIndex: () => 14, go: (d, same) => calls.push([d, same]) },
    );
    expect(ok).toBe(true);
    elevatorPrompt.value!.onChoose(1);
    expect(calls).toEqual([[{ map: 14, elevation: 1, tile: 18936 }, true]]);
    expect(elevatorPrompt.value).toBeNull();
    openElevatorPrompt(
      { type: 0, level: 0 },
      { currentMapIndex: () => 14, go: (d, s) => calls.push([d, s]) },
    );
    elevatorPrompt.value!.onChoose(2);
    expect(calls[1]).toEqual([{ map: 15, elevation: 0, tile: 21340 }, false]);
  });
  it('Esc zamyka bez przejscia; typ nieznany nie otwiera okna', () => {
    const calls: unknown[] = [];
    const deps = { currentMapIndex: () => 1, go: () => calls.push(1) };
    expect(openElevatorPrompt({ type: 50, level: 0 }, deps)).toBe(false);
    openElevatorPrompt({ type: 1, level: 0 }, deps);
    elevatorPrompt.value!.onCancel();
    expect(elevatorPrompt.value).toBeNull();
    expect(calls).toEqual([]);
  });
});
