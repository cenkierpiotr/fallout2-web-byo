import { afterEach, describe, expect, it } from 'vitest';
import { LocalTelemetry } from './telemetry';
import { getTelemetry, resetTelemetryForTests } from './singleton';

describe('getTelemetry', () => {
  afterEach(resetTelemetryForTests);

  it('zwraca ten sam singleton LocalTelemetry', () => {
    const a = getTelemetry();
    expect(a).toBeInstanceOf(LocalTelemetry);
    expect(getTelemetry()).toBe(a);
  });

  it('po resecie tworzy nowa instancje, brak IndexedDB nie psuje (cichy no-op)', async () => {
    const a = getTelemetry();
    resetTelemetryForTests();
    expect(getTelemetry()).not.toBe(a);
    getTelemetry().record({ kind: 'save', data: { slot: 'q' } });
    expect(await getTelemetry().query({ kind: 'save' })).toHaveLength(1);
  });
});
