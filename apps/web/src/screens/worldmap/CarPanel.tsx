import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { WorldmapController } from '../../game/worldmap/worldmap-controller';
import type { TrunkBridge } from '../../game/trunk-bridge';
import { FUEL_CELL_PID } from '@f2/engine-core';

export interface CarPanelProps {
  controller: WorldmapController;
  /** Most do ekwipunku; brak = bagaznik tylko do podgladu. */
  trunk?: TrunkBridge | undefined;
  /** Wolane po zmianie (start/parkowanie/bagaznik), zeby ekran mapy odswiezyl widok. */
  onChange?: () => void;
}

const btn = { minHeight: 44 } as const;

/** Panel samochodu na mapie swiata: paliwo, parkowanie, bagaznik (wlozenie/wyjecie tylko gdy auto stoi w biezacym obszarze). */
export function CarPanel({ controller, trunk, onChange }: CarPanelProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const v = controller.carPanel();
  if (!v) return null;
  const done = (): void => onChange?.();
  const where =
    v.moving || v.parkedArea < 0
      ? t('car.driving')
      : t('car.parkedIn', {
          name: controller.data.areas[v.parkedArea]?.name ?? `#${v.parkedArea}`,
        });
  const carried = v.trunkAccessible ? (trunk?.items() ?? []) : [];
  return (
    <div data-testid="worldmap-carpanel">
      <button
        type="button"
        data-testid="worldmap-car-open"
        aria-expanded={open}
        style={{ ...btn, width: '100%' }}
        onClick={() => setOpen((o) => !o)}
      >
        {t('car.open')} | {t('car.fuel')}: {v.fuelPct}%
      </button>
      {open && (
        <div data-testid="worldmap-car-body">
          <div data-testid="worldmap-car-where">{where}</div>
          <div
            role="meter"
            data-testid="worldmap-car-fuelbar"
            aria-label={t('car.fuel')}
            aria-valuemin={0}
            aria-valuemax={v.fuelMax}
            aria-valuenow={v.fuel}
            style={{ height: 10, background: '#222', border: '1px solid #888' }}
          >
            <div
              style={{
                height: '100%',
                width: `${v.fuelPct}%`,
                background: v.fuelPct < 15 ? '#c33' : '#3c3',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="worldmap-car-start"
              style={btn}
              disabled={!v.canStart}
              onClick={() => {
                controller.startCar();
                done();
              }}
            >
              {t('car.start')}
            </button>
            <button
              type="button"
              data-testid="worldmap-car-park"
              style={btn}
              disabled={!v.canPark}
              onClick={() => {
                controller.parkCar();
                done();
              }}
            >
              {t('car.park')}
            </button>
          </div>
          <h4>
            {t('car.trunk')} ({t('car.trunkCount', { n: v.trunkUsed, max: v.trunkCapacity })})
          </h4>
          {!v.trunkAccessible && (
            <p data-testid="worldmap-trunk-locked">{t('car.trunkUnavailable')}</p>
          )}
          {v.trunkAccessible && (
            <div data-testid="worldmap-trunk">
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {v.trunk.map((i) => (
                  <li key={i.pid} data-testid={`worldmap-trunk-item-${i.pid}`}>
                    {trunk?.nameOf(i.pid) ?? `#${i.pid}`} x{i.count}{' '}
                    <button
                      type="button"
                      data-testid={`worldmap-trunk-take-${i.pid}`}
                      style={btn}
                      onClick={() => {
                        setNote(trunk && trunk.retrieve(i.pid, 1) <= 0 ? t('car.tooHeavy') : null);
                        done();
                      }}
                    >
                      {t('car.takeOne')}
                    </button>
                    <button
                      type="button"
                      data-testid={`worldmap-trunk-takeall-${i.pid}`}
                      style={btn}
                      onClick={() => {
                        setNote(
                          trunk && trunk.retrieve(i.pid, i.count) <= 0 ? t('car.tooHeavy') : null,
                        );
                        done();
                      }}
                    >
                      {t('car.takeAll')}
                    </button>
                  </li>
                ))}
              </ul>
              {v.trunk.length === 0 && <p>{t('car.trunkEmpty')}</p>}
              <h5>{t('car.carried')}</h5>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {carried.map((i) => (
                  <li key={i.id} data-testid={`worldmap-carried-${i.id}`}>
                    {i.name} x{i.count}{' '}
                    {i.pid === FUEL_CELL_PID && (
                      <button
                        type="button"
                        data-testid={`worldmap-refuel-${i.id}`}
                        style={btn}
                        onClick={() => {
                          setNote(trunk?.refuel(i.id) ? null : t('car.refuelFailed'));
                          done();
                        }}
                      >
                        {t('car.refuel')}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`worldmap-trunk-stow-${i.id}`}
                      style={btn}
                      onClick={() => {
                        setNote(trunk?.stow(i.id, 1) ? null : t('car.stowFailed'));
                        done();
                      }}
                    >
                      {t('car.stowOne')}
                    </button>
                    <button
                      type="button"
                      data-testid={`worldmap-trunk-stowall-${i.id}`}
                      style={btn}
                      onClick={() => {
                        setNote(trunk?.stow(i.id, i.count) ? null : t('car.stowFailed'));
                        done();
                      }}
                    >
                      {t('car.stowAll')}
                    </button>
                  </li>
                ))}
              </ul>
              {carried.length === 0 && <p>{t('car.noItems')}</p>}
              {note && (
                <p role="alert" data-testid="worldmap-trunk-note">
                  {note}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
