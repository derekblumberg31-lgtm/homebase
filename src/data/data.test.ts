import { describe, expect, it } from 'vitest';
import { buildBackup, parseHomebaseBackup, readBackup } from './backup';
import { createDatabase } from './db';
import { HomeStore } from './store';
import type { Task } from './types';

let counter = 0;
async function freshStore() {
  counter += 1;
  const store = new HomeStore(await createDatabase(`homebase-test-${counter}`));
  await store.load();
  return store;
}

const sampleTask: Task = {
  id: 'task-1',
  kind: 'maintenance',
  name: 'Clean the gutters',
  typeId: 'gutters',
  location: 'Front and back',
  lastDoneAt: '2026-09-01',
  intervalDays: 180,
  recurring: true,
  status: 'open',
  cost: 150,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('HomeStore', () => {
  it('persists rows across a reload', async () => {
    const name = 'homebase-persist';
    const first = new HomeStore(await createDatabase(name));
    await first.load();
    await first.put('tasks', sampleTask);
    await first.saveProperty({ nickname: 'Maple Street' });

    const second = new HomeStore(await createDatabase(name));
    await second.load();
    expect(second.getSnapshot().tasks).toEqual([sampleTask]);
    expect(second.getSnapshot().property?.nickname).toBe('Maple Street');
  });

  it('replaces rows by id and removes them', async () => {
    const store = await freshStore();
    await store.put('tasks', sampleTask);
    await store.put('tasks', { ...sampleTask, name: 'Clean gutters and downspouts' });
    expect(store.getSnapshot().tasks).toHaveLength(1);
    expect(store.getSnapshot().tasks[0].name).toBe('Clean gutters and downspouts');
    await store.remove('tasks', sampleTask.id);
    expect(store.getSnapshot().tasks).toHaveLength(0);
  });

  it('keeps the newest activity first', async () => {
    const store = await freshStore();
    await store.log('task-added', 'Added A');
    await store.log('task-done', 'Did A');
    expect(store.getSnapshot().activity.map((a) => a.text)).toEqual(['Did A', 'Added A']);
  });
});

describe('backup', () => {
  it('round-trips data and attached files', async () => {
    const store = await freshStore();
    await store.put('tasks', sampleTask);
    const file = await store.saveFile(new Blob(['receipt text'], { type: 'text/plain' }), 'receipt.txt');
    const text = await buildBackup(store.getSnapshot(), await store.allFiles());

    const parsed = readBackup(text);
    expect(parsed).not.toBeNull();
    const { data, files } = parseHomebaseBackup(parsed!);
    const restored = await freshStore();
    await restored.replaceAll(data, files);

    expect(restored.getSnapshot().tasks).toEqual([sampleTask]);
    const back = await restored.getFile(file.id);
    expect(await back!.data.text()).toBe('receipt text');
  });

  it('rejects files that are not backups', () => {
    expect(readBackup('not json')).toBeNull();
    expect(readBackup(JSON.stringify({ hello: 'world' }))).toBeNull();
    expect(readBackup(JSON.stringify({ app: 'replacely', filters: [] }))).toBeNull();
  });
});
