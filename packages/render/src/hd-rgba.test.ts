import { describe, expect, it } from 'vitest';
import { RGBA_FRAGMENT_SHADER } from './hd-rgba';

describe('RGBA_FRAGMENT_SHADER (prefiltr minifikacji)', () => {
  it('uzywa pochodnych uv i 4 sond, zachowuje odrzut alfa=0 i oswietlenie', () => {
    expect(RGBA_FRAGMENT_SHADER).toContain('dFdx(vUv)');
    expect(RGBA_FRAGMENT_SHADER).toContain('dFdy(vUv)');
    expect(RGBA_FRAGMENT_SHADER.match(/texture\(uIndexed/g)).toHaveLength(4);
    expect(RGBA_FRAGMENT_SHADER).toContain('discard');
    expect(RGBA_FRAGMENT_SHADER).toContain('c.rgb * vLight');
  });
});
