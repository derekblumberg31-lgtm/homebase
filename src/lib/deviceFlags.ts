// Per-device flags in localStorage, and the only module that touches these keys. Every call is
// safe when storage is missing or throws: reads return null, writes do nothing.

export type DeviceFlagKey =
  | 'homebase:starter-dismissed'
  | 'homebase:install-row-dismissed'
  | 'homebase:backup-row-dismissed'
  | 'homebase:alert-rows-dismissed';

export function readFlag(key: DeviceFlagKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns true when the value was stored. */
export function writeFlag(key: DeviceFlagKey, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function clearFlag(key: DeviceFlagKey): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** Reads a JSON array of strings; anything else (missing, corrupt, wrong shape) is []. */
export function readStringList(key: DeviceFlagKey): string[] {
  const raw = readFlag(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeStringList(key: DeviceFlagKey, list: string[]): boolean {
  return writeFlag(key, JSON.stringify(list));
}

/** Adds one id to a stored list without duplicating it. */
export function addToStringList(key: DeviceFlagKey, id: string): string[] {
  const list = readStringList(key);
  if (list.includes(id)) return list;
  const next = [...list, id];
  writeStringList(key, next);
  return next;
}

const HOME_FLAGS: DeviceFlagKey[] = [
  'homebase:starter-dismissed',
  'homebase:backup-row-dismissed',
  'homebase:alert-rows-dismissed',
];

/**
 * After "Erase everything": the Home dismissals described a home that no longer exists, so a fresh
 * start shows its rows again. The install row is about this browser, not the home, so it stays hidden.
 */
export function clearHomeFlags(): void {
  for (const key of HOME_FLAGS) clearFlag(key);
}
