// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { DEFAULT_SETTINGS, settings } from '../../settings';
import { hdPack } from '../../state/hd-pack';
import { GraphicsSection } from './GraphicsSection';

const manifest = JSON.stringify({
  version: 1,
  generatedAt: 'x',
  entries: { 'art/walls/a.frm': { source: 'flux', approved: true } },
});
// jsdom nie ma File.text()/arrayBuffer()
const readAll = (f: Blob): Promise<ArrayBuffer> =>
  new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.readAsArrayBuffer(f);
  });
if (!('text' in File.prototype)) {
  Object.defineProperty(File.prototype, 'text', {
    value(this: Blob) {
      return readAll(this).then((b) => new TextDecoder().decode(b));
    },
  });
}
const fileAt = (rel: string, body: string): File => {
  const f = new File([body], rel.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: rel });
  return f;
};

describe('GraphicsSection: wybor HD', () => {
  afterEach(cleanup);
  beforeEach(() => {
    settings.value = { ...DEFAULT_SETTINGS, hdMode: 'original', hdRgba: false, hdTiles: false };
    hdPack.value = null;
  });
  it('select trybu zmienia hdMode i wlacza sciezke RGBA', () => {
    render(<GraphicsSection />);
    fireEvent.change(screen.getByTestId('gfx-hd-mode'), { target: { value: 'hd' } });
    expect(settings.value.hdMode).toBe('hd');
    expect(settings.value.hdRgba).toBe(true);
  });
  it('wybor folderu z paczka HD ustawia hdPack i wlacza HD', async () => {
    render(<GraphicsSection />);
    const list = [
      fileAt('final/DATA/assets-hd/manifest.json', manifest),
      fileAt('final/DATA/assets-hd/hd/atlas-0000.png', 'png'),
    ];
    fireEvent.change(screen.getByTestId('gfx-hd-input'), { target: { files: list } });
    await waitFor(() => expect(hdPack.value).not.toBeNull());
    expect(hdPack.value!.name).toBe('final');
    expect(hdPack.value!.hdEntries).toBe(1);
    expect(settings.value.hdMode).toBe('hd');
    expect(settings.value.hdTiles).toBe(true);
    expect(screen.getByTestId('gfx-hd-source').textContent).toContain('final');
  });
  it('folder bez manifestu daje blad i nie zmienia ustawien', async () => {
    render(<GraphicsSection />);
    fireEvent.change(screen.getByTestId('gfx-hd-input'), {
      target: { files: [fileAt('x/readme.txt', 'a')] },
    });
    await screen.findByTestId('gfx-hd-error');
    expect(hdPack.value).toBeNull();
    expect(settings.value.hdMode).toBe('original');
  });
});
