import { describe, expect, it } from 'vitest';
import {
  ambientSfxName,
  animLetters,
  buttonSfxName,
  charSfxName,
  containerSfxName,
  doorSfxName,
  interfaceSfxName,
  materialSfxChar,
  parseAmbientSfx,
  parseSndList,
  resolveCharSfxCandidates,
  sceneryDoorName,
  sfxPath,
  weaponSfxName,
} from '../src/sfx/names.js';

describe('animLetters', () => {
  it('reguly z exe 0x419314', () => {
    expect(animLetters(0, 0)).toEqual(['a', 'a']);
    expect(animLetters(1, 1)).toEqual(['b', 'd']);
    expect(animLetters(2, 3)).toEqual(['c', 'a']);
    expect(animLetters(0x0d, 2)).toEqual(['e', 'e']);
    expect(animLetters(0x0d, 0)).toEqual(['n', 'a']);
    expect(animLetters(0x12, 1)).toEqual(['m', 'd']);
    expect(animLetters(0x12, 4)).toEqual(['m', 'g']);
    expect(animLetters(0x12, 2)).toEqual(['s', 'a']);
    expect(animLetters(0x14, 0)).toEqual([String.fromCharCode(0x14 + 0x4d), 'b']);
    expect(animLetters(0x24, 0)).toEqual(['h', 'c']);
    expect(animLetters(0x25, 0)).toEqual(['j', 'c']);
    expect(animLetters(0x26, 2)).toEqual([String.fromCharCode(0x26 + 0x3d), 'e']);
    expect(animLetters(0x26, 0)).toBeNull();
    expect(animLetters(0x30, 0)).toEqual([String.fromCharCode(0x30 + 0x31), 'r']);
    expect(animLetters(0x40, 0)).toEqual(['a', 'n']);
    expect(animLetters(0, 11)).toBeNull();
    expect(animLetters(-1, 0)).toBeNull();
  });
});

describe('charSfxName', () => {
  it('base + weapon + anim, wielkie litery', () => {
    expect(charSfxName('hmwarr', 0, 0)).toBe('HMWARRAA');
    expect(charSfxName('hmwarr', 1, 1)).toBe('HMWARRDB');
  });
  it('poprawki Y/Z', () => {
    expect(charSfxName('hmwarr', 0x14, 0, 2)).toBe(
      'HMWARR' + 'Y' + String.fromCharCode(0x14 + 0x4d).toUpperCase(),
    );
    expect(charSfxName('hmwarr', 0x15, 0, 3)).toMatch(/^HMWARRZ/);
    expect(charSfxName('hmwarr', 0x10, 0, 4)).toMatch(/^HMWARRZ/);
  });
  it('null dla niepoprawnej animacji', () => {
    expect(charSfxName('hmwarr', 0, 99)).toBeNull();
  });
});

describe('resolveCharSfxCandidates', () => {
  it('lancuch aliasow', () => {
    expect(resolveCharSfxCandidates('HFJMPSAA', 'M')).toEqual(['HFJMPSAA', 'HFXXXXAA', 'HMXXXXAA']);
    expect(resolveCharSfxCandidates('HAJMPSAA', 'M')).toEqual(['HAJMPSAA', 'HMXXXXAA']);
    expect(resolveCharSfxCandidates('NMBRAHAA', 'F')).toEqual(['NMBRAHAA', 'NMXXXXAA']);
    expect(resolveCharSfxCandidates('MALIEUAA', 'M')).toEqual(['MALIEUAA', 'MAMTNTAA']);
    expect(resolveCharSfxCandidates('MADEERAA', 'M')).toEqual(['MADEERAA']);
  });
});

describe('weaponSfxName', () => {
  it('WA11XXX1 itd.', () => {
    expect(weaponSfxName({ action: 0, weaponChar: '1', hitMode: 0 })).toBe('WR11XXX1');
    expect(weaponSfxName({ action: 1, weaponChar: '1', hitMode: 0 })).toBe('WA11XXX1');
  });
  it('tryb 2 dla nieparzystych hitMode przy akcji != 0,2', () => {
    expect(weaponSfxName({ action: 1, weaponChar: 'A', hitMode: 1 })).toBe('WAA2XXX1');
    expect(weaponSfxName({ action: 2, weaponChar: 'A', hitMode: 1 })).toBe('WOA1XXX1');
  });
  it('material tylko dla akcji H', () => {
    expect(weaponSfxName({ action: 4, weaponChar: '1', hitMode: 0, material: 3 })).toBe('WH11WXX1');
    expect(weaponSfxName({ action: 1, weaponChar: '1', hitMode: 0, material: 3 })).toBe('WA11XXX1');
    expect(
      weaponSfxName({ action: 4, weaponChar: '1', hitMode: 0, material: 3, damageType: 3 }),
    ).toBe('WH11XXX1');
  });
  it('akcje 5..9 to C L N U (RAOFHOCLNU)', () => {
    expect(weaponSfxName({ action: 6, weaponChar: '1', hitMode: 0 })).toBe('WC11XXX1');
    expect(weaponSfxName({ action: 9, weaponChar: '1', hitMode: 0 })).toBe('WU11XXX1');
  });
  it('brak broni skraca nazwe', () => {
    expect(weaponSfxName({ action: 1, weaponChar: '', hitMode: 0 })).toBeNull();
  });
});

describe('materialSfxChar', () => {
  it('M/W/S/F', () => {
    expect([0, 1, 2].map(materialSfxChar)).toEqual(['M', 'M', 'M']);
    expect(materialSfxChar(3)).toBe('W');
    expect([4, 5, 6].map(materialSfxChar)).toEqual(['S', 'S', 'S']);
    expect([7, 9, -1].map(materialSfxChar)).toEqual(['F', 'F', 'F']);
  });
});

describe('drzwi, pojemniki, scenery, interfejs', () => {
  it('drzwi', () => {
    expect(sceneryDoorName(0, 'A')).toBe('SODOORSA');
    expect(sceneryDoorName(1, 'B')).toBe('SCDOORSB');
    expect(sceneryDoorName(2, 'A')).toBe('SLDOORSA');
    expect(doorSfxName(1, 'A')).toBe('SCDOORSA');
  });
  it('pojemniki', () => {
    expect(containerSfxName(0, 'C')).toBe('IOCNTNRC');
    expect(containerSfxName(1, 'A')).toBe('ICCNTNRA');
  });
  it('ambient / interfejs / przyciski', () => {
    expect(ambientSfxName('ANIMAL')).toBe('AANIMAL1');
    expect(interfaceSfxName('ANIMAL')).toBe('NANIMAL1');
    expect(buttonSfxName(0)).toBe('ib1p1xx1');
    expect(buttonSfxName(2)).toBe('toggle');
    expect(buttonSfxName(7)).toBeNull();
  });
  it('sfxPath', () => {
    expect(sfxPath('HMXXXXAA')).toBe('sound/sfx/hmxxxxaa.acm');
  });
});

describe('parseSndList', () => {
  it('count + 4 linie na wpis', () => {
    const t = '2\r\nA.ACM\r\n10\r\n20\r\n2\r\nB.ACM\r\n11\r\n21\r\n4\r\n';
    expect(parseSndList(t)).toEqual([
      { name: 'A', a: 10, b: 20, id: 2 },
      { name: 'B', a: 11, b: 21, id: 4 },
    ]);
  });
  it('blad przy niepelnym wpisie', () => {
    expect(() => parseSndList('1\r\nA.ACM\r\n1\r\n')).toThrow();
  });
});

describe('parseAmbientSfx', () => {
  it('name:chance, max 6, literowka bez przecinka', () => {
    expect(parseAmbientSfx('wind:30, birds:70')).toEqual([
      { name: 'wind', chance: 30 },
      { name: 'birds', chance: 70 },
    ]);
    expect(parseAmbientSfx('a:1,b:2,c:3,d:4,e:5,f:6,g:7')).toHaveLength(6);
    expect(parseAmbientSfx('animal:15 animal:10')).toEqual([{ name: 'animal', chance: 15 }]);
    expect(parseAmbientSfx('')).toEqual([]);
  });
});

describe('pickAmbient', () => {
  it('wybor wazony', async () => {
    const { pickAmbient } = await import('../src/sfx/names.js');
    const l = [
      { name: 'a', chance: 30 },
      { name: 'b', chance: 70 },
    ];
    expect(pickAmbient(l, () => 0)?.name).toBe('a');
    expect(pickAmbient(l, () => 0.29)?.name).toBe('a');
    expect(pickAmbient(l, () => 0.31)?.name).toBe('b');
    expect(pickAmbient([], () => 0)).toBeUndefined();
  });
});
