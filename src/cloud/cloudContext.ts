import { createContext, useContext } from 'react';
import type { CloudState } from './copy';
import type { ConflictInfo, ResolveResult, SyncStatus } from './syncEngine';

export interface CloudUser {
  id: string;
  email: string;
}

/** What screens can ask of cloud sync. The context is null in a build with no Supabase project. */
export interface CloudApi {
  /** 'loading' only while a stored session is being picked up. */
  phase: 'loading' | 'signed-out' | 'signed-in';
  user: CloudUser | null;
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
  /** Removes the cloud copy and the account. Throws when it didn't finish. */
  deleteAccount: () => Promise<void>;
  /** Signs out and forgets what was synced, before "Erase everything", so an empty home is never pushed. */
  beforeErase: () => Promise<void>;
}

export const CloudContext = createContext<CloudApi | null>(null);

export const useCloud = () => useContext(CloudContext);

export function useCloudState(): CloudState {
  const cloud = useCloud();
  if (!cloud) return 'off';
  return cloud.user ? 'signed-in' : 'signed-out';
}
