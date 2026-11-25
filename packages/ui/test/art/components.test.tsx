// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../src/art/context';
import { ArtAt, ArtStage } from '../../src/art/ArtStage';
import { ArtButton } from '../../src/art/ArtButton';
import { ArtDigits } from '../../src/art/ArtDigits';
import { ExtrasPanel } from '../../src/art/ExtrasPanel';

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0], height: sizes[name][1] } : null,
  subscribe: () => () => {},
});

describe('art components', () => {
  it('ArtStage bez grafiki renderuje fallback z dziecmi', () => {
    const { getByText, container } = render(
      <ArtStage background="bg">
        <span>dziecko</span>
      </ArtStage>,
    );
    expect(getByText('dziecko')).toBeTruthy();
    expect(container.querySelector('[data-art-stage]')).toBeNull();
  });

  it('ArtStage z dwoma rozmiarami tla (640x480 i 800x600) ustawia aspect-ratio z rozmiaru grafiki', () => {
    const src = sourceOf({ a: [640, 480], b: [800, 600] });
    const r1 = render(
      <UiArtProvider source={src}>
        <ArtStage background="a">
          <ArtAt x={64} y={48} w={32} h={24}>
            x
          </ArtAt>
        </ArtStage>
      </UiArtProvider>,
    );
    const st = r1.container.querySelector('[data-art-stage]') as HTMLElement;
    expect(st.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    const at = r1.container.querySelector('[data-art-at]') as HTMLElement;
    expect(at.style.left).toBe('10%');
    expect(at.style.top).toBe('10%');
    const r2 = render(
      <UiArtProvider source={src}>
        <ArtStage background="b">y</ArtStage>
      </UiArtProvider>,
    );
    const st2 = r2.container.querySelector('[data-art-stage]') as HTMLElement;
    expect(st2.style.aspectRatio.replace(/\s/g, '')).toBe('800/600');
  });

  it('ArtButton bez klatki down uzywa up z filtrem', () => {
    const onClick = vi.fn();
    const { getByTestId, container } = render(
      <UiArtProvider source={sourceOf({ up: [20, 10] })}>
        <ArtButton up="up" label="OK" onClick={onClick} testId="b" />
      </UiArtProvider>,
    );
    const btn = getByTestId('b');
    fireEvent.pointerDown(btn);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('up.png');
    expect(img.style.filter).toBe('brightness(.7)');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('ArtButton w touch ma min 44px', () => {
    const { getByTestId } = render(
      <UiArtProvider source={sourceOf({ up: [20, 10] })} layout="touch">
        <ArtButton up="up" label="OK" onClick={() => {}} testId="b" />
      </UiArtProvider>,
    );
    const b = getByTestId('b');
    expect(b.style.minWidth).toBe('44px');
    expect(b.style.minHeight).toBe('44px');
  });

  it('ArtButton bez grafiki renderuje zwykly Button', () => {
    const { getByTestId } = render(<ArtButton up="up" label="OK" onClick={() => {}} testId="b" />);
    expect(getByTestId('b').className).toContain('f2-button');
    expect(getByTestId('b').textContent).toBe('OK');
  });

  it('ArtButton bez grafiki w touch ustawia cel min 44px (zmienna CSS)', () => {
    const { getByTestId } = render(
      <UiArtProvider source={sourceOf({})} layout="touch">
        <ArtButton up="up" label="OK" onClick={() => {}} testId="b" />
      </UiArtProvider>,
    );
    const wrap = getByTestId('b').parentElement as HTMLElement;
    expect(wrap.className).toBe('f2-art-button__fallback');
    expect(wrap.style.getPropertyValue('--f2-art-touch-min')).toBe('44px');
  });

  it('ArtButton bez grafiki na PC nie narzuca wiekszego celu dotyku', () => {
    const { getByTestId } = render(
      <UiArtProvider source={sourceOf({})} layout="pc">
        <ArtButton up="up" label="OK" onClick={() => {}} testId="b" />
      </UiArtProvider>,
    );
    const wrap = getByTestId('b').parentElement as HTMLElement;
    expect(wrap.className).toBe('f2-art-button__fallback');
    expect(wrap.style.getPropertyValue('--f2-art-touch-min')).toBe('');
  });

  it('ArtDigits renderuje "Zażółć gęślą jaźń" bez krzaczkow (tekst w DOM)', () => {
    const { container } = render(
      <ArtDigits value="Zażółć gęślą jaźń" sheet="digits" digitWidth={9} />,
    );
    expect(container.textContent).toBe('Zażółć gęślą jaźń');
  });

  it('ArtDigits rysuje cyfry z arkusza', () => {
    const { container } = render(
      <UiArtProvider source={sourceOf({ digits: [90, 12] })}>
        <ArtDigits value={42} sheet="digits" digitWidth={9} />
      </UiArtProvider>,
    );
    const d = container.querySelectorAll('[data-digit]');
    expect(d.length).toBe(2);
    expect((d[0] as HTMLElement).style.backgroundPosition).toBe('44.44444444444444% 0%');
  });

  it('ExtrasPanel renderuje dzieci', () => {
    const { getByText } = render(
      <ExtrasPanel title="Dodatki">
        <p>tresc</p>
      </ExtrasPanel>,
    );
    expect(getByText('tresc')).toBeTruthy();
    expect(getByText('Dodatki')).toBeTruthy();
  });

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

  it('ArtStage CSS: wpisanie contain-style (min z cqw/cqh i ratio)', () => {
    const css = readFileSync(join(uiRoot, 'src/art/art.css'), 'utf8');
    expect(css).toMatch(/\.f2-art-frame\s*\{[^}]*container-type:\s*size/);
    expect(css).toMatch(/width:\s*min\(100cqw,\s*calc\(100cqh \* var\(--f2-art-ratio/);
    expect(css).toMatch(/focus-visible/);
  });

  it('ArtStage ustawia --f2-art-ratio', () => {
    const { container } = render(
      <UiArtProvider source={sourceOf({ a: [800, 600] })}>
        <ArtStage background="a">x</ArtStage>
      </UiArtProvider>,
    );
    const st = container.querySelector('[data-art-stage]') as HTMLElement;
    expect(st.style.getPropertyValue('--f2-art-ratio')).toBe(String(800 / 600));
  });

  it('minTouch w scenie wymusza min 44px na przyciskach', () => {
    const { getByTestId } = render(
      <UiArtProvider source={sourceOf({ bg: [640, 480], up: [20, 10] })} layout="pc">
        <ArtStage background="bg" minTouch>
          <ArtButton up="up" label="OK" onClick={() => {}} testId="b" />
        </ArtStage>
      </UiArtProvider>,
    );
    expect(getByTestId('b').style.minWidth).toBe('44px');
  });

  it('ArtButton i ArtDigits skaluja sie ze scena (cqw)', () => {
    const { getByTestId, container } = render(
      <UiArtProvider source={sourceOf({ bg: [640, 480], up: [64, 32], d: [90, 12] })}>
        <ArtStage background="bg">
          <ArtButton up="up" label="OK" onClick={() => {}} testId="b" />
          <ArtDigits value={7} sheet="d" digitWidth={9} />
        </ArtStage>
      </UiArtProvider>,
    );
    expect(
      (getByTestId('b').querySelector('img') as HTMLElement).style.getPropertyValue('--f2-art-w'),
    ).toBe('10');
    expect(
      (container.querySelector('[data-digit]') as HTMLElement).style.getPropertyValue('--f2-art-w'),
    ).toBe(String((9 / 640) * 100));
  });

  it('ArtButton: Enter/Space pokazuje klatke down', () => {
    const { getByTestId } = render(
      <UiArtProvider source={sourceOf({ up: [20, 10], dn: [20, 10] })}>
        <ArtButton up="up" down="dn" label="OK" onClick={() => {}} testId="b" />
      </UiArtProvider>,
    );
    const b = getByTestId('b');
    fireEvent.keyDown(b, { key: ' ' });
    expect(b.querySelector('img')!.getAttribute('src')).toBe('dn.png');
    fireEvent.keyUp(b, { key: ' ' });
    expect(b.querySelector('img')!.getAttribute('src')).toBe('up.png');
  });

  it('czcionka F2 Pixel pokrywa polskie znaki (cmap TTF)', () => {
    const buf = readFileSync(join(uiRoot, 'src/fonts/VT323-Regular.ttf'));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = dv.getUint16(4);
    let cmapOff = 0;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (buf.toString('latin1', o, o + 4) === 'cmap') cmapOff = dv.getUint32(o + 8);
    }
    const nt = dv.getUint16(cmapOff + 2);
    const cps = new Set<number>();
    for (let i = 0; i < nt; i++) {
      const off = cmapOff + dv.getUint32(cmapOff + 4 + i * 8 + 4);
      const fmt = dv.getUint16(off);
      if (fmt === 4) {
        const segX2 = dv.getUint16(off + 6);
        const endO = off + 14;
        const startO = endO + segX2 + 2;
        for (let s = 0; s < segX2 / 2; s++) {
          const end = dv.getUint16(endO + s * 2);
          const start = dv.getUint16(startO + s * 2);
          for (let c = start; c <= end && c < 0xffff; c++) cps.add(c);
        }
      } else if (fmt === 12) {
        const g = dv.getUint32(off + 12);
        for (let k = 0; k < g; k++) {
          const b = off + 16 + k * 12;
          for (let c = dv.getUint32(b); c <= dv.getUint32(b + 4); c++) cps.add(c);
        }
      }
    }
    const missing = [...'ąęśćźżółńĄĘŚĆŹŻÓŁŃ'].filter((ch) => !cps.has(ch.codePointAt(0)!));
    expect(missing).toEqual([]);
  });
});
