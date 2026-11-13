import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VERSION, buildBackup } from '../data/backup';
import type { Task } from '../data/types';
import { freshStore } from '../test/freshStore';
import { canonicalHash } from './docHash';
import { RemoteObjectMissing, type CloudRemote, type CommitArgs, type RemoteHeadRow } from './remote';
import { syncCoversBackup } from './copy';
import { createDatabase } from '../data/db';
import { HomeStore } from '../data/store';
import {
  CHANGED_MESSAGE,
  forgetSyncBeforeErase,
  MAX_SYNC_BYTES,
  MISSING_FILE_MESSAGE,
  NEWER_VERSION_MESSAGE,
  NOT_SAVED_MESSAGE,
  SyncEngine,
  type ChannelLike,
  type LockApi,
  type SyncStateStore,
} from './syncEngine';

const USER = 'user-1';

const task = (id: string, name: string): Task => ({
  id,
  kind: 'maintenance',
  name,
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

async function seed(store: HomeStore, names: string[]) {
  await store.saveHousehold({ id: 'household', name: 'Test home', members: [{ id: 'm1', name: 'Dana', role: 'owner' }], createdAt: '2026-08-01T00:00:00.000Z', onboardedAt: '2026-08-01T00:00:00.000Z' });
  for (const [i, name] of names.entries()) await store.put('tasks', task(`t${i}`, name));
}

/** An in-memory account that follows the same compare-and-swap rule as the SQL function. */
class FakeRemote implements CloudRemote {
  row: RemoteHeadRow | null = null;
  objects = new Map<string, string>();
  uploads: string[] = [];
  removed: string[] = [];
  commits: CommitArgs[] = [];
  offline = false;
  /** Runs just before a commit, so a test can play "another device committed first". */
  beforeCommit?: () => void;
  /** Runs while a download is under way, so a test can play "the person edited meanwhile". */
  onDownload?: () => Promise<void>;
  /** The commit lands in the account, then the reply is lost. */
  lostReply = false;
  /** The commit never reaches the account, and the reply is an error. */
  commitFails = false;
  /** Reading the head fails after this many more successful reads. */
  headFailsAfter: number | null = null;

  private guard() {
    if (this.offline) throw new Error('offline');
  }
  async head() {
    this.guard();
    if (this.headFailsAfter !== null) {
      if (this.headFailsAfter <= 0) throw new Error('offline');
      this.headFailsAfter -= 1;
    }
    return this.row;
  }
  async download(path: string) {
    this.guard();
    await this.onDownload?.();
    const text = this.objects.get(path);
    if (text === undefined) throw new RemoteObjectMissing(path);
    return text;
  }
  /** Like the storage policy: a new file is refused once this many are stored. */
  maxFiles = Infinity;
  /** The upload is stored, then the reply is lost. */
  uploadLost = false;
  /** Removing files fails. */
  removeFails = false;
  created = new Map<string, number>();
  async upload(path: string, text: string) {
    this.guard();
    if (this.objects.size >= this.maxFiles) throw new Error('new row violates row-level security policy');
    this.uploads.push(path);
    this.objects.set(path, text);
    this.created.set(path, Date.now());
    if (this.uploadLost) throw new Error('the reply never arrived');
  }
  async listBackups() {
    this.guard();
    return [...this.objects.keys()].map((path) => ({ path, createdAt: new Date(this.created.get(path) ?? Date.now()).toISOString() }));
  }
  async commit(args: CommitArgs) {
    this.guard();
    this.commits.push(args);
    this.beforeCommit?.();
    if (this.commitFails) throw new Error('network');
    const current = this.row?.revision ?? 0;
    if (current !== args.expected) return null;
    this.row = { revision: current + 1, objectPath: args.newPath, backupVersion: args.backupVersion, sizeBytes: args.sizeBytes, deviceId: args.deviceId, deviceLabel: args.deviceLabel, updatedAt: new Date().toISOString() };
    if (this.lostReply) throw new Error('the reply never arrived');
    return current + 1;
  }
  async remove(paths: string[]) {
    if (this.removeFails) throw new Error('network');
    this.removed.push(...paths);
    for (const p of paths) this.objects.delete(p);
  }
  async deleteAccount() {
    this.objects.clear();
    this.row = null;
  }
  feed: { secret: string; ics: string } | null = null;
  async hasCalendarFeed() {
    return this.feed !== null;
  }
  async resetCalendarToken() {
    this.feed = { secret: `secret-${Math.random().toString(16).slice(2)}`, ics: '' };
    return this.feed.secret;
  }
  async putCalendarFeed(ics: string) {
    if (this.feed) this.feed.ics = ics;
  }
  /** Another device saves a document. */
  async setCloud(text: string, label = 'iPhone') {
    const revision = (this.row?.revision ?? 0) + 1;
    const objectPath = `${USER}/${revision}-other.json`;
    this.objects.set(objectPath, text);
    this.row = { revision, objectPath, backupVersion: BACKUP_VERSION, sizeBytes: text.length, deviceId: 'other', deviceLabel: label, updatedAt: '2026-11-10T09:12:00.000Z' };
  }
}

function memoryState(): SyncStateStore & { value: ReturnType<SyncStateStore['read']>; log: string[] } {
  const self = {
    value: null as ReturnType<SyncStateStore['read']>,
    log: [] as string[],
    read: () => self.value,
    write: (state: NonNullable<ReturnType<SyncStateStore['read']>>) => {
      self.value = state;
    },
    clear: () => {
      self.log.push('clear');
      self.value = null;
    },
  };
  return self;
}

async function backupOf(names: string[], version = BACKUP_VERSION) {
  const other = await freshStore();
  await seed(other, names);
  const text = await buildBackup(other.getSnapshot(), await other.allFiles());
  return version === BACKUP_VERSION ? text : text.replace(`"version":${BACKUP_VERSION}`, `"version":${version}`);
}

let store: HomeStore;
let remote: FakeRemote;
let state: ReturnType<typeof memoryState>;
let deliver: ReturnType<typeof vi.fn<(file: File) => Promise<'saved' | 'cancelled' | 'failed'>>>;

function engine(extra: Partial<ConstructorParameters<typeof SyncEngine>[0]> = {}) {
  return new SyncEngine({ store, remote, userId: USER, deviceId: 'dev-a', deviceLabel: 'Mac', deliverFile: deliver, syncState: state, random: () => 'abcd1234', ...extra });
}

beforeEach(async () => {
  store = await freshStore();
  remote = new FakeRemote();
  state = memoryState();
  deliver = vi.fn(async () => 'saved' as const);
});

describe('first save and ordinary pushes', () => {
  it('saves a home to an empty account, then reports in sync', async () => {
    await seed(store, ['Change the filter']);
    const e = engine();
    await e.check({ pushNow: true });
    expect(remote.commits).toHaveLength(1);
    expect(remote.commits[0].expected).toBe(0);
    expect(remote.commits[0].newPath).toBe(`${USER}/1-abcd1234.json`);
    expect(e.getState().status).toBe('in-sync');
    expect(state.value?.revision).toBe(1);
  });

  it('does nothing for an empty device and an empty account', async () => {
    const e = engine();
    await e.check({ pushNow: true });
    expect(remote.uploads).toHaveLength(0);
    expect(e.getState().status).toBe('idle');
  });

  it('pushes with expected = the revision it last saw, and removes the previous object', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    const first = remote.row!.objectPath;
    await store.put('tasks', task('t9', 'B'));
    await e.check({ pushNow: true });
    expect(remote.commits[1].expected).toBe(1);
    expect(remote.row!.revision).toBe(2);
    expect(remote.removed).toContain(first);
    expect(e.getState().status).toBe('in-sync');
  });

  it('waits for the quiet period instead of pushing at once', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    await store.put('tasks', task('t9', 'B'));
    await e.check();
    expect(remote.commits).toHaveLength(1);
    expect(e.getState().status).toBe('pending');
    e.stop();
  });
});

describe('a failed commit', () => {
  it('becomes a conflict and deletes the object it just uploaded', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    await store.put('tasks', task('t9', 'Local edit'));
    // Another device commits between this device's check and its commit.
    const cloudDoc = await backupOf(['Edited elsewhere']);
    remote.beforeCommit = () => {
      remote.beforeCommit = undefined;
      void remote.setCloud(cloudDoc);
    };
    const before = store.getSnapshot();
    await e.check({ pushNow: true });
    expect(remote.removed).toContain(`${USER}/2-abcd1234.json`);
    expect(remote.objects.has(`${USER}/2-abcd1234.json`)).toBe(false);
    expect(e.getState().status).toBe('conflict');
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('pulling', () => {
  async function synced() {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    return e;
  }

  it('replaces a clean device with the newer cloud copy, and Undo puts the old data back exactly', async () => {
    const e = await synced();
    const beforeData = store.getSnapshot();
    const beforeHash = await canonicalHash(beforeData, await store.allFiles());
    await remote.setCloud(await backupOf(['A', 'Added on the iPhone']));
    await e.check();
    expect(e.getState().status).toBe('in-sync');
    expect(store.getSnapshot().tasks.map((t) => t.name).sort()).toEqual(['A', 'Added on the iPhone']);
    expect(state.value?.revision).toBe(2);
    expect(e.getState().canUndo).toBe(true);

    const cloudRow = remote.row;
    expect(await e.undoPull()).toBe(true);
    expect(store.getSnapshot()).toEqual(beforeData);
    expect(await canonicalHash(store.getSnapshot(), await store.allFiles())).toBe(beforeHash);
    // Nothing reached the account: it still holds the other device's copy, and sync waits for a choice.
    expect(remote.row).toBe(cloudRow);
    expect(remote.objects.has(cloudRow!.objectPath)).toBe(true);
    expect(remote.commits).toHaveLength(1);
    expect(e.getState().status).toBe('conflict');
    expect(e.getState().canUndo).toBe(false);
    e.stop();
  });

  it('after Undo, no check or sync pushes over the account, and either choice saves a file first', async () => {
    const e = await synced();
    const iphoneDoc = await backupOf(['A', 'Added on the iPhone']);
    await remote.setCloud(iphoneDoc);
    await e.check();
    expect(await e.undoPull()).toBe(true);
    const iphoneRow = remote.row;
    const replace = vi.spyOn(store, 'replaceAll');

    await e.check();
    await e.check({ pushNow: true });
    await e.syncNow();
    expect(remote.commits).toHaveLength(1);
    expect(remote.row).toBe(iphoneRow);
    expect(remote.removed).not.toContain(iphoneRow!.objectPath);
    expect(replace).not.toHaveBeenCalled();
    expect(e.getState().status).toBe('conflict');
    expect(e.getState().conflict).toMatchObject({ reason: 'diverged', remoteCounts: { tasks: 2 }, localCounts: { tasks: 1 } });

    // Keeping this device's copy saves the other device's copy as a file before replacing it in the account.
    expect(await e.resolve('local')).toEqual({ ok: true });
    expect(await deliver.mock.calls[0][0].text()).toContain('Added on the iPhone');
    expect(remote.row?.revision).toBe(3);
    e.stop();
  });

  it('after Undo, taking the cloud copy again brings the other device’s changes back', async () => {
    const e = await synced();
    await remote.setCloud(await backupOf(['A', 'Added on the iPhone']));
    await e.check();
    await e.undoPull();
    expect(await e.resolve('cloud')).toEqual({ ok: true });
    expect(store.getSnapshot().tasks.map((t) => t.name).sort()).toEqual(['A', 'Added on the iPhone']);
    expect(remote.commits).toHaveLength(1);
    e.stop();
  });

  it('Undo does nothing once this device has changed since the pull', async () => {
    const e = await synced();
    await remote.setCloud(await backupOf(['A', 'Added on the iPhone']));
    await e.check();
    await store.put('tasks', task('t9', 'Typed after the pull'));
    expect(await e.undoPull()).toBe(false);
    expect(store.getSnapshot().tasks.map((t) => t.name)).toContain('Typed after the pull');
    expect(e.getState().canUndo).toBe(false);
    e.stop();
  });

  it('an edit made while the cloud copy downloads is never overwritten', async () => {
    const e = await synced();
    await remote.setCloud(await backupOf(['A', 'Added on the iPhone']));
    remote.onDownload = async () => {
      remote.onDownload = undefined;
      await store.put('tasks', task('t9', 'Typed during the download'));
    };
    const replace = vi.spyOn(store, 'replaceAll');
    await e.check();
    expect(replace).not.toHaveBeenCalled();
    expect(e.getState().status).toBe('conflict');
    expect(e.getState().conflict?.reason).toBe('diverged');
    expect(store.getSnapshot().tasks.map((t) => t.name)).toContain('Typed during the download');
    expect(state.value?.revision).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
    e.stop();
  });

  it('"Use the cloud copy" refuses when the home changed while the file was being saved', async () => {
    const e = await synced();
    await store.put('tasks', task('t8', 'Edited here'));
    await remote.setCloud(await backupOf(['A', 'Edited there']));
    await e.check();
    expect(e.getState().status).toBe('conflict');
    deliver.mockImplementationOnce(async () => {
      await store.put('tasks', task('t7', 'Typed while the share sheet was open'));
      return 'saved';
    });
    expect(await e.resolve('cloud')).toEqual({ ok: false, message: CHANGED_MESSAGE });
    expect(store.getSnapshot().tasks.map((t) => t.name)).toContain('Typed while the share sheet was open');
    expect(e.getState().status).toBe('conflict');
    e.stop();
  });

  it('"Bring it here" checks again that the device is still empty', async () => {
    await remote.setCloud(await backupOf(['From the cloud']));
    const e = engine();
    await e.check();
    expect(e.getState().status).toBe('needs-confirm');
    // The person says "Not now", adds two jobs, then opens Settings and taps "Bring it here".
    await store.put('tasks', task('t1', 'Added after the question'));
    await store.put('tasks', task('t2', 'Another one'));
    const replace = vi.spyOn(store, 'replaceAll');
    expect(await e.confirmPull()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(store.getSnapshot().tasks.map((t) => t.name).sort()).toEqual(['Added after the question', 'Another one']);
    expect(e.getState().status).toBe('conflict');
    expect(e.getState().conflict?.reason).toBe('first-link');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('rejects a cloud copy from a newer Homebase and leaves this device alone', async () => {
    const e = await synced();
    const before = store.getSnapshot();
    await remote.setCloud(await backupOf(['A', 'B'], BACKUP_VERSION + 1));
    await e.check();
    expect(e.getState().status).toBe('newer-version');
    expect(e.getState().message).toBe(NEWER_VERSION_MESSAGE);
    expect(store.getSnapshot()).toBe(before);
    expect(state.value?.revision).toBe(1);
  });

  it('rejects a damaged cloud copy and leaves this device alone', async () => {
    const e = await synced();
    const before = store.getSnapshot();
    const good = JSON.parse(await backupOf(['A', 'B']));
    good.data.tasks[0].intervalDays = 'often';
    await remote.setCloud(JSON.stringify(good));
    await e.check();
    expect(e.getState().status).toBe('damaged');
    expect(e.getState().message).toMatch(/damaged/);
    expect(store.getSnapshot()).toBe(before);
    await remote.setCloud('{ not json');
    await e.check();
    expect(e.getState().status).toBe('damaged');
    expect(store.getSnapshot()).toBe(before);
  });

  it('asks before filling an empty device from an account that has a home', async () => {
    await remote.setCloud(await backupOf(['From the cloud']));
    const e = engine();
    await e.check();
    expect(e.getState().status).toBe('needs-confirm');
    expect(store.getSnapshot().tasks).toHaveLength(0);
    expect(await e.confirmPull()).toBe(true);
    expect(store.getSnapshot().tasks.map((t) => t.name)).toEqual(['From the cloud']);
    expect(e.getState().status).toBe('in-sync');
  });

  it('offers to save again when the cloud copy was reset', async () => {
    const e = await synced();
    remote.row = null;
    await e.check();
    expect(e.getState().status).toBe('cloud-reset');
    expect(remote.commits).toHaveLength(1);
    expect(await e.confirmCloudReset()).toBe(true);
    expect((remote.row as RemoteHeadRow | null)?.revision).toBe(1);
  });
});

describe('a conflict', () => {
  async function conflicted() {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    await store.put('tasks', task('t8', 'Edited here'));
    await remote.setCloud(await backupOf(['A', 'Edited there', 'And there']));
    await e.check();
    expect(e.getState().status).toBe('conflict');
    return e;
  }

  it('shows counts from both copies and never calls replaceAll before a choice', async () => {
    const replace = vi.spyOn(store, 'replaceAll');
    const e = await conflicted();
    const c = e.getState().conflict!;
    expect(c.localCounts).toMatchObject({ tasks: 2 });
    expect(c.remoteCounts).toMatchObject({ tasks: 3 });
    // More checks while paused still change nothing.
    await e.check({ pushNow: true });
    await e.check();
    expect(replace).not.toHaveBeenCalled();
    expect(remote.commits).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('a cancelled safety file leaves both sides unchanged', async () => {
    const replace = vi.spyOn(store, 'replaceAll');
    const e = await conflicted();
    const local = store.getSnapshot();
    const cloudRow = remote.row;
    for (const outcome of ['cancelled', 'failed'] as const) {
      deliver.mockResolvedValueOnce(outcome);
      expect(await e.resolve('cloud')).toEqual({ ok: false, message: NOT_SAVED_MESSAGE });
      deliver.mockResolvedValueOnce(outcome);
      expect(await e.resolve('local')).toEqual({ ok: false, message: NOT_SAVED_MESSAGE });
    }
    expect(replace).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(local);
    expect(remote.row).toBe(cloudRow);
    expect(remote.commits).toHaveLength(1);
    expect(e.getState().status).toBe('conflict');
  });

  it('"Use the cloud copy" saves this device’s copy as a file first, then replaces it', async () => {
    const e = await conflicted();
    expect(await e.resolve('cloud')).toEqual({ ok: true });
    const file = deliver.mock.calls[0][0];
    expect(file.name).toMatch(/^homebase-before-sync-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await file.text()).toContain('Edited here');
    expect(store.getSnapshot().tasks.map((t) => t.name).sort()).toEqual(['A', 'And there', 'Edited there']);
    expect(e.getState().status).toBe('in-sync');
  });

  it('"Keep this device’s copy" saves the cloud copy as a file first, then pushes over it', async () => {
    const e = await conflicted();
    expect(await e.resolve('local')).toEqual({ ok: true });
    const file = deliver.mock.calls[0][0];
    expect(await file.text()).toContain('Edited there');
    expect(remote.row?.revision).toBe(3);
    expect(store.getSnapshot().tasks.map((t) => t.name).sort()).toEqual(['A', 'Edited here']);
    expect(e.getState().status).toBe('in-sync');
  });

  it('a device with data meeting an account with a home is a first-link conflict', async () => {
    await seed(store, ['Mine']);
    await remote.setCloud(await backupOf(['Theirs']));
    const e = engine();
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('conflict');
    expect(e.getState().conflict?.reason).toBe('first-link');
    expect(remote.commits).toHaveLength(0);
    expect(store.getSnapshot().tasks.map((t) => t.name)).toEqual(['Mine']);
  });
});

describe('erase while signed in', () => {
  it('forgets the sync state before the data is erased, and nothing is pushed afterwards', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    const order: string[] = [];
    const erase = store.eraseAll.bind(store);
    vi.spyOn(store, 'eraseAll').mockImplementation(async () => {
      order.push(state.value === null ? 'state-cleared-first' : 'state-still-there');
      await erase();
    });
    e.detach();
    await store.eraseAll();
    await e.check({ pushNow: true });
    await e.syncNow();
    expect(order).toEqual(['state-cleared-first']);
    expect(state.value).toBeNull();
    expect(remote.commits).toHaveLength(1);
    expect(remote.row?.revision).toBe(1);
  });
});

describe('limits and failures', () => {
  it('pauses a home over the size limit without uploading', async () => {
    expect(MAX_SYNC_BYTES).toBe(45 * 1024 * 1024);
    await seed(store, ['A']);
    const e = engine({ maxBytes: 100 });
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('too-big');
    expect(e.getState().sizeMB).toBeGreaterThanOrEqual(0);
    expect(remote.uploads).toHaveLength(0);
    expect(remote.commits).toHaveLength(0);
  });

  it('an unreachable account is a quiet status, and the data is untouched', async () => {
    await seed(store, ['A']);
    remote.offline = true;
    const e = engine();
    const before = store.getSnapshot();
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('offline');
    expect(store.getSnapshot()).toBe(before);
    remote.offline = false;
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('in-sync');
  });

  it('a different account on this device starts from no sync state', async () => {
    state.value = { userId: 'someone-else', revision: 5, hash: 'x', syncedAt: '2026-11-01T00:00:00.000Z' };
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    expect(remote.commits[0].expected).toBe(0);
  });
});

describe('a commit whose reply is lost', () => {
  it('never removes the object the account now points to, and counts as saved', async () => {
    await seed(store, ['A']);
    const e = engine();
    remote.lostReply = true;
    await e.check({ pushNow: true });
    const head = remote.row!;
    expect(head.objectPath).toBe(`${USER}/1-abcd1234.json`);
    expect(remote.objects.has(head.objectPath)).toBe(true);
    expect(remote.removed).not.toContain(head.objectPath);
    // This device learned of its own commit from the account, so it is in sync and the next device can download it.
    expect(e.getState().status).toBe('in-sync');
    expect(state.value?.revision).toBe(1);
    const other = await remote.download(head.objectPath);
    expect(other).toContain('"A"');
  });

  it('with the account unreadable afterwards, it leaves the uploaded object alone', async () => {
    await seed(store, ['A']);
    const e = engine();
    remote.lostReply = true;
    remote.headFailsAfter = 1; // the check reads the head once, then the account stops answering
    await e.check({ pushNow: true });
    expect(remote.objects.has(`${USER}/1-abcd1234.json`)).toBe(true);
    expect(remote.removed).toHaveLength(0);
    expect(e.getState().status).toBe('offline');
    // Back online: the account's head is the object this device uploaded, so this device recognises its own save.
    remote.headFailsAfter = null;
    remote.lostReply = false;
    await e.check({ pushNow: true });
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
    expect(e.getState().status).toBe('in-sync');
    expect(state.value?.revision).toBe(1);
    expect(remote.commits).toHaveLength(1);
  });

  it('removes its upload only when the account provably points somewhere else', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    await store.put('tasks', task('t9', 'B'));
    remote.commitFails = true;
    remote.beforeCommit = () => {
      remote.beforeCommit = undefined;
      void remote.setCloud('{}'); // another device committed, and this device's commit never arrived
    };
    await e.check({ pushNow: true });
    expect(remote.removed).toContain(`${USER}/2-abcd1234.json`);
    expect(remote.row?.objectPath).toBe(`${USER}/2-other.json`);
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
  });

  it('a commit that fails with no head to compare keeps the upload', async () => {
    await seed(store, ['A']);
    const e = engine();
    remote.commitFails = true;
    await e.check({ pushNow: true });
    expect(remote.row).toBeNull();
    expect(remote.removed).toHaveLength(0);
    expect(e.getState().status).toBe('offline');
  });
});

describe('leftover uploads', () => {
  const OLD = Date.now() - 60 * 60_000;

  it('failed uploads never pile up to the file limit', async () => {
    await seed(store, ['A']);
    remote.maxFiles = 6;
    let n = 0;
    const e = engine({ random: () => `n${String(n++).padStart(7, '0')}` });
    remote.uploadLost = true;
    remote.removeFails = true;
    for (let i = 0; i < 4; i++) await e.check({ pushNow: true });
    expect(remote.objects.size).toBe(4);
    // Back to normal: the leftovers go before the next upload, so it is not refused.
    remote.uploadLost = false;
    remote.removeFails = false;
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('in-sync');
    expect([...remote.objects.keys()]).toEqual([remote.row!.objectPath]);
  });

  it('an account already at the limit recovers on the next sync, and the head survives', async () => {
    await seed(store, ['A']);
    const first = engine();
    await first.check({ pushNow: true });
    const headPath = remote.row!.objectPath;
    for (let i = 0; i < 5; i++) {
      remote.objects.set(`${USER}/2-old${i}xxxxx.json`, '{}');
      remote.created.set(`${USER}/2-old${i}xxxxx.json`, OLD);
    }
    remote.maxFiles = 6;
    await store.put('tasks', task('t9', 'B'));
    const e = engine({ random: () => 'newnew12' });
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('in-sync');
    expect(remote.row?.revision).toBe(2);
    expect(remote.removed).toContain(headPath); // replaced by the new head in the usual way
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
    expect(remote.objects.size).toBe(1);
  });

  it('spares the head, an upload that may still commit, and a file another device just made', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    const headPath = remote.row!.objectPath;
    remote.objects.set(`${USER}/2-fresh123.json`, '{}'); // created just now by another device
    await store.put('tasks', task('t9', 'B'));
    remote.lostReply = false;
    remote.commitFails = true;
    await e.check({ pushNow: true }); // head still at 1: the commit may land, so the upload stays
    const uncertain = `${USER}/2-abcd1234.json`;
    expect(remote.objects.has(uncertain)).toBe(true);
    expect(remote.objects.has(headPath)).toBe(true);
    remote.commitFails = false;
    await e.check({ pushNow: true });
    expect(remote.objects.has(`${USER}/2-fresh123.json`)).toBe(true);
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
  });

  it('a commit that fails at the old revision keeps its upload, and clears it once the account has moved on', async () => {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    await store.put('tasks', task('t9', 'B'));
    remote.commitFails = true;
    await e.check({ pushNow: true });
    const upload = `${USER}/2-abcd1234.json`;
    expect(remote.removed).not.toContain(upload);
    expect(remote.objects.has(upload)).toBe(true);
    // The late commit never arrives and another device saves revision 2.
    await remote.setCloud(await backupOf(['A', 'Z']));
    await e.check();
    expect(remote.removed).toContain(upload);
  });
});

describe('a cloud object that is missing', () => {
  async function missing() {
    await seed(store, ['A']);
    const e = engine();
    await e.check({ pushNow: true });
    return e;
  }

  it('is a recoverable state, not "can’t reach your account"', async () => {
    const e = await missing();
    // Another device saved revision 2, and the file its head points to is gone.
    await remote.setCloud(await backupOf(['A', 'B']));
    remote.objects.delete(remote.row!.objectPath);
    await store.put('tasks', task('t9', 'Local edit'));
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('cloud-reset');
    expect(e.getState().message).toBe(MISSING_FILE_MESSAGE);
    expect(syncCoversBackup(e.getState())).toBe(false);
    // "Save it" puts this device's home in the account again.
    expect(await e.confirmCloudReset()).toBe(true);
    expect(remote.row?.revision).toBe(3);
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
    expect(e.getState().status).toBe('in-sync');
  });

  it('"Save it" reads the account again: a newer copy goes to the conflict sheet, nothing is replaced', async () => {
    const e = await missing();
    await remote.setCloud(await backupOf(['A', 'B']));
    remote.objects.delete(remote.row!.objectPath);
    await store.put('tasks', task('t9', 'Local edit'));
    await e.check({ pushNow: true });
    expect(e.getState().status).toBe('cloud-reset');
    // Meanwhile another device saves revision 3, and its file is there.
    await remote.setCloud(await backupOf(['A', 'B', 'C']));
    const commitsBefore = remote.commits.length;
    expect(await e.confirmCloudReset()).toBe(false);
    expect(remote.commits.length).toBe(commitsBefore);
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
    expect(e.getState().status).toBe('conflict');
    expect(store.getSnapshot().tasks.some((t) => t.name === 'Local edit')).toBe(true);
    await e.resolve('cloud');
    expect(deliver).toHaveBeenCalled();
  });

  it('"Save it" with an unreachable account does nothing', async () => {
    const e = await missing();
    await remote.setCloud(await backupOf(['A', 'B']));
    remote.objects.delete(remote.row!.objectPath);
    await store.put('tasks', task('t9', 'Local edit'));
    await e.check({ pushNow: true });
    remote.offline = true;
    const commitsBefore = remote.commits.length;
    expect(await e.confirmCloudReset()).toBe(false);
    expect(remote.commits.length).toBe(commitsBefore);
    expect(e.getState().status).toBe('offline');
  });

  it('a download that fails for any other reason is "can’t reach your account", not a missing file', async () => {
    const e = await missing();
    await remote.setCloud(await backupOf(['A', 'B']));
    const realDownload = remote.download.bind(remote);
    remote.download = async () => {
      throw new Error('Not Found (from a proxy)');
    };
    await e.check();
    expect(e.getState().status).toBe('offline');
    remote.download = realDownload;
  });

  it('a clean device that finds the file missing offers the same recovery', async () => {
    const e = await missing();
    await remote.setCloud(await backupOf(['A', 'B']));
    remote.objects.delete(remote.row!.objectPath);
    await e.check();
    expect(e.getState().status).toBe('cloud-reset');
    expect(e.getState().status).not.toBe('offline');
    expect(store.getSnapshot().tasks).toHaveLength(1);
  });
});

describe('the backup nudge while sync is unhealthy', () => {
  const recent = new Date().toISOString();
  it('stays when sync is stuck, even if a sync was recent', () => {
    for (const status of ['conflict', 'needs-confirm', 'cloud-reset', 'too-big', 'newer-version', 'damaged'] as const) {
      expect(syncCoversBackup({ status, lastSyncedAt: recent }), status).toBe(false);
    }
  });
  it('is covered when in sync, or briefly waiting after a recent sync', () => {
    expect(syncCoversBackup({ status: 'in-sync', lastSyncedAt: recent })).toBe(true);
    expect(syncCoversBackup({ status: 'pending', lastSyncedAt: recent })).toBe(true);
    expect(syncCoversBackup({ status: 'offline', lastSyncedAt: recent })).toBe(true);
    expect(syncCoversBackup({ status: 'offline', lastSyncedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() })).toBe(false);
    expect(syncCoversBackup({ status: 'idle' })).toBe(false);
  });
});

describe('erase', () => {
  async function erasedWithEngineMissing(clearState: boolean) {
    await seed(store, ['A']);
    const first = engine();
    await first.check({ pushNow: true });
    first.stop(); // the engine isn't there when Erase runs (still being built, or its client failed to load)
    if (clearState) forgetSyncBeforeErase(null, state);
    await store.eraseAll();
    const next = engine(); // the next launch
    await next.check({ pushNow: true });
    await next.syncNow();
    return next;
  }

  it('forgets the sync state even with no engine, so the next launch pushes nothing', async () => {
    const next = await erasedWithEngineMissing(true);
    expect(state.value).toBeNull();
    expect(remote.commits).toHaveLength(1);
    expect(remote.row?.revision).toBe(1);
    expect(next.getState().status).toBe('needs-confirm');
  });

  it('even if the sync state survived (storage lost), an empty home is never pushed over the account', async () => {
    const next = await erasedWithEngineMissing(false);
    expect(state.value?.revision).toBe(1);
    expect(remote.commits).toHaveLength(1);
    expect(remote.row?.revision).toBe(1);
    expect(remote.objects.has(remote.row!.objectPath)).toBe(true);
    expect(next.getState().status).toBe('needs-confirm');
    expect(store.getSnapshot().tasks).toHaveLength(0);
  });
});

/** A browser's lock manager, enough for one name at a time. */
class FakeLocks implements LockApi {
  private held = new Set<string>();
  private waiting = new Map<string, Array<() => void>>();
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>) {
    return new Promise<unknown>((resolve, reject) => {
      const run = () => {
        this.held.add(name);
        callback()
          .then(resolve, reject)
          .finally(() => {
            this.held.delete(name);
            this.waiting.get(name)?.shift()?.();
          });
      };
      if (!this.held.has(name)) return run();
      const queue = this.waiting.get(name) ?? [];
      const entry = () => run();
      queue.push(entry);
      this.waiting.set(name, queue);
      options.signal?.addEventListener('abort', () => {
        const at = queue.indexOf(entry);
        if (at >= 0) queue.splice(at, 1);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }
}

/** Channels that deliver to every other channel of the same hub, like tabs of one browser. */
class FakeHub {
  channels = new Set<ChannelLike>();
  create(): ChannelLike {
    const hub = this;
    const channel: ChannelLike = {
      onmessage: null,
      postMessage(message) {
        for (const other of hub.channels) if (other !== channel) queueMicrotask(() => other.onmessage?.({ data: message }));
      },
      close() {
        hub.channels.delete(channel);
      },
    };
    this.channels.add(channel);
    return channel;
  }
}

describe('two tabs on one device', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' });
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('only one tab syncs, and the other takes over when it closes', async () => {
    await seed(store, ['A']);
    const locks = new FakeLocks();
    const a = engine({ locks, createChannel: () => null });
    const b = engine({ locks, createChannel: () => null });
    a.start();
    b.start();
    await a.syncNow();
    expect(a.getState().status).toBe('in-sync');
    expect(remote.commits).toHaveLength(1);

    // The follower never touches the account, even when asked to.
    await store.put('tasks', task('t9', 'Edited'));
    await b.check({ pushNow: true });
    await b.syncNow();
    expect(remote.commits).toHaveLength(1);

    // The leader's tab closes; the follower takes over and saves the edit.
    a.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await b.syncNow();
    expect(remote.commits).toHaveLength(2);
    expect(b.getState().status).toBe('in-sync');
    b.stop();
  });

  it('a tab that was behind reads the other tab’s writes and does not push its stale copy', async () => {
    const name = `homebase-two-tabs-${Date.now()}`;
    const storeA = new HomeStore(await createDatabase(name));
    const storeB = new HomeStore(await createDatabase(name));
    await storeA.load();
    await storeB.load();
    await seed(storeA, ['Shared']);
    await storeB.load();

    const hub = new FakeHub();
    const make = (s: HomeStore) => new SyncEngine({ store: s, remote, userId: USER, deviceId: 'dev-a', deviceLabel: 'Mac', deliverFile: deliver, syncState: state, random: () => `r${remote.commits.length}xxxxxx`.slice(0, 8), locks: null, createChannel: () => hub.create() });
    const a = make(storeA);
    const b = make(storeB);
    a.start();
    b.start();
    await a.syncNow();
    expect(remote.row?.revision).toBe(1);
    await b.check();
    expect(b.getState().status).toBe('in-sync');

    // Tab A edits and saves. Tab B still holds the old snapshot in memory.
    await storeA.put('tasks', task('t9', 'Edited in tab A'));
    await a.syncNow();
    expect(remote.row?.revision).toBe(2);
    const savedPath = remote.row!.objectPath;

    // Tab B is switched away from and saves what it has. It must have read tab A's edit first.
    await b.check({ pushNow: true });
    await b.check({ pushNow: true });
    expect(remote.commits).toHaveLength(2);
    expect(remote.row?.objectPath).toBe(savedPath);
    expect(remote.objects.has(savedPath)).toBe(true);
    expect(storeB.getSnapshot().tasks.map((t) => t.name)).toContain('Edited in tab A');
    a.stop();
    b.stop();
  });
});

describe('a second tab’s status', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' });
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the syncing tab instead of staying on its launch state', async () => {
    await seed(store, ['A']);
    const locks = new FakeLocks();
    const hub = new FakeHub();
    const a = engine({ locks, createChannel: () => hub.create() });
    const b = engine({ locks, createChannel: () => hub.create() });
    a.start();
    b.start();
    await a.syncNow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(b.getState().status).toBe('in-sync');
    expect(b.getState().lastSyncedAt).toBe(a.getState().lastSyncedAt);
    a.stop();
    b.stop();
  });
});
