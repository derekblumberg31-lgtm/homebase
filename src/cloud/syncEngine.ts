import { BACKUP_VERSION, buildBackup, parseHomebaseBackup, readBackup } from '../data/backup';
import type { HomeData, HomeStore } from '../data/store';
import type { StoredFile } from '../data/types';
import { toDateInput } from '../lib/dates';
import { canonicalHash } from './docHash';
import { decide, type RemoteHead, type SyncBase } from './decide';
import type { CloudRemote, RemoteHeadRow } from './remote';

/**
 * Runs the sync: asks `decide` what to do, then pushes or pulls. Local data is the source of truth.
 * This device's data is replaced only when it holds nothing the account hasn't seen, or when the
 * person chooses, and the copy being replaced is saved as a backup file first.
 */

export type SyncStatus =
  | 'idle'
  | 'checking'
  | 'syncing'
  | 'in-sync'
  | 'pending'
  | 'conflict'
  | 'needs-confirm'
  | 'cloud-reset'
  | 'offline'
  | 'too-big'
  | 'newer-version'
  | 'damaged';

export interface Counts {
  tasks: number;
  systems: number;
  records: number;
  files: number;
}

export interface ConflictInfo {
  reason: 'first-link' | 'diverged';
  remote: RemoteHead;
  remoteCounts: Counts;
  localCounts: Counts;
}

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: string;
  conflict?: ConflictInfo;
  /** Who saved the account's copy, for the "bring it here" and "reset" sheets. */
  remote?: RemoteHead;
  sizeMB?: number;
  /** Shown for 'newer-version' and 'damaged'. */
  message?: string;
  canUndo: boolean;
}

export type EngineEvent =
  | { kind: 'pulled'; deviceLabel: string; canUndo: boolean }
  /** After every push or pull, and when a check finds this device already matches the account. */
  | { kind: 'synced'; data: HomeData };

export interface SyncStateStore {
  read(): { userId: string; revision: number; hash: string; syncedAt: string } | null;
  write(state: { userId: string; revision: number; hash: string; syncedAt: string }): void;
  clear(): void;
}

export interface EngineDeps {
  store: HomeStore;
  remote: CloudRemote;
  userId: string;
  deviceId: string;
  deviceLabel: string;
  /** Hands a file to the share sheet or a download. Anything but 'saved' means nothing may change. */
  deliverFile: (file: File) => Promise<'saved' | 'cancelled' | 'failed'>;
  syncState: SyncStateStore;
  onEvent?: (event: EngineEvent) => void;
  /** Overrides the size guard (tests). */
  maxBytes?: number;
  now?: () => number;
  random?: () => string;
}

export const MAX_SYNC_BYTES = 45 * 1024 * 1024;
export const PUSH_DELAY_MS = 60_000;
export const CHECK_INTERVAL_MS = 15 * 60_000;
export const NOT_SAVED_MESSAGE = 'Nothing changed. The backup file wasn’t saved.';
export const NEWER_VERSION_MESSAGE = 'The cloud copy came from a newer Homebase. Reload Homebase to update it, then sync again.';

export type ResolveResult = { ok: true } | { ok: false; message: string };

class CloudDocError extends Error {
  constructor(
    public kind: 'newer-version' | 'damaged',
    message: string,
  ) {
    super(message);
  }
}

interface CloudDoc {
  data: HomeData;
  files: StoredFile[];
}

/** The account's document, checked the same way a restored file is. Throws CloudDocError. */
function readCloudDoc(text: string): CloudDoc {
  const parsed = readBackup(text);
  if (!parsed) throw new CloudDocError('damaged', 'The cloud copy is damaged (a problem in its data), so nothing was changed.');
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) throw new CloudDocError('newer-version', NEWER_VERSION_MESSAGE);
  try {
    return parseHomebaseBackup(parsed);
  } catch (error) {
    throw new CloudDocError('damaged', error instanceof Error ? error.message : 'The cloud copy is damaged, so nothing was changed.');
  }
}

export function isEmptyHome(data: HomeData): boolean {
  return (
    !data.household &&
    !data.property &&
    data.rooms.length + data.systems.length + data.items.length + data.tasks.length + data.serviceEvents.length + data.records.length + data.activity.length === 0
  );
}

const counts = (data: HomeData, files: StoredFile[]): Counts => ({ tasks: data.tasks.length, systems: data.systems.length, records: data.records.length, files: files.length });

const randomId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

export class SyncEngine {
  private state: SyncState = { status: 'idle', canUndo: false };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private head: RemoteHeadRow | null = null;
  private conflictDoc: { text: string; doc: CloudDoc } | null = null;
  private undoPoint: { data: HomeData; files: StoredFile[] } | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private applying = false;
  private stopped = false;
  private teardown: Array<() => void> = [];

  constructor(private deps: EngineDeps) {
    const base = deps.syncState.read();
    if (base && base.userId === deps.userId) this.state = { status: 'idle', canUndo: false, lastSyncedAt: base.syncedAt };
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private readBase(): (SyncBase & { syncedAt: string }) | null {
    const stored = this.deps.syncState.read();
    return stored && stored.userId === this.deps.userId ? stored : null;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  // ---------- running ----------

  /** Checks the account on start, on coming back to the tab, on going online, and every 15 minutes while visible. */
  start() {
    this.stopped = false;
    this.unsubscribeStore = this.deps.store.subscribe(() => {
      if (this.applying || this.stopped) return;
      this.schedulePush();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.check();
      else void this.check({ pushNow: true });
    };
    const onOnline = () => void this.check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    this.teardown.push(() => document.removeEventListener('visibilitychange', onVisible), () => window.removeEventListener('online', onOnline));
    this.checkTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.check();
    }, CHECK_INTERVAL_MS);
    void this.check();
  }

  stop() {
    this.stopped = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.pushTimer = null;
    this.checkTimer = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    for (const off of this.teardown.splice(0)) off();
  }

  /** Before "Erase everything" or sign-out: stop, and forget what was synced, so an empty home is never pushed. */
  detach() {
    this.stop();
    this.deps.syncState.clear();
    this.set({ status: 'idle', lastSyncedAt: undefined, conflict: undefined, canUndo: false });
  }

  /** Pushes 60 seconds after the last change. Each change starts the wait again. */
  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.state.status === 'in-sync') this.set({ status: 'pending' });
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.check({ pushNow: true });
    }, PUSH_DELAY_MS);
  }

  /** "Sync now": check, and push anything waiting without the wait. */
  syncNow() {
    return this.check({ pushNow: true });
  }

  check(options: { pushNow?: boolean } = {}): Promise<void> {
    return this.enqueue(() => (this.stopped ? Promise.resolve() : this.runCheck(Boolean(options.pushNow))));
  }

  // ---------- the check ----------

  private async local() {
    const data = this.deps.store.getSnapshot();
    const files = await this.deps.store.allFiles();
    return { data, files };
  }

  private async runCheck(pushNow: boolean): Promise<void> {
    if (this.state.status === 'idle') this.set({ status: 'checking' });
    let head: RemoteHeadRow | null;
    try {
      head = await this.deps.remote.head();
    } catch {
      this.set({ status: 'offline' });
      return;
    }
    this.head = head;
    const { data, files } = await this.local();
    const localHash = await canonicalHash(data, files);
    const base = this.readBase();
    const action = decide({
      remote: head ? { revision: head.revision, deviceLabel: head.deviceLabel, updatedAt: head.updatedAt } : null,
      base: base ? { revision: base.revision, hash: base.hash } : null,
      localHash,
      localEmpty: isEmptyHome(data),
    });
    const remote: RemoteHead | undefined = head ? { revision: head.revision, deviceLabel: head.deviceLabel, updatedAt: head.updatedAt } : undefined;

    switch (action.kind) {
      case 'idle':
        this.set({ status: 'idle', conflict: undefined, remote: undefined });
        return;
      case 'in-sync':
        this.set({ status: 'in-sync', lastSyncedAt: base?.syncedAt, conflict: undefined, remote });
        this.deps.onEvent?.({ kind: 'synced', data });
        return;
      case 'push':
        if (!pushNow) {
          this.set({ status: 'pending', conflict: undefined });
          if (!this.pushTimer && !this.stopped) this.schedulePush();
          return;
        }
        await this.push(action.expected, head, data, files, localHash);
        return;
      case 'pull':
        await this.pull(head!, true);
        return;
      case 'pull-confirm':
        this.set({ status: 'needs-confirm', remote, conflict: undefined });
        return;
      case 'cloud-reset':
        this.set({ status: 'cloud-reset', remote, conflict: undefined });
        return;
      case 'conflict':
        await this.openConflict(head!, action.reason, data, files);
        return;
    }
  }

  // ---------- push ----------

  private async push(expected: number, head: RemoteHeadRow | null, data: HomeData, files: StoredFile[], hash: string, recheck = true): Promise<boolean> {
    const { remote, userId, deviceId, deviceLabel } = this.deps;
    this.set({ status: 'syncing', conflict: undefined });
    let text: string;
    try {
      text = await buildBackup(data, files);
    } catch {
      this.set({ status: 'offline' });
      return false;
    }
    const sizeBytes = new TextEncoder().encode(text).length;
    if (sizeBytes > (this.deps.maxBytes ?? MAX_SYNC_BYTES)) {
      this.set({ status: 'too-big', sizeMB: Math.round(sizeBytes / (1024 * 1024)) });
      return false;
    }
    const path = `${userId}/${expected + 1}-${(this.deps.random ?? randomId)()}.json`;
    let revision: number | null;
    try {
      await remote.upload(path, text);
      revision = await remote.commit({ expected, newPath: path, backupVersion: BACKUP_VERSION, sizeBytes, deviceId, deviceLabel });
    } catch {
      await remote.remove([path]).catch(() => undefined);
      this.set({ status: 'offline' });
      return false;
    }
    if (revision === null) {
      // Someone else committed first. The upload is not current, so it goes; the next decision sees the new revision.
      await remote.remove([path]).catch(() => undefined);
      if (recheck) await this.runCheck(false);
      return false;
    }
    const syncedAt = new Date((this.deps.now ?? Date.now)()).toISOString();
    this.deps.syncState.write({ userId, revision, hash, syncedAt });
    this.set({ status: 'in-sync', lastSyncedAt: syncedAt, conflict: undefined, remote: undefined });
    if (head && head.revision === expected && head.objectPath) await remote.remove([head.objectPath]).catch(() => undefined);
    this.deps.onEvent?.({ kind: 'synced', data });
    return true;
  }

  // ---------- pull ----------

  private async fetchDoc(head: RemoteHeadRow): Promise<{ text: string; doc: CloudDoc } | 'offline' | 'blocked'> {
    let text: string;
    try {
      text = await this.deps.remote.download(head.objectPath);
    } catch {
      this.set({ status: 'offline' });
      return 'offline';
    }
    try {
      return { text, doc: readCloudDoc(text) };
    } catch (error) {
      if (error instanceof CloudDocError) this.set({ status: error.kind, message: error.message });
      else this.set({ status: 'damaged', message: 'The cloud copy is damaged, so nothing was changed.' });
      return 'blocked';
    }
  }

  /** Replaces this device's data with the account's. Callers have already established that nothing here is unsynced, or that the person chose it. */
  private async pull(head: RemoteHeadRow, canUndo: boolean): Promise<boolean> {
    this.set({ status: 'syncing' });
    const fetched = await this.fetchDoc(head);
    if (fetched === 'offline' || fetched === 'blocked') return false;
    const before = canUndo ? await this.local() : null;
    return this.applyDoc(head, fetched.doc, before, true);
  }

  private async applyDoc(head: RemoteHeadRow, doc: CloudDoc, before: { data: HomeData; files: StoredFile[] } | null, announce: boolean): Promise<boolean> {
    this.applying = true;
    try {
      await this.deps.store.replaceAll(doc.data, doc.files);
    } catch {
      this.applying = false;
      this.set({ status: 'offline' });
      return false;
    }
    this.applying = false;
    const { data, files } = await this.local();
    const hash = await canonicalHash(data, files);
    const syncedAt = new Date((this.deps.now ?? Date.now)()).toISOString();
    this.deps.syncState.write({ userId: this.deps.userId, revision: head.revision, hash, syncedAt });
    this.undoPoint = before;
    this.set({ status: 'in-sync', lastSyncedAt: syncedAt, conflict: undefined, remote: undefined, canUndo: before !== null, message: undefined });
    if (announce) this.deps.onEvent?.({ kind: 'pulled', deviceLabel: head.deviceLabel, canUndo: before !== null });
    this.deps.onEvent?.({ kind: 'synced', data });
    return true;
  }

  /** Puts back what was on this device before the last automatic pull. The next push then saves it to the account. */
  undoPull(): Promise<boolean> {
    return this.enqueue(async () => {
      const point = this.undoPoint;
      if (!point) return false;
      this.undoPoint = null;
      this.applying = true;
      try {
        await this.deps.store.replaceAll(point.data, point.files);
      } catch {
        this.applying = false;
        return false;
      }
      this.applying = false;
      this.set({ canUndo: false, status: 'pending' });
      if (!this.stopped) this.schedulePush();
      return true;
    });
  }

  // ---------- the person's choices ----------

  /** "Bring it here", on a device with nothing in it. */
  confirmPull(): Promise<boolean> {
    return this.enqueue(async () => (this.head && this.state.status === 'needs-confirm' ? this.pull(this.head, false) : false));
  }

  /** "Save it", after the account's copy was deleted or reset elsewhere. */
  confirmCloudReset(): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.state.status !== 'cloud-reset') return false;
      const { data, files } = await this.local();
      return this.push(this.head?.revision ?? 0, this.head, data, files, await canonicalHash(data, files));
    });
  }

  private async openConflict(head: RemoteHeadRow, reason: ConflictInfo['reason'], data: HomeData, files: StoredFile[]) {
    const kept = this.state.conflict;
    if (kept && kept.remote.revision === head.revision && this.conflictDoc) {
      this.set({ status: 'conflict', conflict: { ...kept, localCounts: counts(data, files) } });
      return;
    }
    const fetched = await this.fetchDoc(head);
    if (fetched === 'offline' || fetched === 'blocked') return;
    this.conflictDoc = fetched;
    this.set({
      status: 'conflict',
      conflict: {
        reason,
        remote: { revision: head.revision, deviceLabel: head.deviceLabel, updatedAt: head.updatedAt },
        remoteCounts: counts(fetched.doc.data, fetched.doc.files),
        localCounts: counts(data, files),
      },
    });
  }

  /**
   * Resolves a conflict. The copy about to be replaced is delivered as a backup file first; if that
   * doesn't succeed, nothing changes on either side.
   */
  resolve(choice: 'local' | 'cloud'): Promise<ResolveResult> {
    return this.enqueue(async (): Promise<ResolveResult> => {
      const conflict = this.state.conflict;
      const pending = this.conflictDoc;
      const head = this.head;
      if (this.state.status !== 'conflict' || !conflict || !pending || !head) return { ok: false, message: 'Nothing to choose right now.' };
      const { data, files } = await this.local();
      const name = `homebase-before-sync-${toDateInput()}.json`;
      let outcome: 'saved' | 'cancelled' | 'failed';
      try {
        const text = choice === 'local' ? pending.text : await buildBackup(data, files);
        outcome = await this.deps.deliverFile(new File([text], name, { type: 'application/json' }));
      } catch {
        outcome = 'failed';
      }
      if (outcome !== 'saved') return { ok: false, message: NOT_SAVED_MESSAGE };

      if (choice === 'cloud') {
        const done = await this.applyDoc(head, pending.doc, null, false);
        this.conflictDoc = null;
        return done ? { ok: true } : { ok: false, message: NOT_SAVED_MESSAGE };
      }
      const hash = await canonicalHash(data, files);
      await this.push(conflict.remote.revision, head, data, files, hash);
      this.conflictDoc = null;
      return { ok: true };
    });
  }
}
