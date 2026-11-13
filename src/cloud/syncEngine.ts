import { BACKUP_VERSION, buildBackup, parseHomebaseBackup, readBackup } from '../data/backup';
import type { HomeData, HomeStore } from '../data/store';
import type { StoredFile } from '../data/types';
import { toDateInput } from '../lib/dates';
import { canonicalHash } from './docHash';
import { decide, type RemoteHead, type SyncBase } from './decide';
import { RemoteObjectMissing, type CloudRemote, type RemoteHeadRow } from './remote';

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
  /** Shown for 'newer-version', 'damaged' and a 'cloud-reset' caused by a missing file. */
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

/** The part of the Web Locks API the engine uses. */
export interface LockApi {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>): Promise<unknown>;
}

/** The part of BroadcastChannel the engine uses. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: unknown) => void) | null;
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
  /** Web Locks, so one tab per account syncs. Default: the browser's; null turns it off. */
  locks?: LockApi | null;
  /** Tells other tabs of this browser that the stored data changed. Default: BroadcastChannel; null turns it off. */
  createChannel?: () => ChannelLike | null;
}

export const MAX_SYNC_BYTES = 45 * 1024 * 1024;
export const PUSH_DELAY_MS = 60_000;
export const CHECK_INTERVAL_MS = 15 * 60_000;
/** A file nobody points to is only cleared once it is this old, so another device's upload in progress is spared. */
export const ORPHAN_AGE_MS = 15 * 60_000;
export const NOT_SAVED_MESSAGE = 'Nothing changed. The backup file wasn’t saved.';
export const CHANGED_MESSAGE = 'Your home changed while the file was being saved, so nothing was replaced. Try again.';
export const NEWER_VERSION_MESSAGE = 'The cloud copy came from a newer Homebase. Reload Homebase to update it, then sync again.';
export const MISSING_FILE_MESSAGE = 'The cloud copy’s file is missing. Saving this device’s home again will fix it.';
/** Written in place of a fingerprint after Undo, so the engine sees this device as holding changes the account hasn't. */
const UNDONE_HASH = 'undone-pull';

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

interface FetchedDoc {
  text: string;
  doc: CloudDoc;
}

/** What must still be true on this device just before its data is replaced. */
type PullGuard = { hash: string } | { empty: true } | null;

interface UndoPoint {
  data: HomeData;
  files: StoredFile[];
  /** The revision this device had synced before the pull. */
  priorRevision: number;
  pulledHead: RemoteHeadRow;
  pulled: FetchedDoc;
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

const headInfo = (head: RemoteHeadRow): RemoteHead => ({ revision: head.revision, deviceLabel: head.deviceLabel, updatedAt: head.updatedAt });

const randomId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

function browserLocks(): LockApi | null {
  try {
    return typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks as unknown as LockApi) : null;
  } catch {
    return null;
  }
}

function browserChannel(): ChannelLike | null {
  try {
    return typeof BroadcastChannel !== 'undefined' ? (new BroadcastChannel('homebase-data') as unknown as ChannelLike) : null;
  } catch {
    return null;
  }
}

/**
 * Forgets what was synced before "Erase everything". It works with or without a running engine, so an
 * erased, empty home can never be mistaken for changes to push over the account's copy.
 */
export function forgetSyncBeforeErase(engine: { detach(): void } | null | undefined, syncState: Pick<SyncStateStore, 'clear'>): void {
  engine?.detach();
  syncState.clear();
}

export class SyncEngine {
  private state: SyncState = { status: 'idle', canUndo: false };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private head: RemoteHeadRow | null = null;
  private conflictDoc: FetchedDoc | null = null;
  private undoPoint: UndoPoint | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private applying = false;
  private stopped = false;
  private teardown: Array<() => void> = [];
  /** Only the tab holding the account's lock syncs. Without start() (tests) the engine leads. */
  private leader = true;
  /** Another tab of this browser has been heard from, so the stored data is re-read before acting. */
  private peerSeen = false;
  private channel: ChannelLike | null = null;
  /** A file uploaded and committed with no answer seen; the head is looked at before anything is decided about it. */
  private uncertain: { path: string; hash: string; expected: number } | null = null;
  /** Files this engine uploaded and could not remove; cleared at the next chance whatever their age. */
  private leftovers = new Set<string>();
  private releaseLock: (() => void) | null = null;
  private lockAbort: AbortController | null = null;

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
    if (this.leader && this.channel && !this.stopped) this.channel.postMessage({ kind: 'status', status: this.state.status, lastSyncedAt: this.state.lastSyncedAt });
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

  /**
   * Checks the account on start, on coming back to the tab, on going online, and every 15 minutes while
   * visible. When Web Locks exist, only one tab per account does this; the others wait and take over
   * if that tab closes.
   */
  start() {
    this.stopped = false;
    this.unsubscribeStore = this.deps.store.subscribe(() => {
      if (this.applying || this.stopped) return;
      this.channel?.postMessage('changed');
      if (this.leader) this.schedulePush();
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

    this.channel = (this.deps.createChannel ?? browserChannel)();
    if (this.channel) {
      this.channel.onmessage = (event) => {
        const data = (event as { data?: unknown } | null)?.data;
        if (typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === 'status') {
          this.mirrorLeader(data as { status?: unknown; lastSyncedAt?: unknown });
          return;
        }
        void this.onOtherTab();
      };
    }

    const locks = this.deps.locks === undefined ? browserLocks() : this.deps.locks;
    if (locks) {
      this.leader = false;
      this.lockAbort = new AbortController();
      const lead = () =>
        new Promise<void>((release) => {
          if (this.stopped) {
            release();
            return;
          }
          this.releaseLock = release;
          this.leader = true;
          void this.check();
        });
      locks.request(`homebase-sync-${this.deps.userId}`, { signal: this.lockAbort.signal }, lead).catch(() => {
        // Aborted by stop(), or the browser refused: without a lock this tab leads, as it would without the API.
        if (!this.stopped) {
          this.leader = true;
          void this.check();
        }
      });
    } else {
      this.leader = true;
      void this.check();
    }
  }

  stop() {
    this.stopped = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.pushTimer = null;
    this.checkTimer = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.lockAbort?.abort();
    this.lockAbort = null;
    this.releaseLock?.();
    this.releaseLock = null;
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = null;
    }
    for (const off of this.teardown.splice(0)) off();
  }

  /** Before "Erase everything" or sign-out: stop, and forget what was synced, so an empty home is never pushed. */
  detach() {
    this.stop();
    this.deps.syncState.clear();
    this.undoPoint = null;
    this.set({ status: 'idle', lastSyncedAt: undefined, conflict: undefined, canUndo: false });
  }

  /**
   * A tab that isn't syncing shows what the syncing tab reports, so Settings never claims "Up to date"
   * from launch. States that need a choice (conflict, confirm) are shown by the syncing tab only.
   */
  private mirrorLeader(message: { status?: unknown; lastSyncedAt?: unknown }) {
    if (this.leader || this.stopped) return;
    const shown: SyncStatus[] = ['checking', 'syncing', 'in-sync', 'pending', 'offline', 'too-big'];
    if (typeof message.status !== 'string' || !shown.includes(message.status as SyncStatus)) return;
    this.set({ status: message.status as SyncStatus, lastSyncedAt: typeof message.lastSyncedAt === 'string' ? message.lastSyncedAt : this.state.lastSyncedAt });
  }

  /** Another tab changed the stored data: read it again, and push it when this is the syncing tab. */
  private onOtherTab(): Promise<void> {
    this.peerSeen = true;
    return this.enqueue(async () => {
      if (this.stopped) return;
      await this.reloadStore();
      if (this.leader && !this.stopped) this.schedulePush();
    }).catch(() => undefined);
  }

  /** Reads the stored data again. The store's change notice is not a local edit, so it is not pushed as one. */
  private async reloadStore() {
    this.applying = true;
    try {
      await this.deps.store.load();
    } finally {
      this.applying = false;
    }
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
    return this.enqueue(() => (this.stopped ? Promise.resolve() : this.runCheck(Boolean(options.pushNow)))).catch(() => {
      // For example, no crypto.subtle on a plain-http address. Nothing was changed.
      if (!this.stopped) this.set({ status: 'offline' });
    });
  }

  // ---------- the check ----------

  private async local() {
    const data = this.deps.store.getSnapshot();
    const files = await this.deps.store.allFiles();
    return { data, files };
  }

  private async runCheck(pushNow: boolean): Promise<void> {
    if (!this.leader || this.stopped) return;
    if (this.state.status === 'idle') this.set({ status: 'checking' });
    let head: RemoteHeadRow | null;
    try {
      head = await this.deps.remote.head();
    } catch {
      this.set({ status: 'offline' });
      return;
    }
    if (this.stopped) return;
    this.head = head;
    await this.settleEarlierSave(head);
    const remote: RemoteHead | undefined = head ? headInfo(head) : undefined;

    let reloaded = false;
    for (;;) {
      const { data, files } = await this.local();
      const localHash = await canonicalHash(data, files);
      const base = this.readBase();
      const action = decide({
        remote: remote ?? null,
        base: base ? { revision: base.revision, hash: base.hash } : null,
        localHash,
        localEmpty: isEmptyHome(data),
      });
      // With another tab around, its writes are read before this one decides to replace or overwrite anything.
      if (this.peerSeen && !reloaded && action.kind !== 'idle' && action.kind !== 'in-sync') {
        reloaded = true;
        await this.reloadStore();
        continue;
      }
      if (this.stopped) return;

      switch (action.kind) {
        case 'idle':
          this.set({ status: 'idle', conflict: undefined, remote: undefined });
          return;
        case 'in-sync':
          this.set({ status: 'in-sync', lastSyncedAt: base?.syncedAt, conflict: undefined, remote, message: undefined });
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
          await this.pull(head!, true, base ? { hash: base.hash } : null);
          return;
        case 'pull-confirm':
          this.set({ status: 'needs-confirm', remote, conflict: undefined });
          return;
        case 'cloud-reset':
          this.set({ status: 'cloud-reset', remote, conflict: undefined, message: undefined });
          return;
        case 'conflict':
          await this.openConflict(head!, action.reason, data, files);
          return;
      }
    }
  }

  // ---------- push ----------

  private async push(expected: number, head: RemoteHeadRow | null, data: HomeData, files: StoredFile[], hash: string, recheck = true, headFileGone = false): Promise<boolean> {
    const { remote, userId, deviceId, deviceLabel } = this.deps;
    if (this.stopped) return false;
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
    // The account allows only a few files per person, so earlier leftovers are cleared first.
    await this.clearOrphans();
    try {
      await remote.upload(path, text);
    } catch {
      // The upload didn't finish, so nothing points at it.
      await this.discard(path);
      this.set({ status: 'offline' });
      return false;
    }
    if (this.stopped) {
      await this.discard(path);
      return false;
    }
    let revision: number | null | undefined;
    try {
      revision = await remote.commit({ expected, newPath: path, backupVersion: BACKUP_VERSION, sizeBytes, deviceId, deviceLabel });
    } catch {
      // The reply may have been lost after the account committed. Ask the account instead of guessing,
      // and never remove the file its head points to.
      revision = await this.settleUncertainCommit(path, expected);
    }
    if (revision === undefined) {
      // Not known whether it landed. The next check looks at the account's head and recognises the file if it did.
      this.uncertain = { path, hash, expected };
      this.set({ status: 'offline' });
      return false;
    }
    if (revision === null) {
      // Someone else committed first. The upload is not current, so it goes; the next decision sees the new revision.
      await this.discard(path);
      await this.clearOrphans();
      if (recheck) await this.runCheck(false);
      return false;
    }
    const syncedAt = new Date((this.deps.now ?? Date.now)()).toISOString();
    this.deps.syncState.write({ userId, revision, hash, syncedAt });
    this.undoPoint = null;
    this.set({ status: 'in-sync', lastSyncedAt: syncedAt, conflict: undefined, remote: undefined, canUndo: false, message: undefined });
    if (head && !headFileGone && head.revision === expected && head.objectPath && head.objectPath !== path) await remote.remove([head.objectPath]).catch(() => undefined);
    await remote.prune?.(path, revision).catch(() => undefined);
    this.deps.onEvent?.({ kind: 'synced', data });
    return true;
  }

  /** A save whose outcome was unknown: if the head is that file it did land, so this device records it as synced. */
  private async settleEarlierSave(head: RemoteHeadRow | null) {
    const earlier = this.uncertain;
    if (!earlier || !head) return;
    this.uncertain = null;
    if (head.objectPath === earlier.path) {
      const syncedAt = new Date((this.deps.now ?? Date.now)()).toISOString();
      this.deps.syncState.write({ userId: this.deps.userId, revision: head.revision, hash: earlier.hash, syncedAt });
      this.set({ lastSyncedAt: syncedAt });
    } else if (head.revision > earlier.expected) {
      // The account moved past the revision this save was made for, so that save can no longer land.
      await this.discard(earlier.path);
    } else {
      // Still at the old revision: the commit may yet arrive, so the file stays and is looked at again.
      this.uncertain = earlier;
    }
  }

  /** Removes a file this engine uploaded; if that fails it is remembered and tried again later. */
  private async discard(path: string) {
    try {
      await this.deps.remote.remove([path]);
      this.leftovers.delete(path);
    } catch {
      this.leftovers.add(path);
    }
  }

  /**
   * Removes the app's own orphans: files in this account's folder that the head doesn't point to and that
   * aren't an upload that may still be committing. Without this, failed saves pile up until the account's
   * file limit refuses every new save. Another device's upload in progress is spared by its age.
   */
  private async clearOrphans() {
    const { remote } = this.deps;
    if (!remote.listBackups || this.stopped) return;
    try {
      const current = await remote.head();
      const entries = await remote.listBackups();
      const now = (this.deps.now ?? Date.now)();
      const spared = new Set<string>([current?.objectPath ?? '', this.uncertain?.path ?? '']);
      const orphans = entries
        .filter((entry) => !spared.has(entry.path))
        .filter((entry) => this.leftovers.has(entry.path) || now - Date.parse(entry.createdAt) > ORPHAN_AGE_MS)
        .map((entry) => entry.path);
      if (orphans.length === 0) return;
      await remote.remove(orphans);
      for (const path of orphans) this.leftovers.delete(path);
    } catch {
      // Best effort: the next save tries again.
    }
  }

  /**
   * After a commit that threw: the revision if the account's head is the file just uploaded (the commit
   * did land), `null` if the head has provably moved past this save (the file is removed), or `undefined`
   * when it can't be told (the file is left alone, because a late commit may still land).
   */
  private async settleUncertainCommit(path: string, expected: number): Promise<number | null | undefined> {
    const { remote } = this.deps;
    let current: RemoteHeadRow | null;
    try {
      current = await remote.head();
    } catch {
      return undefined;
    }
    if (current && current.objectPath === path) return current.revision;
    // A head still at `expected`, or none at all, could still be a commit on its way. Only a head past it clears the file.
    if (current && current.revision > expected) {
      await this.discard(path);
      return null;
    }
    return undefined;
  }

  // ---------- pull ----------

  private async fetchDoc(head: RemoteHeadRow): Promise<FetchedDoc | 'offline' | 'blocked'> {
    let text: string;
    try {
      text = await this.deps.remote.download(head.objectPath);
    } catch (error) {
      if (error instanceof RemoteObjectMissing) {
        // The account points at a file that isn't there. That is not an outage: this device's home can be saved again.
        if (isEmptyHome(this.deps.store.getSnapshot())) {
          this.set({ status: 'damaged', message: 'The cloud copy’s file is missing, so nothing could be brought here.' });
        } else {
          this.set({ status: 'cloud-reset', remote: headInfo(head), conflict: undefined, message: MISSING_FILE_MESSAGE });
        }
        return 'blocked';
      }
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

  /**
   * Replaces this device's data with the account's. `guard` is checked again right before the data is
   * replaced, because the download can take seconds: if this device changed meanwhile, nothing is replaced.
   */
  private async pull(head: RemoteHeadRow, auto: boolean, guard: PullGuard): Promise<boolean> {
    if (this.stopped) return false;
    this.set({ status: 'syncing' });
    const fetched = await this.fetchDoc(head);
    if (fetched === 'offline' || fetched === 'blocked') return false;
    const result = await this.applyDoc(head, fetched, { announce: auto, undo: auto, guard });
    if (result === 'applied') return true;
    if (result === 'changed') {
      if (auto) {
        const { data, files } = await this.local();
        await this.openConflict(head, 'diverged', data, files, fetched);
      } else {
        await this.runCheck(false);
      }
    }
    return false;
  }

  private async applyDoc(head: RemoteHeadRow, fetched: FetchedDoc, opts: { announce: boolean; undo: boolean; guard: PullGuard }): Promise<'applied' | 'changed' | 'failed'> {
    if (this.stopped) return 'failed';
    const before = await this.local();
    if (opts.guard) {
      const beforeHash = await canonicalHash(before.data, before.files);
      const holds = 'empty' in opts.guard ? isEmptyHome(before.data) : opts.guard.hash === beforeHash;
      if (!holds) return 'changed';
    }
    // Nothing may have been written between reading and replacing.
    if (this.stopped) return 'failed';
    if (this.deps.store.getSnapshot() !== before.data) return 'changed';
    const prior = this.readBase();
    this.applying = true;
    try {
      await this.deps.store.replaceAll(fetched.doc.data, fetched.doc.files);
    } catch {
      this.applying = false;
      this.set({ status: 'offline' });
      return 'failed';
    }
    this.applying = false;
    const { data, files } = await this.local();
    const hash = await canonicalHash(data, files);
    const syncedAt = new Date((this.deps.now ?? Date.now)()).toISOString();
    this.deps.syncState.write({ userId: this.deps.userId, revision: head.revision, hash, syncedAt });
    this.undoPoint = opts.undo ? { data: before.data, files: before.files, priorRevision: prior?.revision ?? 0, pulledHead: head, pulled: fetched } : null;
    this.conflictDoc = null;
    this.channel?.postMessage('changed');
    this.set({ status: 'in-sync', lastSyncedAt: syncedAt, conflict: undefined, remote: undefined, canUndo: this.undoPoint !== null, message: undefined });
    if (opts.announce) this.deps.onEvent?.({ kind: 'pulled', deviceLabel: head.deviceLabel, canUndo: this.undoPoint !== null });
    this.deps.onEvent?.({ kind: 'synced', data });
    return 'applied';
  }

  /**
   * Puts back what was on this device before the last automatic pull, then pauses on the usual "choose
   * which copy to keep" step with the pulled copy as the account's side. Nothing is pushed or removed
   * here: the account still holds the other device's changes until the person decides, and the chosen
   * resolution saves the copy being replaced as a file first. Only works while this device still matches
   * the pulled copy, so Undo never throws away edits made since.
   */
  undoPull(): Promise<boolean> {
    return this.enqueue(async () => {
      const point = this.undoPoint;
      if (!point || this.stopped) return false;
      const { data, files } = await this.local();
      const base = this.readBase();
      if (!base || base.revision !== point.pulledHead.revision || base.hash !== (await canonicalHash(data, files))) {
        this.undoPoint = null;
        this.set({ canUndo: false });
        return false;
      }
      this.undoPoint = null;
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = null;
      this.applying = true;
      try {
        await this.deps.store.replaceAll(point.data, point.files);
      } catch {
        this.applying = false;
        this.set({ canUndo: false });
        return false;
      }
      this.applying = false;
      this.deps.syncState.write({ userId: this.deps.userId, revision: point.priorRevision, hash: UNDONE_HASH, syncedAt: base.syncedAt });
      const restored = await this.local();
      this.head = point.pulledHead;
      this.conflictDoc = point.pulled;
      this.channel?.postMessage('changed');
      this.set({
        status: 'conflict',
        canUndo: false,
        remote: undefined,
        conflict: {
          reason: 'diverged',
          remote: headInfo(point.pulledHead),
          remoteCounts: counts(point.pulled.doc.data, point.pulled.doc.files),
          localCounts: counts(restored.data, restored.files),
        },
      });
      return true;
    });
  }

  // ---------- the person's choices ----------

  /** "Bring it here", on a device with nothing in it. Checks again that it is still empty. */
  confirmPull(): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.stopped || !this.head || this.state.status !== 'needs-confirm') return false;
      if (!isEmptyHome(this.deps.store.getSnapshot())) {
        // The device was filled since the question was asked; that is now a choice between two homes.
        await this.runCheck(false);
        return false;
      }
      return this.pull(this.head, false, { empty: true });
    });
  }

  /**
   * "Save it", after the account's copy was deleted, reset or lost its file. The account is read again
   * first: a newer copy, or a file that turns out to be there, goes through the normal check (and its
   * conflict sheet with a safety file) instead of being replaced.
   */
  confirmCloudReset(): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.stopped || this.state.status !== 'cloud-reset') return false;
      let latest: RemoteHeadRow | null;
      try {
        latest = await this.deps.remote.head();
      } catch {
        this.set({ status: 'offline' });
        return false;
      }
      let fileGone = false;
      if (latest) {
        const seen = this.head;
        const same = seen !== null && seen.revision === latest.revision && seen.objectPath === latest.objectPath;
        if (same) {
          try {
            await this.deps.remote.download(latest.objectPath);
          } catch (error) {
            if (error instanceof RemoteObjectMissing) fileGone = true;
            else {
              this.set({ status: 'offline' });
              return false;
            }
          }
        }
        if (!fileGone) {
          this.head = latest;
          await this.runCheck(false);
          return false;
        }
      }
      this.head = latest;
      const { data, files } = await this.local();
      return this.push(latest?.revision ?? 0, latest, data, files, await canonicalHash(data, files), true, fileGone);
    });
  }

  private async openConflict(head: RemoteHeadRow, reason: ConflictInfo['reason'], data: HomeData, files: StoredFile[], already?: FetchedDoc) {
    const kept = this.state.conflict;
    if (!already && kept && kept.remote.revision === head.revision && this.conflictDoc) {
      this.set({ status: 'conflict', conflict: { ...kept, localCounts: counts(data, files) } });
      return;
    }
    const fetched = already ?? (await this.fetchDoc(head));
    if (fetched === 'offline' || fetched === 'blocked') return;
    this.conflictDoc = fetched;
    this.set({
      status: 'conflict',
      conflict: {
        reason,
        remote: headInfo(head),
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
      if (this.stopped || this.state.status !== 'conflict' || !conflict || !pending || !head) return { ok: false, message: 'Nothing to choose right now.' };
      const { data, files } = await this.local();
      const hash = await canonicalHash(data, files);
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
        // The file holds the copy as it was; if it changed while the file was being saved, that change is not in the file.
        const done = await this.applyDoc(head, pending, { announce: false, undo: false, guard: { hash } });
        if (done === 'changed') return { ok: false, message: CHANGED_MESSAGE };
        return done === 'applied' ? { ok: true } : { ok: false, message: NOT_SAVED_MESSAGE };
      }
      await this.push(conflict.remote.revision, head, data, files, hash);
      this.conflictDoc = null;
      return { ok: true };
    });
  }
}
