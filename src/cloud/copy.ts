import { formatRelativeTime } from '../lib/dates';
import { DAY_MS } from '../lib/dates';
import type { SyncState } from './syncEngine';

/** Which of the three states Homebase is in. 'off' is every build without a Supabase project: nothing changes there. */
export type CloudState = 'off' | 'signed-out' | 'signed-in';

/**
 * The few lines elsewhere in the app that change when sync exists. Each screen keeps today's text and
 * calls `pick`, so a build with no project shows exactly what it showed before.
 */
export const CLOUD_COPY = {
  onboarding: 'Everything stays on this device unless you choose to sign in and sync. Save a backup file from Settings to keep a copy.',
  householdFoot: {
    'signed-out': 'Everyone shares this device’s Homebase. To use it on another device, sign in to sync, or save a backup here and restore it there.',
    'signed-in': 'Everyone who uses this device shares it. Signing in on another device brings the same home there.',
  },
  leaves: {
    'signed-out': 'Nothing, unless you save a backup or calendar file yourself, or sign in to sync. There’s no analytics. The Assistant runs on the device.',
    'signed-in':
      'Your whole home, including photos and files, is copied to your account after changes. It’s stored with Supabase and only your sign-in can read it through the app. It isn’t end-to-end encrypted, so it could be accessed by whoever runs the Homebase service. No analytics. The Assistant runs on the device.',
  },
  cleared: 'Sign in again to bring back your home from your account, or restore a backup file.',
  recordFilesFoot: 'Photos and PDFs are stored on this device, included in backups, and synced to your account. Large photos are made smaller to keep backups quick.',
  restoreConfirmAddition: 'Your account’s copy will be replaced at the next sync.',
  eraseConfirmAddition: 'You’ll be signed out. Your account’s copy isn’t deleted.',
} as const;

/** Today's text when off; the cloud text otherwise. A state with no cloud text keeps today's. */
export function pick(state: CloudState, today: string, signedOut?: string, signedIn?: string): string {
  if (state === 'signed-out') return signedOut ?? today;
  if (state === 'signed-in') return signedIn ?? signedOut ?? today;
  return today;
}

export const OFFLINE_MESSAGE = 'Can’t reach your account. Your home is safe on this device and will sync later.';

export function tooBigMessage(sizeMB: number): string {
  return `Your home is too big to sync (${sizeMB} MB). Large photos and PDFs make it big. Backup files still work.`;
}

/** The value on the Sync row. */
export function statusLabel(state: Pick<SyncState, 'status' | 'lastSyncedAt'>, now = Date.now()): string {
  const ago = state.lastSyncedAt ? ` · ${formatRelativeTime(state.lastSyncedAt, now)}` : '';
  switch (state.status) {
    case 'in-sync':
      return `Up to date${ago}`;
    case 'idle':
      return state.lastSyncedAt ? `Up to date${ago}` : 'Not synced yet';
    case 'pending':
      return 'Changes waiting to sync';
    case 'syncing':
    case 'checking':
      return 'Syncing…';
    case 'conflict':
      return 'Paused: choose which copy to keep';
    case 'offline':
      return 'Can’t reach your account';
    case 'too-big':
      return 'Too big to sync';
    case 'needs-confirm':
      return 'Your account has a home to bring here';
    case 'cloud-reset':
      return 'Your cloud copy was reset';
    case 'newer-version':
      return 'Paused: update Homebase';
    case 'damaged':
      return 'Paused: the cloud copy is damaged';
  }
}

/** A longer line under the Sync row, for the states that need one. */
export function statusDetail(state: Pick<SyncState, 'status' | 'sizeMB' | 'message'>): string | undefined {
  switch (state.status) {
    case 'offline':
      return OFFLINE_MESSAGE;
    case 'too-big':
      return tooBigMessage(state.sizeMB ?? 45);
    case 'newer-version':
    case 'damaged':
    case 'cloud-reset':
      return state.message;
    default:
      return undefined;
  }
}

/** A recent successful sync counts as a backup, so Home stops asking for a file. */
export function syncCoversBackup(state: Pick<SyncState, 'status' | 'lastSyncedAt'>, now = Date.now()): boolean {
  if (state.status === 'in-sync') return true;
  // When sync is stuck, the account's copy isn't being kept up, so the nudge for a file stays.
  if (state.status === 'conflict' || state.status === 'needs-confirm' || state.status === 'cloud-reset' || state.status === 'too-big' || state.status === 'newer-version' || state.status === 'damaged') return false;
  if (!state.lastSyncedAt) return false;
  // A short outage is ordinary; a long one isn't a backup.
  const window = state.status === 'offline' ? 2 * DAY_MS : 14 * DAY_MS;
  return now - new Date(state.lastSyncedAt).getTime() < window;
}

/** "your iPhone", or "another device" when the other copy didn't say what it was. */
export function fromDevice(label: string): string {
  return label === 'this device' || !label ? 'another device' : `your ${label}`;
}
