import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VERSION, buildBackup } from '../data/backup';
import type { HomeStore } from '../data/store';
import type { Task } from '../data/types';
import { freshStore } from '../test/freshStore';
import { canonicalHash } from './docHash';
import type { CloudRemote, CommitArgs, RemoteHeadRow } from './remote';
import { MAX_SYNC_BYTES, NEWER_VERSION_MESSAGE, NOT_SAVED_MESSAGE, SyncEngine, type SyncStateStore } from './syncEngine';

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

  private guard() {
    if (this.offline) throw new Error('offline');
  }
  async head() {
    this.guard();
    return this.row;
  }
  async download(path: string) {
    this.guard();
    const text = this.objects.get(path);
    if (text === undefined) throw new Error('missing');
    return text;
  }
  async upload(path: string, text: string) {
    this.guard();
    this.uploads.push(path);
    this.objects.set(path, text);
  }
  async commit(args: CommitArgs) {
    this.guard();
    this.commits.push(args);
    this.beforeCommit?.();
    const current = this.row?.revision ?? 0;
    if (current !== args.expected) return null;
    this.row = { revision: current + 1, objectPath: args.newPath, backupVersion: args.backupVersion, sizeBytes: args.sizeBytes, deviceId: args.deviceId, deviceLabel: args.deviceLabel, updatedAt: new Date().toISOString() };
    return current + 1;
  }
  async remove(paths: string[]) {
    this.removed.push(...paths);
    for (const p of paths) this.objects.delete(p);
  }
  async deleteAccount() {
    this.objects.clear();
    this.row = null;
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

    expect(await e.undoPull()).toBe(true);
    expect(store.getSnapshot()).toEqual(beforeData);
    expect(await canonicalHash(store.getSnapshot(), await store.allFiles())).toBe(beforeHash);
    e.stop();
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
