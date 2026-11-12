/**
 * What to do when this device checks the account. Pure, so every row of the rules can be tested.
 * The one rule that matters: an action that replaces what is on this device (`pull`, `pull-confirm`)
 * is never returned when this device has changes the account hasn't seen.
 */

export interface RemoteHead {
  revision: number;
  deviceLabel: string;
  updatedAt: string;
}

/** What this device last synced: the account's revision, and the fingerprint the device had then. */
export interface SyncBase {
  revision: number;
  hash: string;
}

export interface DecideInput {
  remote: RemoteHead | null;
  base: SyncBase | null;
  localHash: string;
  /** No household and no rows. */
  localEmpty: boolean;
}

export type SyncAction =
  | { kind: 'idle' }
  | { kind: 'in-sync' }
  | { kind: 'push'; expected: number }
  | { kind: 'pull' }
  | { kind: 'pull-confirm' }
  | { kind: 'conflict'; reason: 'first-link' | 'diverged' }
  | { kind: 'cloud-reset' };

/** Local holds something the account has not seen. */
export function isDirty(input: Pick<DecideInput, 'base' | 'localHash' | 'localEmpty'>): boolean {
  return input.base ? input.localHash !== input.base.hash : !input.localEmpty;
}

/** Actions that overwrite this device's data. */
export const REPLACING_ACTIONS: ReadonlyArray<SyncAction['kind']> = ['pull', 'pull-confirm'];

export function decide(input: DecideInput): SyncAction {
  const { remote, base } = input;
  const dirty = isDirty(input);
  if (!base) {
    if (!remote) return input.localEmpty ? { kind: 'idle' } : { kind: 'push', expected: 0 };
    return input.localEmpty ? { kind: 'pull-confirm' } : { kind: 'conflict', reason: 'first-link' };
  }
  if (!remote || remote.revision < base.revision) return { kind: 'cloud-reset' };
  if (remote.revision === base.revision) return dirty ? { kind: 'push', expected: base.revision } : { kind: 'in-sync' };
  return dirty ? { kind: 'conflict', reason: 'diverged' } : { kind: 'pull' };
}
