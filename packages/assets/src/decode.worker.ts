/// <reference lib="webworker" />
import { parseFrm } from '@f2/formats';
import { openGameFolder, withModLayers, type VirtualFs } from '@f2/vfs';
import { findGameFiles, idbIndexCache, openModLayersBrowser } from '@f2/vfs/browser';
import type { DecodeRequest, DecodeResponse } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let vfs: VirtualFs | undefined;

function need(): VirtualFs {
  if (!vfs) throw new Error('worker: brak init');
  return vfs;
}

async function handle(
  req: DecodeRequest,
): Promise<{ res: DecodeResponse; transfer: Transferable[] }> {
  switch (req.type) {
    case 'init': {
      const { files, keys, missing } = findGameFiles(req.folder);
      if (missing.length > 0) throw new Error(`brak plikow: ${missing.join(', ')}`);
      vfs = await openGameFolder(files, idbIndexCache(), keys);
      const mods = await openModLayersBrowser(req.folder);
      if (mods && mods.layers.length > 0) vfs = withModLayers(vfs, mods);
      return {
        res: {
          id: req.id,
          type: 'init',
          entries: vfs.list().length,
          layers: vfs.layers.map((l) => l.name),
        },
        transfer: [],
      };
    }
    case 'frm': {
      const frm = parseFrm(await need().open(req.path));
      // piksele klatek sa widokami na jednym buforze calego pliku -> transfer raz
      const bufs = new Set<ArrayBuffer>();
      for (const dir of frm.directions) {
        for (const f of dir) {
          if (f.pixels.buffer instanceof ArrayBuffer) bufs.add(f.pixels.buffer);
        }
      }
      return { res: { id: req.id, type: 'frm', frm }, transfer: [...bufs] };
    }
    case 'read': {
      const data = await need().open(req.path);
      const transfer =
        data.buffer instanceof ArrayBuffer && data.byteLength === data.buffer.byteLength
          ? [data.buffer]
          : [];
      return { res: { id: req.id, type: 'read', data }, transfer };
    }
    case 'list':
      return { res: { id: req.id, type: 'list', names: need().list(req.prefix) }, transfer: [] };
  }
}

ctx.onmessage = (ev: MessageEvent<DecodeRequest>) => {
  const req = ev.data;
  handle(req).then(
    ({ res, transfer }) => ctx.postMessage(res, transfer),
    (e: unknown) => {
      const res: DecodeResponse = {
        id: req.id,
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
      ctx.postMessage(res);
    },
  );
};
