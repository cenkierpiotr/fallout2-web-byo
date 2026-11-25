import type { Frm } from '@f2/formats';
import type { PickedFolder as VfsPickedFolder } from '@f2/vfs/browser';

export type PickedFolder = VfsPickedFolder;

export type DecodeRequest = { id: number } & (
  | { type: 'init'; folder: PickedFolder }
  | { type: 'frm'; path: string }
  | { type: 'read'; path: string }
  | { type: 'list'; prefix: string }
);

export type DecodeResponse = { id: number } & (
  | { type: 'init'; entries: number; layers: string[] }
  | { type: 'frm'; frm: Frm }
  | { type: 'read'; data: Uint8Array }
  | { type: 'list'; names: string[] }
  | { type: 'error'; message: string }
);
