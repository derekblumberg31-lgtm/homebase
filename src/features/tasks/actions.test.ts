import { describe, expect, it } from 'vitest';
import type { Task } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { completeTask } from './actions';

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Clean the gutters',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-10-27',
  intervalDays: 365,
  recurring: true,
  status: 'open',
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  ...over,
});

describe('completeTask', () => {
  it('clears the first-due date and records no previous date when last done was unknown', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10' });
    await store.put('tasks', planned);

    const { undo } = await completeTask(store, planned, { date: '2026-10-27' });
    const saved = store.getSnapshot().tasks.find((t) => t.id === 't1')!;
    expect(saved.dueDate).toBeUndefined();
    expect(saved.lastDoneAt).toBe('2026-10-27');
    const event = store.getSnapshot().serviceEvents[0];
    expect(event.previousDoneAt).toBeUndefined();

    await undo();
    const restored = store.getSnapshot().tasks.find((t) => t.id === 't1')!;
    expect(restored.dueDate).toBe('2026-11-10');
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
  });

  it('keeps the previous date when last done was recorded', async () => {
    const store = await freshStore();
    const known = task({ lastDoneAt: '2026-06-01' });
    await store.put('tasks', known);
    await completeTask(store, known, { date: '2026-10-27' });
    expect(store.getSnapshot().serviceEvents[0].previousDoneAt).toBe('2026-06-01');
  });

  it('undo restores a recurring task and removes the event and the activity entry', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(true);
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });

  it('closes a one-off task, and undo reopens it cleanly', async () => {
    const store = await freshStore();
    const original = task({ recurring: false, kind: 'repair' });
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')!.status).toBe('done');
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });

  it('removes the activity entry on undo when last done was unknown', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10' });
    await store.put('tasks', planned);
    const { undo } = await completeTask(store, planned, { date: '2026-10-27' });
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')!.dueDate).toBe('2026-11-10');
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });
});
