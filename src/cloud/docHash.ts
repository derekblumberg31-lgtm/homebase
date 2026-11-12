import type { HomeData } from '../data/store';
import type { StoredFile } from '../data/types';

/**
 * A fingerprint of everything that syncs, so "has this device changed since it last synced?" needs no
 * help from the data layer. Key order and row order don't matter; `lastBackupAt` is left out because
 * saving a backup file isn't a change to the home; files count by id, size and type.
 */

const COLLECTIONS = ['rooms', 'systems', 'items', 'tasks', 'serviceEvents', 'records', 'activity'] as const;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner !== undefined) out[key] = sortKeys(inner);
    }
    return out;
  }
  return value;
}

export function canonicalJson(data: HomeData, files: Pick<StoredFile, 'id' | 'size' | 'type'>[]): string {
  const { lastBackupAt: _ignored, ...settings } = data.settings;
  const doc: Record<string, unknown> = { household: data.household, property: data.property, settings };
  for (const name of COLLECTIONS) doc[name] = [...data[name]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  doc.files = files.map((f) => `${f.id}:${f.size}:${f.type}`).sort();
  return JSON.stringify(sortKeys(doc));
}

export async function canonicalHash(data: HomeData, files: Pick<StoredFile, 'id' | 'size' | 'type'>[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(data, files));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
