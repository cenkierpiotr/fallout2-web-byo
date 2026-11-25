import { gunzipText } from '../save/gunzip-limited.js';
import { migrate } from '../save/migrations.js';
import { SAVE_SLOTS, isValidSlot, type SaveGame } from '../save/schema.js';
import type { ProfileStore, ProfileSettings } from './profile-store.js';

export const PROFILE_MAGIC = 'f2profile';

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/** Profil (nazwa, kolor, ustawienia; bez PIN-u) i wszystkie jego zapisy w jednym pliku `.f2profile`. Bez plikow gry. */
export async function exportProfile(
  store: ProfileStore,
  id: string,
  now: number = Date.now(),
): Promise<Blob> {
  const p = await store.get(id);
  if (!p) throw new RangeError('brak profilu');
  const saves = store.saveStore(id);
  const slots: SaveGame[] = [];
  for (const slot of SAVE_SLOTS) {
    const s = await saves.read(slot);
    if (s) slots.push(s);
  }
  return gzip(
    JSON.stringify({
      magic: PROFILE_MAGIC,
      exportedAt: now,
      profile: { name: p.name, color: p.color, avatar: p.avatar, settings: p.settings },
      slots,
    }),
  );
}

export function profileFileName(name: string, date: Date = new Date()): string {
  const safe = name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'profil';
  return `${safe}-${date.toISOString().slice(0, 10)}.f2profile`;
}

/** Klucze ustawien profilu przyjmowane z pliku (apps/web: PROFILE_SETTING_KEYS + `locale`); reszta jest odrzucana. */
export function sanitizeImportedSettings(raw: unknown): ProfileSettings {
  const out: ProfileSettings = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  const own = (k: string): unknown => (Object.hasOwn(r, k) ? r[k] : undefined);
  const loc = own('locale');
  if (loc === 'pl' || loc === 'en') out['locale'] = loc;
  const gtl = own('gameTextLanguage');
  if (gtl === 'auto' || gtl === 'english' || gtl === 'polish') out['gameTextLanguage'] = gtl;
  const cm = own('classicMode');
  if (typeof cm === 'boolean') out['classicMode'] = cm;
  const fx = own('fixes');
  if (fx && typeof fx === 'object' && !Array.isArray(fx)) {
    const fixes: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
    for (const [k, v] of Object.entries(fx)) if (typeof v === 'boolean') fixes[k] = v;
    out['fixes'] = { ...fixes };
  }
  return out;
}

export type ProfileImportResult =
  | { ok: true; id: string; name: string; imported: number; errors: string[] }
  | { ok: false; reason: 'profile-corrupt' };

/** Import zawsze tworzy NOWY profil (nazwa z sufiksem przy kolizji); istniejacych nie nadpisuje. */
export async function importProfile(file: Blob, store: ProfileStore): Promise<ProfileImportResult> {
  let doc: unknown;
  try {
    const text = await gunzipText(file);
    doc = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'profile-corrupt' };
  }
  const d = doc as {
    magic?: unknown;
    profile?: { name?: unknown; color?: unknown; avatar?: unknown; settings?: unknown };
    slots?: unknown;
  } | null;
  if (
    !d ||
    d.magic !== PROFILE_MAGIC ||
    !Array.isArray(d.slots) ||
    typeof d.profile?.name !== 'string'
  )
    return { ok: false, reason: 'profile-corrupt' };

  const taken = new Set((await store.list()).map((p) => p.name.toLowerCase()));
  const base = d.profile.name.trim().slice(0, 20) || 'Profil';
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  const settings = sanitizeImportedSettings(d.profile.settings);
  const created = await store.create({
    name,
    ...(typeof d.profile.color === 'string' ? { color: d.profile.color } : {}),
    ...(typeof d.profile.avatar === 'string' ? { avatar: d.profile.avatar } : {}),
    settings,
  });
  const saves = store.saveStore(created.id);
  const errors: string[] = [];
  let imported = 0;
  const seen = new Set<string>();
  for (const raw of d.slots.slice(0, SAVE_SLOTS.length)) {
    const r = migrate(raw);
    const id = String((raw as { meta?: { slot?: unknown } } | null)?.meta?.slot ?? '?');
    if ('error' in r) errors.push(`${id}:${r.error}`);
    else if (!isValidSlot(r.meta.slot)) errors.push(`${id}:bad-slot`);
    else if (seen.has(r.meta.slot)) errors.push(`${id}:duplicate-slot`);
    else {
      seen.add(r.meta.slot);
      await saves.write(r.meta.slot, r);
      imported++;
    }
  }
  return { ok: true, id: created.id, name: created.name, imported, errors };
}
