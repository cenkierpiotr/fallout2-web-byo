/**
 * Headless playthrough, NCR: Roger Westin (NCR3) i problem z brahminami (NCR4). Westin zleca sprawdzenie nocnych
 * napadow (GVAR_NCR_BRAHMIN_QST=1), Felix (NCR3) zabiera gracza na zachodni pastwisko (load_map NCR4,
 * GVAR_NCR_BRAHMIN_PROTECT=1). Na NCR4 stoja dwa krytery Gruthar (po 1200 XP za zabicie). Po powrocie Westin placi
 * 1000 XP, reputacja +15 (miasto +5), QST=2. Opcja "Bad things come..." jest widoczna tylko przy bardzo niskim INT.
 * Opis: dokumentacja techniczna
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const WESTIN = 226;
const FELIX = 36;

describe.skipIf(!GAME_DIR)('playthrough: NCR, Westin i brahminy (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
    await p.enter('NCR3');
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  const accept = () => p.talk(byId(WESTIN), [/Vault 13/, /good idea/, 0]);
  const toPasture = async () => {
    accept();
    p.talk(byId(FELIX), [/brahmin/, 0]);
    expect(await p.followLoadMap()).toBe('NCR4');
    p.tick(20);
  };
  const gruthars = () =>
    p.world.map.objects.filter((o) => o.type === 1 && /Gruthar/.test(p.rt.objName(o.id)));

  it('Westin zleca zadanie: QST=1, FELIX_SEED=2, brak bledow VM', () => {
    const mark = p.logMark();
    const r = accept();
    expect(r.history.join('\n')).toMatch(/raiding my brahmin/);
    expect(p.gvar('GVAR_NCR_BRAHMIN_QST')).toBe(1);
    expect(p.gvar('GVAR_NCR_FELIX_SEED')).toBe(2);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Felix prowadzi na pastwisko (NCR4): PROTECT=1, dwa Grutharzy, brahminy', async () => {
    const mark = p.logMark();
    await toPasture();
    expect(p.mapName()).toBe('NCR4');
    expect(p.gvar('GVAR_NCR_BRAHMIN_PROTECT')).toBe(1);
    expect(gruthars()).toHaveLength(2);
    expect(p.problems(mark)).toEqual([]);
  });

  it('zabicie Grutharow: 2 x 1200 XP, FELIX_SEED 14, powrot do Westina: 1000 XP, reputacja, QST=2', async () => {
    const mark = p.logMark();
    await toPasture();
    const x0 = p.xp();
    for (const g of gruthars()) expect(p.kill(g)).toEqual({ died: true, xp: 1200 });
    p.tick(20);
    expect(p.xp() - x0).toBe(2400);
    expect(p.gvar('GVAR_NCR_FELIX_SEED')).toBe(14);
    await p.enter('NCR3');
    const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
    const x1 = p.xp();
    const r = p.talk(byId(WESTIN), [/brahmin problem/, /Thanks/]);
    expect(r.history.join('\n')).toMatch(/Vaultdweller/);
    expect(p.xp() - x1).toBe(1000);
    expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(rep0 + 15);
    expect(p.gvar('GVAR_TOWN_REP_NCR')).toBe(5);
    expect(p.gvar('GVAR_NCR_BRAHMIN_QST')).toBe(2);
    const x2 = p.xp();
    p.talk(byId(WESTIN), [0]);
    expect(p.xp() - x2).toBe(0); // nagroda tylko raz
    expect(p.problems(mark)).toEqual([]);
  });

  it('bez zabicia Grutharow opcja o rozwiazaniu jest niewidoczna (brak XP, QST zostaje 1)', async () => {
    await toPasture();
    await p.enter('NCR3');
    const x1 = p.xp();
    const early = p.talk(byId(WESTIN), [/brahmin problem/]);
    expect(early.history.join('\n')).not.toMatch(/Vaultdweller/);
    expect(p.xp() - x1).toBe(0);
    expect(p.gvar('GVAR_NCR_BRAHMIN_QST')).toBe(1);
  });

  it('INT 2: widoczna odpowiedz "Bad things come" konczy zadanie jak ostrzezenie', async () => {
    await toPasture();
    await p.enter('NCR3');
    p.setStat(4, 2);
    const mark = p.logMark();
    const r = p.talk(byId(WESTIN), [/Bad things come/, 0, 0]);
    expect(r.started).toBe(true);
    expect(r.history.join('\n')).toMatch(/Bad things come/);
    expect(p.problems(mark)).toEqual([]);
  });

  describe('holodysk dla Lynette (GVAR_VAULT_DELIVER_HOLODISK=1)', () => {
    const DISK = 0x152; // holodysk Westina dla Lynette
    const BISHOP_DISK = 0x1bf; // holodysk Bishopa, ktory Lynette kazala zanies Westinowi
    const GREETINGS = /Lynette sends her greetings/;
    // pierwsza rozmowa (powitanie "I'm Roger Westin") nie pokazuje opcji o pozdrowieniach, dopiero kolejne
    beforeEach(async () => {
      p.talk(byId(WESTIN), [/Oops/]);
      await p.give(BISHOP_DISK);
    });

    it('obywatel Vault City: 2000 XP, reputacja +5, DELIVER=3, dysk 0x152 w ekwipunku', () => {
      const mark = p.logMark();
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 1);
      p.setGvar('GVAR_VAULT_CITIZEN', 4);
      p.setGvar('GVAR_VAULT_CITIZENSHIP', 1);
      const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
      const x0 = p.xp();
      const r = p.talk(byId(WESTIN), [GREETINGS, /Yes\./, /Yes, sir/]);
      expect(r.history.join('\n')).toMatch(/take this holodisk back to the 1st Citizen/);
      expect(p.xp() - x0).toBe(2000);
      expect(p.gvar('GVAR_PLAYER_REPUTATION')).toBe(rep0 + 5);
      expect(p.gvar('GVAR_VAULT_DELIVER_HOLODISK')).toBe(3);
      expect(p.gvar('GVAR_NCR_LYNETTE_HOLO_QST')).toBe(1);
      expect(p.count(DISK)).toBe(1);
      expect(p.count(BISHOP_DISK)).toBe(0); // Westin zabral dysk Bishopa
      expect(p.problems(mark)).toEqual([]);
    });

    it('nie-obywatel: te same 2000 XP, ale bez dysku (nie ma co zanosic)', () => {
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 1);
      const x0 = p.xp();
      const r = p.talk(byId(WESTIN), [GREETINGS, /No\./]);
      expect(r.history.join('\n')).toMatch(/that's all/);
      expect(p.xp() - x0).toBe(2000);
      expect(p.gvar('GVAR_VAULT_DELIVER_HOLODISK')).toBe(3);
      expect(p.count(DISK)).toBe(0);
    });

    it('bez dysku Bishopa opcja o pozdrowieniach jest niewidoczna mimo DELIVER=1', () => {
      const bishop = p.player.inventory.find((o) => o.pid === BISHOP_DISK)!;
      p.player.inventory.splice(p.player.inventory.indexOf(bishop), 1);
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 1);
      const x0 = p.xp();
      const r = p.talk(byId(WESTIN), [GREETINGS]);
      expect(r.history.join('\n')).not.toMatch(/Are you a Vault Citizen/);
      expect(p.xp() - x0).toBe(0);
    });

    it('bez zlecenia od Lynette opcja o pozdrowieniach jest niewidoczna', () => {
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 0);
      const x0 = p.xp();
      const r = p.talk(byId(WESTIN), [GREETINGS]);
      expect(r.started).toBe(true);
      expect(r.history.join('\n')).not.toMatch(/Are you a Vault Citizen/);
      expect(p.xp() - x0).toBe(0);
    });

    it('caly lancuch: dysk z NCR3 zanosimy do Lynette, ktora go zabiera i placi 1500 XP', async () => {
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 1);
      p.setGvar('GVAR_VAULT_CITIZEN', 4);
      p.setGvar('GVAR_VAULT_CITIZENSHIP', 1);
      p.talk(byId(WESTIN), [GREETINGS, /Yes\./, /Yes, sir/]);
      expect(p.count(DISK)).toBe(1);
      await p.enter('VCTYCOCL');
      const lynette = byId(18);
      p.talk(lynette, [/don.t have time/]);
      p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 3);
      const mark = p.logMark();
      const x0 = p.xp();
      p.talk(lynette, [
        /another question|holo disk/,
        /holo disk|delivered the disk/,
        /delivered the disk|Postman/,
        /Postman|good news/,
        /good news/,
      ]);
      expect(p.xp() - x0).toBe(1500);
      expect(p.count(DISK)).toBe(0);
      expect(p.gvar('GVAR_VAULT_GET_LYNETTE_REWARD')).toBe(1);
      expect(p.problems(mark)).toEqual([]);
    });
  });
});
