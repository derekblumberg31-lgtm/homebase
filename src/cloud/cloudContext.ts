import { createContext, useContext } from 'react';
import type { CloudState } from './copy';
import type { ConflictInfo, ResolveResult, SyncStatus } from './syncEngine';

export interface CloudUser {
  id: string;
  email: string;
}

/** The same person keeps the same object, so a token refresh or a focus event doesn't look like a new sign-in. */
export function sameUser(previous: CloudUser | null, next: CloudUser | null): CloudUser | null {
  return previous && next && previous.id === next.id && previous.email === next.email ? previous : next;
}

/** What screens can ask of cloud sync. The context is null in a build with no Supabase project. */
export interface CloudApi {
  /** 'loading' only while a stored session is being picked up. */
  phase: 'loading' | 'signed-out' | 'signed-in';
  user: CloudUser | null;
  /** Set once, when this page load was Google sending the person back: whether a session resulted. */
  signInReturn?: 'done' | 'failed' | null;
  status: SyncStatus;
  lastSyncedAt?: string;
  conflict?: ConflictInfo;
  sizeMB?: number;
  message?: string;
  /** A recent sync counts as a backup. */
  coversBackup: boolean;
  syncNow: () => void;
  resolve: (choice: 'local' | 'cloud') => Promise<ResolveResult>;
  openConflict: () => void;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  feed: FeedState;
  /** Makes the calendar link, or replaces it with a new one (the old one stops working at once). Throws when it didn't finish. */
  makeCalendarLink: () => Promise<void>;
  /** Removes the cloud copy and the account. Throws when it didn't finish. */
  deleteAccount: () => Promise<void>;
  /** Signs out and forgets what was synced, before "Erase everything", so an empty home is never pushed. */
  beforeErase: () => Promise<void>;
}

/** The private calendar link. `url` is held in memory only, right after it is made, and is never stored. */
export interface FeedState {
  phase: 'unknown' | 'none' | 'ready';
  url?: string;
}

export const CloudContext = createContext<CloudApi | null>(null);

export const useCloud = () => useContext(CloudContext);

export function useCloudState(): CloudState {
  const cloud = useCloud();
  if (!cloud) return 'off';
  return cloud.user ? 'signed-in' : 'signed-out';
}
