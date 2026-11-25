import { describe, expect, it } from 'vitest';
import { listMaps, parseMapsTxt } from './maps-txt';

const TXT = `; komentarz\r\n[Map 000]\r\nlookup_name=Desert Encounter 1\r\nmap_name=desert1\r\nsaved=No  ; x\r\n\r\n[Map 001]\r\nlookup_name=Temple\r\nmap_name=artemple\r\n`;

describe('maps.txt', () => {
  it('parsuje sekcje i pola', () => {
    expect(parseMapsTxt(TXT)).toEqual([
      { index: 0, name: 'DESERT1', lookup: 'Desert Encounter 1' },
      { index: 1, name: 'ARTEMPLE', lookup: 'Temple' },
    ]);
  });
  it('listMaps zostawia istniejace pliki i dopisuje reszte', () => {
    const e = parseMapsTxt(TXT);
    const l = listMaps(e, ['maps/artemple.map', 'data/maps/zzz.map', 'maps/other.txt']);
    expect(l.map((x) => x.name)).toEqual(['ARTEMPLE', 'ZZZ']);
    expect(l[0]?.index).toBe(1);
    expect(l[1]?.index).toBe(-1);
  });
});

describe('maps.txt: muzyka', () => {
  it('czyta pole music= (nazwa utworu bez rozszerzenia)', () => {
    const e = parseMapsTxt(
      '[Map 000]\r\nmap_name=desert1\r\nmusic=07desert\r\n[Map 001]\r\nmap_name=x\r\n',
    );
    expect(e[0]?.music).toBe('07desert');
    expect(e[1]?.music).toBeUndefined();
  });
});

describe('maps.txt: random_start_point', () => {
  it('zbiera punkty startowe', () => {
    const e = parseMapsTxt(
      '[Map 000]\r\nmap_name=desert1\r\nrandom_start_point_0=elev:0, tile_num:12345\r\nrandom_start_point_1=elev:1, tile_num:99\r\n[Map 001]\r\nmap_name=x\r\n',
    );
    expect(e[0]?.randomStarts).toEqual([
      { elevation: 0, tileNum: 12345 },
      { elevation: 1, tileNum: 99 },
    ]);
    expect(e[1]?.randomStarts).toBeUndefined();
  });
});

describe('maps.txt: ambient_sfx', () => {
  it('parsuje liste name:chance, pomija zakomentowane', () => {
    const e = parseMapsTxt(
      '[Map 000]\r\nmap_name=a\r\nambient_sfx=wind:30, birds:70\r\n[Map 001]\r\nmap_name=b\r\n;ambient_sfx=x:100\r\n',
    );
    expect(e[0]?.ambientSfx).toEqual([
      { name: 'wind', chance: 30 },
      { name: 'birds', chance: 70 },
    ]);
    expect(e[1]?.ambientSfx).toBeUndefined();
  });
});
