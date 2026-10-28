import type { Item, KeyIdSource } from '../../data/types';

/**
 * Plain helpers about keys that don't need the vision engine, so the Keys list and key detail can
 * render instantly. The keyway table (public/engine/keyways.json) is small and fetched on demand.
 */

export interface KeywayRow {
  brand: string;
  keyway: string;
  type: string;
  blank?: string;
  alt?: string;
  notes?: string;
  restricted?: boolean;
  verify?: boolean;
  codes?: string[];
  transponderLikely?: boolean;
}

export const SOURCE_LABEL: Record<KeyIdSource, string> = {
  user: 'Confirmed by you',
  text: 'Read from the stamp',
  'text-brand': 'Brand read from the stamp, keyway guessed',
  learned: 'Guessed from your past corrections',
  shape: 'Guessed from shape',
  unknown: 'Not identified yet',
};

let table: KeywayRow[] | null = null;
let loading: Promise<KeywayRow[]> | null = null;

export function loadKeyways(): Promise<KeywayRow[]> {
  if (table) return Promise.resolve(table);
  loading ??= fetch('/engine/keyways.json')
    .then((r) => r.json())
    .then((json: { keyways?: KeywayRow[] }) => (table = json.keyways ?? []))
    .catch(() => (table = []));
  return loading;
}

const norm = (s?: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function keywayEntry(item: Item, rows: KeywayRow[] | null): KeywayRow | null {
  if (!rows || !item.key) return null;
  // Same lookup as the engine's Identify.entryFor: by keyway or code, else the brand-level entry.
  const kw = norm(item.key.keyway);
  const byKeyway = kw ? rows.find((row) => row.keyway && (norm(row.keyway) === kw || (row.codes ?? []).some((c) => norm(c) === kw))) : undefined;
  if (byKeyway) return byKeyway;
  return item.brand ? rows.find((row) => !row.keyway && norm(row.brand) === norm(item.brand)) ?? null : null;
}

/** The code a clerk needs, shown on the key's tag: keyway, else blank number. */
export function keyCode(item: Item, entry?: KeywayRow | null): string {
  return item.key?.keyway || item.key?.blank || entry?.blank || '';
}

export function keyFlags(item: Item, entry: KeywayRow | null) {
  return {
    dnd: Boolean(item.key?.flags.dnd),
    transponder: Boolean(item.key?.flags.transponder),
    restricted: Boolean(entry?.restricted) || item.key?.type === 'high security',
  };
}

export function keyKind(item: Item): string {
  const type = item.key?.type;
  if (!type) return 'Key';
  return type === 'high security' ? 'High-security key' : `${type[0].toUpperCase()}${type.slice(1)} key`;
}

export function whereToCut(type?: string): string {
  switch (type) {
    case 'house':
    case 'padlock':
      return 'A hardware-store key counter, a key kiosk, or a locksmith. Bring the original so they can confirm the blank.';
    case 'mailbox':
      return 'Cluster and apartment boxes: ask the property manager or post office, since they usually own the lock. A private mailbox lock: a locksmith can cut one if the blank or key code is known.';
    case 'car':
      return 'An automotive locksmith or the dealer. Older keys without a chip can be cut at many hardware stores; chipped keys and remotes also need programming. Have your VIN and proof of ownership ready.';
    case 'high security':
      return 'An authorized dealer for that brand, usually with the key’s ID card or the owner’s authorization.';
    default:
      return 'A locksmith. Bring the key so they can identify the blank.';
  }
}
