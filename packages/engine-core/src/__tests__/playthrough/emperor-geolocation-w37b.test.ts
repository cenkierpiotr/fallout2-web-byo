/**
 * Headless playthrough (Fala w37b): terminal Emperora (fsempter, sfchina2), opcja Geo-Location.
 * Poziom D (bytecode fsempter.int): Node002 opcja msg 220 -> Node027 (msg 221) -> opcja 222 tylko gdy
 * 4 <= GVAR_FALLOUT_2 < 8 -> Node028 (msg 223, "97% ... Enclave compound"). Bez skutkow ubocznych.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

describe.skipIf(!GAME_DIR)('playthrough: Emperor, Geo-Location (headless)', () => {
  let p: Playthrough;
  const byId = (id: number) => p.world.map.objects.find((x) => x.id === id)!;
  const EMPEROR = 176; // sfchina2 (fsempter)
  const OPEN = 0x800 | 0x1000 | 0x2000 | 0x4000;
  const setup = async (fallout2: number) => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter('sfchina2');
    p.setGvar('GVAR_SAN_FRAN_FLAGS', OPEN);
    p.setGvar('GVAR_FALLOUT_2', fallout2);
  };
  afterEach(async () => {
    await p?.close();
  });

  it('GVAR_FALLOUT_2 w [4,8): Geo-Location oferuje opcje z wioskami i pokazuje 97% Enclave, bez zmian gvarow', async () => {
    await setup(5);
    const xp0 = p.xp();
    const karma0 = p.gvar('GVAR_PLAYER_REPUTATION');
    const r = p.talk(byId(EMPEROR), [/CSPDMSHR/, /Geo-Location/, /villagers from my home/]);
    expect(r.history.join('\n')).toMatch(/97%/);
    expect(p.xp()).toBe(xp0);
    expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(karma0);
    expect(p.gvar('GVAR_FALLOUT_2')).toBe(5);
  }, 200_000);

  it('GVAR_FALLOUT_2 = 0: opcja Geo-Location jest, ale podopcja 97% niedostepna', async () => {
    await setup(0);
    const r = p.talk(byId(EMPEROR), [/CSPDMSHR/, /Geo-Location/]);
    expect(r.history.join('\n')).not.toMatch(/villagers from my home/);
  }, 200_000);

  describe('karma i reputacja w NodeTanker2120 / NodeElron20 (D z bytecodu)', () => {
    const FUEL = [/CSPDMSHR/, /Database/, /Chemistry/, /Fuel/];
    it('Hubologists: karma -25, reputacja San Francisco -5', async () => {
      await setup(0);
      p.setGvar('GVAR_SAN_FRAN_FLAGS', OPEN | 0x10000);
      p.setGvar('GVAR_SAN_FRAN_TANKER', 1);
      const k0 = p.gvar('GVAR_PLAYER_REPUTATION');
      const t0 = p.gvar('GVAR_TOWN_REP_SAN_FRANCISCO');
      p.talk(byId(EMPEROR), [...FUEL, /Hubologists/]);
      expect(p.gvar('GVAR_PLAYER_REPUTATION') - k0).toBe(-25);
      expect(p.gvar('GVAR_TOWN_REP_SAN_FRANCISCO') - t0).toBe(-5);
    }, 200_000);

    it('Poseidon tanker: karma +5, reputacja San Francisco bez zmian', async () => {
      await setup(0);
      p.setGvar('GVAR_SAN_FRAN_FLAGS', OPEN | 0x10000);
      p.setGvar('GVAR_SAN_FRAN_TANKER', 1);
      const k0 = p.gvar('GVAR_PLAYER_REPUTATION');
      const t0 = p.gvar('GVAR_TOWN_REP_SAN_FRANCISCO');
      p.talk(byId(EMPEROR), [...FUEL, /Poseidon/]);
      expect(p.gvar('GVAR_PLAYER_REPUTATION') - k0).toBe(5);
      expect(p.gvar('GVAR_TOWN_REP_SAN_FRANCISCO') - t0).toBe(0);
    }, 200_000);
  });
});
