// @vitest-environment jsdom
import { act, render } from '@testing-library/preact';
import { useEffect } from 'preact/hooks';
import { describe, expect, it } from 'vitest';
import { UiArtProvider, useLayoutMode, useUiArt, type UiArtSource } from '../../src/art/context';

function Probe({ name }: { name: string }) {
  const img = useUiArt(name);
  return <span data-testid="p">{img ? img.url : 'null'}</span>;
}
function Mode() {
  return <span data-testid="m">{useLayoutMode()}</span>;
}

describe('useUiArt', () => {
  it('useUiArt zwraca null bez providera', () => {
    const { getByTestId } = render(<Probe name="a" />);
    expect(getByTestId('p').textContent).toBe('null');
  });

  it('useUiArt przerenderowuje po subscribe', () => {
    let ready = false;
    const subs = new Set<() => void>();
    const source: UiArtSource = {
      get: () => (ready ? { url: 'u.png', width: 1, height: 1 } : null),
      subscribe: (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
    const { getByTestId } = render(
      <UiArtProvider source={source}>
        <Probe name="a" />
      </UiArtProvider>,
    );
    expect(getByTestId('p').textContent).toBe('null');
    act(() => {
      ready = true;
      subs.forEach((f) => f());
    });
    expect(getByTestId('p').textContent).toBe('u.png');
  });
});

describe('useLayoutMode', () => {
  it('useLayoutMode reaguje na zmiane layout w providerze bez remontowania dzieci', () => {
    let mounts = 0;
    function Child() {
      useEffect(() => {
        mounts++;
      }, []);
      return <Mode />;
    }
    const { getByTestId, rerender } = render(
      <UiArtProvider source={null} layout="pc">
        <Child />
      </UiArtProvider>,
    );
    const node = getByTestId('m');
    expect(node.textContent).toBe('pc');
    rerender(
      <UiArtProvider source={null} layout="touch">
        <Child />
      </UiArtProvider>,
    );
    expect(getByTestId('m').textContent).toBe('touch');
    expect(getByTestId('m')).toBe(node);
    expect(mounts).toBe(1);
  });

  it('auto-detect reaguje na zmiane matchMedia/resize bez override', () => {
    const orig = window.matchMedia;
    let coarse = false;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('coarse') ? coarse : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { getByTestId } = render(
        <UiArtProvider source={null}>
          <Mode />
        </UiArtProvider>,
      );
      expect(getByTestId('m').textContent).toBe('pc');
      act(() => {
        coarse = true;
        window.dispatchEvent(new Event('resize'));
      });
      expect(getByTestId('m').textContent).toBe('touch');
    } finally {
      window.matchMedia = orig;
    }
  });
});
