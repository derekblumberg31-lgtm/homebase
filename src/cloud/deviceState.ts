import { clearFlag, readFlag, writeFlag } from '../lib/deviceFlags';
import type { SyncStateStore } from './syncEngine';

/** A random id for this device, made once. */
export function getDeviceId(): string {
  const existing = readFlag('homebase:device-id');
  if (existing) return existing;
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  writeFlag('homebase:device-id', id);
  return id;
}

/** "This device equalled the account's revision N, with fingerprint H." */
export const deviceSyncState: SyncStateStore = {
  read() {
    const raw = readFlag('homebase:sync-state');
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null) return null;
      const v = value as Record<string, unknown>;
      return typeof v.userId === 'string' && typeof v.revision === 'number' && typeof v.hash === 'string' && typeof v.syncedAt === 'string'
        ? { userId: v.userId, revision: v.revision, hash: v.hash, syncedAt: v.syncedAt }
        : null;
    } catch {
      return null;
    }
  },
  write(state) {
    writeFlag('homebase:sync-state', JSON.stringify(state));
  },
  clear() {
    clearFlag('homebase:sync-state');
  },
};
