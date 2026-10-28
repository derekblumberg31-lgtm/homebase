import { describe, expect, it } from 'vitest';
import { buildBackup, detectBackup, importKeyFinder, importReplacely, parseHomebaseBackup } from './backup';
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

    const detected = detectBackup(text);
    expect(detected?.kind).toBe('homebase');
    const { data, files } = parseHomebaseBackup(detected!.parsed);
    const restored = await freshStore();
    await restored.replaceAll(data, files);

    expect(restored.getSnapshot().tasks).toEqual([sampleTask]);
    const back = await restored.getFile(file.id);
    expect(await back!.data.text()).toBe('receipt text');
  });

  it('brings in a Replacely backup with its completion history', () => {
    const replacely = JSON.stringify({
      app: 'replacely',
      version: 2,
      exportedAt: '2026-10-26T00:00:00.000Z',
      filters: [
        {
          id: 'f1',
          name: 'Swap the HVAC filter',
          typeId: 'hvac-service',
          location: 'Hallway return',
          installedAt: '2026-08-01',
          lifespanDays: 90,
          cost: 24,
          history: [{ id: 'h1', replacedAt: '2026-08-01', previousInstalledAt: '2026-05-01', note: 'MERV 11' }],
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        { id: 'sample-1', name: 'Sample', location: 'x', installedAt: '2026-01-01', lifespanDays: 30 },
        { id: 'bad', name: 'Broken', location: 'x', installedAt: 'not-a-date', lifespanDays: 30 },
      ],
    });
    const detected = detectBackup(replacely);
    expect(detected?.kind).toBe('replacely');
    const result = importReplacely(detected!.parsed);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ id: 'f1', lastDoneAt: '2026-08-01', intervalDays: 90, recurring: true, cost: 24 });
    expect(result.serviceEvents[0]).toMatchObject({ taskId: 'f1', date: '2026-08-01', previousDoneAt: '2026-05-01', notes: 'MERV 11' });
  });

  it('brings in a KeyFinder backup as key items', () => {
    const keyfinder = JSON.stringify({
      app: 'KeyFinder',
      version: 1,
      exportedAt: '2026-10-26T00:00:00.000Z',
      keys: [
        {
          id: 'k1',
          label: 'Back door',
          notes: 'Back door and garage',
          brand: 'Kwikset',
          keyway: 'KW1',
          type: 'house',
          flags: { dnd: false, transponder: false },
          idSource: 'user',
          ocrTokens: ['KW1'],
          captures: [{ id: 'c1', at: 1, photo: 'data:image/jpeg;base64,AAAA', top: [0.1, 0.2] }],
          createdAt: 1761436800000,
        },
        { id: 'broken', label: 'No captures' },
      ],
    });
    const detected = detectBackup(keyfinder);
    expect(detected?.kind).toBe('keyfinder');
    const { items } = importKeyFinder(detected!.parsed);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'k1', kind: 'key', name: 'Back door', brand: 'Kwikset' });
    expect(items[0].key).toMatchObject({ keyway: 'KW1', idSource: 'user', captures: [{ id: 'c1' }] });
  });

  it('rejects files that are not backups', () => {
    expect(detectBackup('not json')).toBeNull();
    expect(detectBackup(JSON.stringify({ hello: 'world' }))).toBeNull();
  });
});
